import { z } from 'zod';
import type { Workspace } from './workspace';

const str = z.string();
const id = str.min(1).max(256);
const finite = z.number().finite();
const strings = z.array(str);
const evidence = z.object({
  id,
  name: str,
  fileId: id.optional(),
  page: finite.optional(),
  section: str,
  quote: str,
});
const graph = z.object({
  nodes: z.array(
    z.object({ id, label: str, description: str, quote: str.optional() }),
  ),
  edges: z.array(z.object({ id, from: str, to: str, label: str })),
  generatedAt: str,
  sourceFingerprint: str,
  edited: z.boolean().optional(),
});
const note = z.object({
  id,
  title: str,
  text: str,
  course: str,
  courseId: str.optional(),
  createdAt: str,
  updatedAt: str.optional(),
  mastery: str.optional(),
  reviewAt: str.optional(),
  sessionId: str.optional(),
  tags: strings.optional(),
  chapter: str.optional(),
  sources: z.array(evidence).optional(),
  reviewCount: finite.optional(),
  reviewQuestion: str.optional(),
  relatedIds: strings.optional(),
  relatedLabels: z.record(str).optional(),
  conceptGraph: graph.optional(),
  graphPositions: z.record(z.object({ x: finite, y: finite })).optional(),
  reviewHistory: z
    .array(
      z.object({
        at: str,
        answer: str,
        rating: z.enum(['again', 'hard', 'good']),
      }),
    )
    .optional(),
});
const material = z.object({
  name: str,
  type: str,
  size: str,
  status: str,
  content: str.optional(),
  fileId: id.optional(),
  chapter: str.optional(),
  passages: z
    .array(
      z.object({
        text: str,
        section: str,
        page: finite.optional(),
        start: finite.optional(),
      }),
    )
    .optional(),
  coverage: z
    .object({
      totalPages: finite.optional(),
      readPages: finite.optional(),
      emptyPages: finite.optional(),
      characters: finite,
      truncated: z.boolean(),
      legacy: z.boolean().optional(),
    })
    .optional(),
});
const message = z.object({
  incomplete: z.boolean().optional(),
  role: z.enum(['user', 'assistant']),
  text: str,
  sources: strings.optional(),
  evidence: z.array(evidence).optional(),
  retrieved: z.array(evidence).optional(),
  saved: z.boolean().optional(),
  scope: z
    .object({ selected: finite, matchedFiles: finite, passages: finite })
    .optional(),
});
const course = z.object({
  id,
  name: str.trim().min(1).max(60),
  code: str,
  materials: z.array(material),
  graphFocus: str,
  sessions: z.array(
    z.object({ id, title: str, messages: z.array(message), updatedAt: str }),
  ),
  teacher: str.optional(),
  semester: str.optional(),
  examDate: str.optional(),
  chapters: strings.optional(),
});
const task = z.object({
  id,
  title: str,
  kind: z.enum(['learn', 'review']),
  courseId: str.optional(),
  date: str.optional(),
  status: z.enum(['todo', 'done']),
  content: str.optional(),
  createdAt: str,
});
const schema = z.object({
  drafts: z.array(note).optional(),
  reading: z
    .object({
      courseId: str,
      materialKey: str,
      passage: z.number().int().min(0),
      updatedAt: str,
    })
    .optional(),
  courses: z.array(course),
  notes: z.array(note).default([]),
  tasks: z.array(task).optional(),
  courseId: str.optional(),
  sessionId: str.optional(),
  activeView: z
    .enum([
      'home',
      'course',
      'materials',
      'study',
      'knowledge',
      'graph',
      'review',
    ])
    .optional(),
  preferences: z
    .object({ brandName: str, userName: str, semester: str })
    .optional(),
  model: str.optional(),
  trash: z
    .array(
      z.object({
        id,
        kind: z.enum(['course', 'note', 'task', 'session', 'material']),
        ownerId: str.optional(),
        session: z
          .object({
            id,
            title: str,
            messages: z.array(message),
            updatedAt: str,
          })
          .optional(),
        material: material.optional(),
        title: str,
        deletedAt: str,
        course: course.optional(),
        notes: z.array(note),
        tasks: z.array(task),
        links: z.array(
          z.object({ id, relatedIds: strings, relatedLabels: z.record(str) }),
        ),
      }),
    )
    .optional(),
});
export function parseWorkspace(value: unknown): Workspace {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      `数据格式不正确：${result.error.issues[0]?.path.join('.')}`,
    );
  const state = result.data;
  for (const list of [
    state.courses,
    state.notes,
    state.drafts ?? [],
    state.tasks ?? [],
    state.trash ?? [],
    ...state.courses.map((c) => c.sessions),
  ]) {
    if (new Set(list.map((item) => item.id)).size !== list.length)
      throw new Error('数据包含重复标识');
  }
  for (const entry of state.trash ?? []) {
    if (entry.kind === 'task' && entry.tasks.length !== 1)
      throw new Error('回收站任务数据不完整');
    if (entry.kind === 'session' && (!entry.session || !entry.ownerId))
      throw new Error('回收站对话数据不完整');
    if (entry.kind === 'material' && (!entry.material || !entry.ownerId))
      throw new Error('回收站资料数据不完整');
    if (entry.kind === 'course' && !entry.course)
      throw new Error('回收站课程数据不完整');
    if (entry.kind === 'note' && entry.notes.length !== 1)
      throw new Error('回收站笔记数据不完整');
    for (const list of [
      entry.notes,
      entry.tasks,
      entry.course?.sessions ?? [],
    ]) {
      if (new Set(list.map((item) => item.id)).size !== list.length)
        throw new Error('回收站包含重复标识');
    }
  }
  if (JSON.stringify(state).length > 8_000_000)
    throw new Error('知识库正文超过 8 MB 限制');
  return state;
}
