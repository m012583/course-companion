import type { Note } from './knowledge';

export type ConceptNode = {
  id: string;
  label: string;
  description: string;
  quote?: string;
};
export type ConceptEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};
export type ConceptGraph = {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  generatedAt: string;
  sourceFingerprint: string;
  edited?: boolean;
};
export type NodePosition = { x: number; y: number };
export function noteFingerprint(title: string, text: string) {
  const content = `${title}\n${text}`;
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++)
    hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  return `${content.length}-${(hash >>> 0).toString(16)}`;
}
export function parseConceptGraph(
  raw: string,
  title: string,
  text: string,
): ConceptGraph {
  const value = JSON.parse(
    raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  ) as { nodes?: unknown; edges?: unknown };
  if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges))
    throw new Error('模型没有返回完整图谱，请重试。');
  if (
    value.nodes.length < 2 ||
    value.nodes.length > 10 ||
    value.edges.length > 18
  )
    throw new Error('图谱节点数量不符合要求，请重试。');
  const ids = new Set<string>();
  const nodes: ConceptNode[] = value.nodes.map((n: unknown) => {
    if (!n || typeof n !== 'object') throw new Error('图谱节点格式无效');
    const item = n as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.label !== 'string' ||
      !item.label.trim()
    )
      throw new Error('图谱节点名称或标识无效');
    ids.add(item.id);
    return {
      id: item.id,
      label: item.label.trim().slice(0, 36),
      description:
        typeof item.description === 'string'
          ? item.description.slice(0, 800)
          : '',
      quote:
        typeof item.quote === 'string' &&
        item.quote.trim() &&
        text.includes(item.quote.trim())
          ? item.quote.trim()
          : undefined,
    };
  });
  if (!ids.has('root')) throw new Error('图谱缺少中心概念，请重试。');
  const pairs = new Set<string>();
  const edges: ConceptEdge[] = value.edges.map((e: unknown, index: number) => {
    if (!e || typeof e !== 'object') throw new Error('图谱关系格式无效');
    const item = e as Record<string, unknown>;
    if (
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      !ids.has(item.from) ||
      !ids.has(item.to) ||
      item.from === item.to ||
      typeof item.label !== 'string' ||
      !item.label.trim()
    )
      throw new Error('图谱关系指向无效节点');
    const key = `${item.from}\0${item.to}`;
    if (pairs.has(key)) throw new Error('图谱包含重复关系');
    pairs.add(key);
    return {
      id: `edge-${index}`,
      from: item.from,
      to: item.to,
      label: item.label.trim().slice(0, 24),
    };
  });
  const reached = new Set(['root']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (reached.has(e.from) || reached.has(e.to)) {
        const before = reached.size;
        reached.add(e.from);
        reached.add(e.to);
        if (reached.size > before) changed = true;
      }
    }
  }
  if (reached.size !== nodes.length)
    throw new Error('图谱存在孤立概念，请重新生成。');
  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: noteFingerprint(title, text),
  };
}
export function relatedGraph(note: Note, notes: Note[]) {
  const related = notes.filter(
    (n) =>
      n.id !== note.id &&
      (note.relatedIds?.includes(n.id) || n.relatedIds?.includes(note.id)),
  );
  return {
    nodes: [
      { id: note.id, label: note.title, description: note.text },
      ...related.map((n) => ({
        id: n.id,
        label: n.title,
        description: n.text,
      })),
    ],
    edges: related.map((n) => ({
      id: `related-${n.id}`,
      from: note.relatedIds?.includes(n.id) ? note.id : n.id,
      to: note.relatedIds?.includes(n.id) ? n.id : note.id,
      label:
        note.relatedLabels?.[n.id] || n.relatedLabels?.[note.id] || '已关联',
    })),
  };
}
