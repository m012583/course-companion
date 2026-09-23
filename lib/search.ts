import type { Workspace, ViewId } from './workspace';
export type SearchHit = {
  key: string;
  kind: string;
  title: string;
  course: string;
  excerpt: string;
  view: ViewId;
  courseId?: string;
  note?: string;
  file?: string;
  session?: string;
  task?: string;
};
export function searchWorkspace(state: Workspace, input: string): SearchHit[] {
  const terms = input.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  function add(hit: SearchHit, text: string) {
    const full = `${hit.title} ${hit.course} ${text}`.toLocaleLowerCase();
    if (!terms.every((term) => full.includes(term))) return;
    const index = Math.max(0, text.toLocaleLowerCase().indexOf(terms[0]));
    hits.push({
      ...hit,
      excerpt: text.slice(Math.max(0, index - 30), index + 130),
    });
  }
  for (const c of state.courses) {
    add(
      {
        key: `c:${c.id}`,
        kind: '课程',
        title: c.name,
        course: c.name,
        excerpt: '',
        view: 'study',
        courseId: c.id,
      },
      `${c.code} ${c.teacher ?? ''}`,
    );
    for (const m of c.materials)
      add(
        {
          key: `m:${c.id}:${m.fileId ?? m.name}`,
          kind: '资料',
          title: m.name,
          course: c.name,
          excerpt: '',
          view: 'materials',
          courseId: c.id,
          file: m.fileId ?? m.name,
        },
        `${m.chapter ?? ''} ${m.content ?? ''} ${(m.passages ?? []).map((p) => p.text).join('\n')}`,
      );
    for (const s of c.sessions)
      add(
        {
          key: `s:${s.id}`,
          kind: '对话',
          title: s.title,
          course: c.name,
          excerpt: '',
          view: 'study',
          courseId: c.id,
          session: s.id,
        },
        s.messages.map((m) => m.text).join('\n'),
      );
  }
  for (const n of state.notes)
    add(
      {
        key: `n:${n.id}`,
        kind: '笔记',
        title: n.title,
        course: n.course,
        excerpt: '',
        view: 'knowledge',
        courseId: n.courseId,
        note: n.id,
      },
      `${n.chapter ?? ''} ${(n.tags ?? []).join(' ')} ${n.text}`,
    );
  for (const t of state.tasks ?? [])
    add(
      {
        key: `t:${t.id}`,
        kind: '任务',
        title: t.title,
        course:
          state.courses.find((c) => c.id === t.courseId)?.name ?? '未关联课程',
        excerpt: '',
        view: 'review',
        task: t.id,
      },
      `${t.date ?? ''} ${t.content ?? ''}`,
    );
  return hits.sort((a, b) => a.kind.localeCompare(b.kind)).slice(0, 80);
}
