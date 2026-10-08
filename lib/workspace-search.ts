import type { Course } from './workspace-types';
import type { Note } from './knowledge';
export type SearchHit = {
  id: string;
  kind: '课程' | '笔记' | '教材' | '练习' | '回答';
  title: string;
  excerpt: string;
  courseId: string;
  courseName: string;
  noteId?: string;
  file?: string;
  passage?: number;
  questionId?: string;
  sessionId?: string;
  message?: number;
};
export function searchWorkspace(
  courses: Course[],
  notes: Note[],
  query: string,
  kind = '全部',
  owner = '',
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  const add = (hit: SearchHit, content: string) => {
    if (kind !== '全部' && kind !== hit.kind) return;
    const haystack = `${hit.title} ${content}`.toLocaleLowerCase();
    if (!words.every((w) => haystack.includes(w))) return;
    const text = content.replace(/\s+/g, ' ');
    const at = words.length ? text.toLocaleLowerCase().indexOf(words[0]) : 0;
    const start = Math.max(0, at - 35);
    hits.push({
      ...hit,
      excerpt: `${start ? '…' : ''}${text.slice(start, start + 150)}`,
    });
  };
  for (const course of courses.filter(
    (c) => !c.deletedAt && (!owner || c.id === owner),
  )) {
    const common = { courseId: course.id, courseName: course.name };
    add(
      {
        ...common,
        id: `course:${course.id}`,
        kind: '课程',
        title: course.name,
        excerpt: '',
      },
      course.code,
    );
    for (const note of notes.filter(
      (n) =>
        !n.deletedAt &&
        (n.courseId ? n.courseId === course.id : n.course === course.name),
    ))
      add(
        {
          ...common,
          id: `note:${note.id}`,
          kind: '笔记',
          title: note.title,
          noteId: note.id,
          excerpt: '',
        },
        `${note.text} ${(note.tags ?? []).join(' ')} ${note.chapter ?? ''}`,
      );
    // Avoid filling an empty palette with every paragraph in a textbook.
    if (!words.length) continue;
    for (const m of course.materials.filter((m) => !m.deletedAt)) {
      const passages = m.passages?.length
        ? m.passages
        : [{ section: '正文', text: m.content ?? '' }];
      passages.forEach((p, i) =>
        add(
          {
            ...common,
            id: `material:${course.id}:${m.fileId ?? m.name}:${i}`,
            kind: '教材',
            title: `${m.name} · ${p.section}`,
            file: m.fileId ?? m.name,
            passage: i,
            excerpt: '',
          },
          p.text,
        ),
      );
    }
    for (const q of course.studyLab?.practice?.questions ?? [])
      if (!q.deletedAt)
        add(
          {
            ...common,
            id: `question:${course.id}:${q.id}`,
            kind: '练习',
            title: q.prompt,
            questionId: q.id,
            excerpt: '',
          },
          `${q.term} ${q.options.join(' ')} ${q.explanation}`,
        );
    for (const s of course.sessions.filter((s) => !s.deletedAt))
      s.messages.forEach((m, i) => {
        if (m.role === 'assistant' && !m.deletedAt)
          add(
            {
              ...common,
              id: `message:${course.id}:${s.id}:${i}`,
              kind: '回答',
              title: s.title,
              sessionId: s.id,
              message: i,
              excerpt: '',
            },
            m.text,
          );
      });
  }
  return hits;
}
