import type { CourseGuide } from './course-guide';
import { splitPassages, type Evidence, type Material } from './knowledge';
import { rankEvidence } from './retrieval';
export type CalibrationConfig = {
  materialKeys: string[];
  toc: string;
  updatedAt: string;
};
export const materialId = (m: Material) => m.fileId || m.name;
export function extractHeadings(materials: Material[]) {
  const found: string[] = [];
  for (const m of materials) {
    const text = m.content || m.passages?.map((p) => p.text).join('\n') || '';
    for (const raw of text.split(/\r?\n/)) {
      const line = raw
        .trim()
        .replace(/\s*[.·…]{2,}\s*\d+\s*$/, '')
        .replace(/^#{1,6}\s*/, '');
      if (
        line.length >= 3 &&
        line.length <= 65 &&
        /^(?:第[一二三四五六七八九十百\d]+[章节]|\d+(?:\.\d+){0,2}[、.\s])/.test(
          line,
        )
      )
        found.push(line);
    }
  }
  return [...new Set(found)].slice(0, 80);
}
const normalize = (s: string) =>
  s
    .replace(
      /^第[一二三四五六七八九十百\d]+[章节]\s*|^\d+(?:\.\d+)*[、.\s]*/,
      '',
    )
    .replace(/[\s：:，,、()（）]/g, '')
    .toLowerCase();
export function calibrate(
  guide: CourseGuide,
  materials: Material[],
  toc: string,
) {
  const headings = toc
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 80);
  const rows = guide.chapters.flatMap((chapter) =>
    chapter.keyConcepts.map((term) => {
      const evidence = rankEvidence(term, materials, [], 3);
      const direct = evidence.filter((e) =>
        normalize(e.quote).includes(normalize(term)),
      );
      return {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        term,
        status: direct.length
          ? ('found' as const)
          : evidence.length
            ? ('possible' as const)
            : ('missing' as const),
        evidence: direct.length ? direct : evidence,
      };
    }),
  );
  const unmatchedHeadings = headings.filter(
    (heading) =>
      !guide.chapters.some((ch) => {
        const h = normalize(heading),
          title = normalize(ch.title);
        return (
          h.includes(title) ||
          title.includes(h) ||
          ch.keyConcepts.some((term) => h.includes(normalize(term)))
        );
      }),
  );
  const partial = materials.some(
    (m) =>
      !m.coverage ||
      m.coverage.truncated ||
      m.coverage.emptyPages ||
      m.coverage.legacy,
  );
  return {
    rows,
    unmatchedHeadings,
    partial,
    headings,
    found: rows.filter((r) => r.status === 'found').length,
  };
}
export function sourcePassagesForChapter(
  title: string,
  concepts: string[],
  materials: Material[],
): Evidence[] {
  const sources = concepts.flatMap((term) =>
    rankEvidence(term, materials, [], 2),
  );
  const seen = new Set<string>();
  let chars = 0;
  return [...sources, ...rankEvidence(title, materials, [], 2)]
    .filter((e) => {
      const key = `${e.fileId || e.name}|${e.page}|${e.quote}`;
      if (seen.has(key) || chars + e.quote.length > 12000) return false;
      seen.add(key);
      chars += e.quote.length;
      return true;
    })
    .slice(0, 10)
    .map((e, i) => ({ ...e, id: `S${i + 1}` }));
}
export function contentFingerprint(materials: Material[]) {
  let hash = 2166136261;
  for (const char of materials
    .map(
      (m) =>
        `${m.name}|${(m.passages?.length ? m.passages : splitPassages(m.content ?? '')).map((p) => `${p.section}|${p.page ?? ''}|${p.text}`).join('\n')}`,
    )
    .join('|'))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
