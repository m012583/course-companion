import {
  retrieve,
  splitPassages,
  type Evidence,
  type Material,
} from './knowledge';

// A small, explicit course glossary. This is deterministic term expansion, not
// a vector model. Model-generated rewrites are supplied separately by the server.
export const CONCEPT_ALIASES: Record<string, string[]> = {
  矩阵乘法: ['先做一个变换再做另一个', '连续两次线性变换', '变换复合'],
  特征向量: ['变换后方向不变', '只伸缩不转向', '方向保持不变'],
  特征值: ['伸缩倍数', '方向上的缩放比例'],
  矩阵的秩: ['独立信息有多少', '独立的列有几列', '线性无关列的个数'],
  线性方程组: ['多个方程一起求解', '方程有没有解'],
  条件概率: ['已知一件事发生', '给定条件下的概率'],
  独立事件: ['两件事互不影响', '发生概率互不影响'],
};
export function glossaryTerms(question: string) {
  return Object.entries(CONCEPT_ALIASES)
    .filter(
      ([term, aliases]) =>
        question.includes(term) ||
        aliases.some((alias) => question.includes(alias)),
    )
    .map(([term]) => term);
}
function tokens(text: string) {
  const lower = text.toLowerCase();
  return [
    ...new Set([
      ...(lower.match(/[a-z0-9_]{2,}/g) ?? []),
      ...[...lower.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(([word]) =>
        Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)),
      ),
    ]),
  ].filter(
    (word) =>
      ![
        '什么',
        '怎么',
        '如何',
        '这个',
        '一个',
        '为什么',
        '解释',
        '请问',
        '的是',
        '中的',
      ].includes(word),
  );
}
export function rankEvidence(
  question: string,
  materials: Material[],
  rewrites: string[] = [],
  limit = 8,
): Evidence[] {
  const rows = materials
    .filter((m) => !m.deletedAt)
    .flatMap((material) =>
      (material.passages?.length
        ? material.passages
        : splitPassages(material.content ?? '')
      )
        .filter((p) => p.text.trim())
        .map((passage) => ({ material, passage, terms: tokens(passage.text) })),
    );
  if (!rows.length) return [];
  const original = tokens(question);
  const expanded = tokens([...glossaryTerms(question), ...rewrites].join(' '));
  const query = [...new Set([...original, ...expanded])];
  const df = new Map(
    query.map((term) => [
      term,
      rows.filter((r) => r.terms.includes(term)).length,
    ]),
  );
  const avg =
    rows.reduce((sum, row) => sum + row.terms.length, 0) / rows.length || 1;
  const ranked = rows
    .map((row) => {
      const score = query.reduce((sum, term) => {
        const frequency = row.passage.text.toLowerCase().split(term).length - 1;
        if (!frequency) return sum;
        const idf = Math.log(
          1 +
            (rows.length - (df.get(term) ?? 0) + 0.5) /
              ((df.get(term) ?? 0) + 0.5),
        );
        const weight = original.includes(term) ? 1 : 0.8;
        return (
          sum +
          (weight * idf * frequency * 2.2) /
            (frequency + 1.2 * (0.25 + (0.75 * row.terms.length) / avg))
        );
      }, 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length)
    return retrieve(question, materials, 14000).slice(0, limit);
  const seen = new Set<string>();
  const result: Evidence[] = [];
  let chars = 0;
  for (const { material, passage } of ranked) {
    const key = `${material.fileId || material.name}|${passage.page}|${passage.text}`;
    if (seen.has(key)) continue;
    if (chars + passage.text.length > 14000) continue;
    seen.add(key);
    chars += passage.text.length;
    result.push({
      id: `S${result.length + 1}`,
      name: material.name,
      fileId: material.fileId,
      page: passage.page,
      section: passage.section,
      quote: passage.text,
    });
    if (result.length >= limit) break;
  }
  return result;
}
export function readMaterials(raw: unknown): Material[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error('每次最多读取 100 份资料。');
  if (JSON.stringify(raw).length > 6_000_000)
    throw new Error('资料过多，请缩小范围。');
  return raw
    .map((m) => {
      if (!m || typeof m.name !== 'string' || m.name.length > 250)
        throw new Error('资料格式无效。');
      if (
        m.passages !== undefined &&
        (!Array.isArray(m.passages) ||
          m.passages.length > 12000 ||
          m.passages.some(
            (p: { text?: unknown; section?: unknown; page?: unknown }) =>
              !p ||
              typeof p.text !== 'string' ||
              p.text.length > 20000 ||
              typeof p.section !== 'string' ||
              (p.page !== undefined &&
                (!Number.isInteger(p.page) || Number(p.page) < 1)),
          ))
      )
        throw new Error('资料片段格式无效。');
      return {
        ...m,
        content: typeof m.content === 'string' ? m.content : '',
        passages: m.passages ?? [],
      } as Material;
    })
    .filter((m) => !m.deletedAt);
}
export function cleanCitations(answer: string, evidence: Evidence[]) {
  const ids = new Set(evidence.map((e) => e.id));
  return answer.replace(/\[(S\d+)\]/g, (label, id: string) =>
    ids.has(id) ? label : '[无对应原文]',
  );
}
