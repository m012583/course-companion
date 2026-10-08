import type { Evidence, Material, Passage } from './knowledge';
export function textVersion(text: string) {
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
export function sourceAnchor(material: Material, passage: Passage) {
  return {
    passageId: textVersion(
      `${passage.section}|${passage.page ?? ''}|${passage.text}`,
    ),
    materialVersion: textVersion(
      material.passages
        ?.map((p) => `${p.section}|${p.page ?? ''}|${p.text}`)
        .join('\n') ||
        material.content ||
        '',
    ),
  };
}
export function locateSource(source: Evidence, materials: Material[]) {
  const candidates = materials.filter((m) =>
    source.fileId ? m.fileId === source.fileId : m.name === source.name,
  );
  if (candidates.length !== 1) return { status: 'missing' as const };
  const material = candidates[0];
  const passages = material.passages?.length
    ? material.passages
    : [{ text: material.content ?? '', section: '正文' }];
  const passage = passages.find(
    (p) =>
      p.text.includes(source.quote) &&
      (source.page === undefined || source.page === p.page),
  );
  const version = textVersion(
    material.passages
      ?.map((p) => `${p.section}|${p.page ?? ''}|${p.text}`)
      .join('\n') ||
      material.content ||
      '',
  );
  return {
    material,
    passage,
    status: !passage
      ? ('changed' as const)
      : material.deletedAt
        ? ('deleted' as const)
        : source.materialVersion && source.materialVersion !== version
          ? ('updated' as const)
          : ('found' as const),
  };
}
