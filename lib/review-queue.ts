import type { Course } from './workspace-types';
import type { Note } from './knowledge';
import type { ReviewPlan } from './review-plans';
export type QueueItem = {
  key: string;
  kind: 'note' | 'question' | 'task';
  title: string;
  courseId: string;
  date: string;
  minutes: number;
  noteId?: string;
  questionId?: string;
  tasks: { planId: string; taskId: string }[];
};
export function learningQueue(
  courses: Course[],
  notes: Note[],
  plans: ReviewPlan[],
  today: string,
  snoozes: Record<string, string> = {},
) {
  const owners = new Set(courses.filter((c) => !c.deletedAt).map((c) => c.id));
  const activeNotes = notes.filter(
    (n) =>
      !n.deletedAt &&
      (n.courseId
        ? owners.has(n.courseId)
        : courses.some((c) => !c.deletedAt && c.name === n.course)),
  );
  const map = new Map<string, QueueItem>();
  for (const n of activeNotes)
    if (n.reviewAt && n.reviewAt <= today)
      map.set(`note:${n.id}`, {
        key: `note:${n.id}`,
        kind: 'note',
        title: n.reviewQuestion || n.title,
        noteId: n.id,
        courseId: n.courseId ?? courses.find((c) => c.name === n.course)!.id,
        date: n.reviewAt,
        minutes: 5,
        tasks: [],
      });
  for (const plan of plans.filter(
    (p) => !p.deletedAt && owners.has(p.courseId),
  ))
    for (const task of plan.tasks.filter((t) => !t.done && t.date <= today)) {
      const question = courses
        .find((c) => c.id === plan.courseId)
        ?.studyLab?.practice?.questions.find(
          (q) =>
            q.id === task.questionId && !q.deletedAt && q.status === 'ready',
        );
      if (task.questionId && !question) continue;
      const note =
        task.noteIds.length === 1
          ? activeNotes.find((n) => n.id === task.noteIds[0])
          : undefined;
      if (!question && task.noteIds.length === 1 && !note) continue;
      const key = question
        ? `question:${plan.courseId}:${question.id}`
        : note
          ? `note:${note.id}`
          : `task:${plan.id}:${task.id}`;
      const old = map.get(key);
      if (old) {
        old.tasks.push({ planId: plan.id, taskId: task.id });
        old.date = [old.date, task.date].sort()[0];
        old.minutes = Math.max(old.minutes, task.minutes);
      } else
        map.set(key, {
          key,
          kind: question ? 'question' : note ? 'note' : 'task',
          title: question?.prompt ?? note?.title ?? task.title,
          questionId: question?.id,
          noteId: note?.id,
          courseId: plan.courseId,
          date: task.date,
          minutes: task.minutes,
          tasks: [{ planId: plan.id, taskId: task.id }],
        });
    }
  return [...map.values()]
    .filter((i) => !snoozes[i.key] || snoozes[i.key] <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
export function finishDueTasks(
  plans: ReviewPlan[],
  kind: 'note' | 'question',
  id: string,
  courseId: string,
  today: string,
) {
  return plans.map((p) =>
    p.deletedAt || p.courseId !== courseId
      ? p
      : {
          ...p,
          tasks: p.tasks.map((t) =>
            !t.done &&
            t.date <= today &&
            (kind === 'question'
              ? t.questionId === id
              : !t.questionId && t.noteIds.length === 1 && t.noteIds[0] === id)
              ? { ...t, done: true }
              : t,
          ),
        },
  );
}
export function budgetQueue(items: QueueItem[], minutes: number) {
  let used = 0;
  return items.filter((item) => {
    if (used + item.minutes > minutes) return false;
    used += item.minutes;
    return true;
  });
}
