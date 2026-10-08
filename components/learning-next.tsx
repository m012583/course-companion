'use client';
import type { Course } from '@/lib/workspace-types';
import { latestAttempt } from '@/lib/practice';

export default function LearningNext({
  courses,
  onRead,
  onPractice,
}: {
  courses: Course[];
  onRead: (course: Course) => void;
  onPractice: (course: Course, questionId?: string) => void;
}) {
  const recent = courses
    .filter(
      (c) =>
        c.reading &&
        !c.deletedAt &&
        c.materials.some(
          (m) =>
            !m.deletedAt &&
            (c.reading?.fileId
              ? m.fileId === c.reading.fileId
              : m.name === c.reading?.name),
        ),
    )
    .sort((a, b) =>
      b.reading!.updatedAt.localeCompare(a.reading!.updatedAt),
    )[0];
  const wrong = courses.flatMap((c) => {
    const state = c.studyLab?.practice;
    return state
      ? state.questions
          .filter(
            (q) =>
              !q.deletedAt &&
              q.status === 'ready' &&
              latestAttempt(state, q.id)?.correct === false,
          )
          .map((q) => ({
            course: c,
            question: q,
            attempt: latestAttempt(state, q.id)!,
          }))
      : [];
  });
  const drafts = courses.flatMap((c) =>
    (c.studyLab?.practice?.questions ?? [])
      .filter((q) => !q.deletedAt && q.status === 'draft')
      .map((q) => ({ course: c, question: q })),
  );
  return (
    <section className="learning-next" aria-label="下一步学习">
      <article className="panel">
        <h3>{recent ? '继续教材阅读' : '从教材开始'}</h3>
        <p>
          {recent
            ? `${recent.name} · ${recent.reading!.name} · 第 ${recent.reading!.passage + 1} 段`
            : '选择课程教材，再带着问题阅读和练习。'}
        </p>
        {courses[0] && (
          <button
            className="primary"
            onClick={() => onRead(recent ?? courses[0])}
          >
            {recent ? '继续阅读' : '打开教材'}
          </button>
        )}
      </article>
      <article className="panel">
        <h3>
          {wrong.length
            ? `${wrong.length} 道错题待巩固`
            : drafts.length
              ? `${drafts.length} 道题目待核对`
              : '检查本章理解'}
        </h3>
        <p>
          {wrong[0]
            ? `${wrong[0].question.term} · ${wrong[0].attempt.reason || '尚未记录错因'}。建议先回看原文再练习。`
            : drafts[0]
              ? '核对题目、答案和教材依据后，即可开始练习。'
              : '完成章节自测，积累实际作答记录。样本不足时不推断掌握度。'}
        </p>
        {courses[0] && (
          <button
            onClick={() =>
              onPractice(
                wrong[0]?.course ?? drafts[0]?.course ?? courses[0],
                wrong[0]?.question.id ?? drafts[0]?.question.id,
              )
            }
          >
            {wrong.length
              ? '打开错题'
              : drafts.length
                ? '核对题目'
                : '开始自测'}
          </button>
        )}
      </article>
    </section>
  );
}
