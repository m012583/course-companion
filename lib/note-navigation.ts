import type { Note } from './knowledge';

export type WikiReference = {
  target: string;
  label: string;
  start: number;
  end: number;
};

// Preserve character offsets while ignoring code, math and escaped brackets.
function referenceText(text: string) {
  return text.replace(
    /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[^\n]*(?:\n|$)|(?![\s\S])))|(`+)[^`]*?\3|\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\[/gm,
    (match) => match.replace(/[^\n]/g, ' '),
  );
}

export function wikiReferences(text = ''): WikiReference[] {
  const refs: WikiReference[] = [];
  const pattern = /\[\[([^[\]\n]+)\]\]/g;
  for (const match of referenceText(text).matchAll(pattern)) {
    const [target, ...alias] = match[1].split('|');
    if (!target.trim()) continue;
    refs.push({
      target: target.trim(),
      label: alias.join('|').trim() || target.trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return refs;
}

const normalized = (value: string) =>
  value.trim().normalize('NFKC').toLocaleLowerCase();

export function resolveWikiReference(
  target: string,
  notes: Note[],
  source?: Note,
) {
  const byId = notes.find((n) => !n.deletedAt && n.id === target);
  if (byId) return byId;
  const matches = notes.filter(
    (n) => !n.deletedAt && normalized(n.title ?? '') === normalized(target),
  );
  if (matches.length === 1) return matches[0];
  // A repeated title in another course must never link arbitrarily.
  const inCourse = source
    ? matches.filter((n) =>
        source.courseId
          ? n.courseId === source.courseId
          : n.course === source.course,
      )
    : [];
  return inCourse.length === 1 ? inCourse[0] : undefined;
}

export function outgoingNoteIds(note: Note, notes: Note[]) {
  if (note.deletedAt) return [];
  const existing = new Set(notes.filter((n) => !n.deletedAt).map((n) => n.id));
  return [
    ...new Set([
      ...(note.relatedIds ?? []),
      ...wikiReferences(note.text).map(
        (ref) => resolveWikiReference(ref.target, notes, note)?.id,
      ),
    ]),
  ].filter((id): id is string => !!id && id !== note.id && existing.has(id));
}

export function noteConnections(note: Note, notes: Note[]) {
  const outgoing = new Set(outgoingNoteIds(note, notes));
  return {
    outgoing: notes.filter((n) => outgoing.has(n.id)),
    incoming: notes.filter(
      (n) => n.id !== note.id && outgoingNoteIds(n, notes).includes(note.id),
    ),
    unresolved: wikiReferences(note.text).filter(
      (ref) => !resolveWikiReference(ref.target, notes, note),
    ),
  };
}

export function searchKnowledge(notes: Note[], query: string) {
  const words = normalized(query).split(/\s+/).filter(Boolean);
  return notes
    .filter((note) => !note.deletedAt)
    .map((note) => {
      const title = normalized(note.title);
      const meta = normalized(
        `${note.course} ${note.chapter ?? ''} ${(note.tags ?? []).join(' ')}`,
      );
      const body = normalized(note.text);
      let score = 0;
      for (const word of words) {
        if (title === word) score += 100;
        else if (title.startsWith(word)) score += 60;
        else if (title.includes(word)) score += 40;
        else if (meta.includes(word)) score += 20;
        else if (body.includes(word)) score += 5;
        else return { note, score: -1 };
      }
      return { note, score };
    })
    .filter((item) => item.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (
          b.note.lastOpenedAt ??
          b.note.updatedAt ??
          b.note.createdAt
        ).localeCompare(
          a.note.lastOpenedAt ?? a.note.updatedAt ?? a.note.createdAt,
        ),
    )
    .map((item) => item.note);
}

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  position?: { start: { line: number } };
  data?: { hProperties?: Record<string, unknown> };
  children?: MarkdownNode[];
};

// Both rendering and graph discovery use the same resolver; never create notes
// or call an AI service just because text contains a reference.
export function remarkNoteLinks(options: { notes: Note[]; source: Note }) {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (
        [
          'code',
          'inlineCode',
          'link',
          'linkReference',
          'image',
          'html',
          'math',
          'inlineMath',
        ].includes(node.type)
      )
        return;
      if (node.type === 'heading' && node.position) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id: `note-heading-${node.position.start.line}`,
          },
        };
      }
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const result: MarkdownNode[] = [];
        let end = 0;
        for (const ref of wikiReferences(child.value)) {
          result.push({
            type: 'text',
            value: child.value.slice(end, ref.start),
          });
          const target = resolveWikiReference(
            ref.target,
            options.notes,
            options.source,
          );
          result.push(
            target
              ? {
                  type: 'link',
                  url: `#note-ref=${encodeURIComponent(target.id)}`,
                  children: [{ type: 'text', value: ref.label }],
                }
              : { type: 'text', value: child.value.slice(ref.start, ref.end) },
          );
          end = ref.end;
        }
        result.push({ type: 'text', value: child.value.slice(end) });
        return result;
      });
    }
    visit(tree);
  };
}
