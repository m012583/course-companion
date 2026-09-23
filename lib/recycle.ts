import type { Workspace, TrashEntry } from './workspace';

export function recycleEntry(
  state: Workspace,
  kind: 'note' | 'course',
  targetId: string,
): TrashEntry {
  const course =
    kind === 'course'
      ? state.courses.find((c) => c.id === targetId)
      : undefined;
  const notes = state.notes.filter((n) =>
    kind === 'note'
      ? n.id === targetId
      : n.courseId
        ? n.courseId === targetId
        : n.course === course?.name,
  );
  if (kind === 'course' ? !course : notes.length !== 1)
    throw new Error('待删除内容不存在');
  const ids = new Set(notes.map((n) => n.id));
  return {
    id: crypto.randomUUID(),
    kind,
    title: course?.name ?? notes[0].title,
    deletedAt: new Date().toISOString(),
    course,
    notes,
    tasks:
      kind === 'course'
        ? (state.tasks ?? []).filter((t) => t.courseId === targetId)
        : [],
    links: state.notes
      .filter((n) => !ids.has(n.id) && n.relatedIds?.some((id) => ids.has(id)))
      .map((n) => ({
        id: n.id,
        relatedIds: n.relatedIds!.filter((id) => ids.has(id)),
        relatedLabels: Object.fromEntries(
          Object.entries(n.relatedLabels ?? {}).filter(([id]) => ids.has(id)),
        ),
      })),
  };
}
export function restoreEntry(state: Workspace, entryId: string): Workspace {
  const entry = state.trash?.find((t) => t.id === entryId);
  if (!entry) throw new Error('回收站内容不存在');
  if (entry.course && state.courses.some((c) => c.id === entry.course!.id))
    throw new Error('课程标识冲突，无法恢复');
  if (
    entry.notes.some((n) =>
      state.notes.some((current) => current.id === n.id),
    ) ||
    entry.tasks.some((t) => state.tasks?.some((current) => current.id === t.id))
  )
    throw new Error('笔记或任务标识冲突，无法恢复');
  const courses = entry.course
    ? [...state.courses, entry.course]
    : state.courses;
  if (
    entry.notes.some(
      (n) =>
        !courses.some((c) =>
          n.courseId ? c.id === n.courseId : c.name === n.course,
        ),
    )
  )
    throw new Error('请先恢复笔记所属课程');
  const ids = new Set([...state.notes, ...entry.notes].map((n) => n.id));
  const notes = [...state.notes, ...entry.notes].map((n) => {
    const link = entry.links.find((l) => l.id === n.id);
    return {
      ...n,
      relatedIds: [
        ...new Set([...(n.relatedIds ?? []), ...(link?.relatedIds ?? [])]),
      ].filter((id) => ids.has(id)),
      relatedLabels: Object.fromEntries(
        Object.entries({ ...link?.relatedLabels, ...n.relatedLabels }).filter(
          ([id]) => ids.has(id),
        ),
      ),
    };
  });
  return {
    ...state,
    courses,
    notes,
    tasks: [...(state.tasks ?? []), ...entry.tasks],
    trash: state.trash?.filter((t) => t.id !== entryId),
  };
}
