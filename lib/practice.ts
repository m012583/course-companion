import type { Evidence } from './knowledge';
import { localDate } from './knowledge';
import { addDays, type ReviewPlan } from './review-plans';
import type { LearningCheck } from './learning-check';

export type PracticeQuestion = {
  id: string;
  version: number;
  kind: 'choice' | 'boolean';
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  term: string;
  chapterId: string;
  evidence: Evidence[];
  source: 'manual' | 'ai' | 'demo';
  status: 'draft' | 'ready';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  originId?: string;
};
export type PracticeAttempt = {
  id: string;
  questionId: string;
  questionVersion: number;
  question: PracticeQuestion;
  answer: number;
  correct: boolean;
  createdAt: string;
  reason?: string;
  planId?: string;
};
export type PracticeState = {
  questions: PracticeQuestion[];
  attempts: PracticeAttempt[];
};
export const emptyPractice = (): PracticeState => ({
  questions: [],
  attempts: [],
});
export function validateQuestion(q: PracticeQuestion) {
  if (
    !q ||
    typeof q.id !== 'string' ||
    !q.id ||
    !Number.isInteger(q.version) ||
    q.version < 1 ||
    !['choice', 'boolean'].includes(q.kind) ||
    !['draft', 'ready'].includes(q.status) ||
    !['manual', 'ai', 'demo'].includes(q.source) ||
    typeof q.prompt !== 'string' ||
    !q.prompt.trim() ||
    q.prompt.length > 2000 ||
    typeof q.term !== 'string' ||
    !q.term.trim() ||
    q.term.length > 100 ||
    typeof q.chapterId !== 'string' ||
    typeof q.explanation !== 'string' ||
    q.explanation.length > 5000 ||
    !Array.isArray(q.options) ||
    q.options.length !== (q.kind === 'boolean' ? 2 : 4) ||
    q.options.some(
      (o) => typeof o !== 'string' || !o.trim() || o.length > 500,
    ) ||
    new Set(q.options.map((o) => o.trim())).size !== q.options.length ||
    !Number.isInteger(q.correct) ||
    q.correct < 0 ||
    q.correct >= q.options.length ||
    typeof q.createdAt !== 'string' ||
    typeof q.updatedAt !== 'string' ||
    !Array.isArray(q.evidence) ||
    q.evidence.some(
      (e) =>
        !e ||
        ['id', 'name', 'section', 'quote'].some(
          (k) => typeof e[k as keyof Evidence] !== 'string',
        ),
    )
  )
    throw new Error('请填写题目、知识点、不重复的选项和有效答案。');
  return q;
}
export function validatePractice(value: unknown): PracticeState {
  const p = value as PracticeState;
  if (
    !p ||
    !Array.isArray(p.questions) ||
    !Array.isArray(p.attempts) ||
    p.questions.length > 5000 ||
    p.attempts.length > 20000
  )
    throw new Error('练习数据格式或数量无效。');
  const ids = new Set<string>();
  for (const q of p.questions) {
    validateQuestion(q);
    if (ids.has(q.id)) throw new Error('题目标识重复。');
    ids.add(q.id);
  }
  const attemptIds = new Set<string>();
  for (const a of p.attempts) {
    if (
      !a ||
      typeof a.id !== 'string' ||
      attemptIds.has(a.id) ||
      !ids.has(a.questionId) ||
      !a.question ||
      a.question.id !== a.questionId ||
      a.question.version !== a.questionVersion ||
      typeof a.createdAt !== 'string' ||
      !Number.isInteger(a.answer) ||
      a.answer < 0 ||
      a.answer >= a.question.options?.length ||
      a.correct !== (a.answer === a.question.correct) ||
      (a.reason !== undefined &&
        (typeof a.reason !== 'string' || a.reason.length > 500))
    )
      throw new Error('作答记录无效。');
    validateQuestion(a.question);
    attemptIds.add(a.id);
  }
  return p;
}
export function answerQuestion(
  q: PracticeQuestion,
  answer: number,
): PracticeAttempt {
  validateQuestion(q);
  if (
    q.deletedAt ||
    q.status !== 'ready' ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer >= q.options.length
  )
    throw new Error('请确认题目后选择一个答案。');
  return {
    id: crypto.randomUUID(),
    questionId: q.id,
    questionVersion: q.version,
    question: structuredClone(q),
    answer,
    correct: answer === q.correct,
    createdAt: new Date().toISOString(),
  };
}
export function checkToDrafts(
  check: LearningCheck,
  current: PracticeQuestion[],
  chapters: { id: string; keyConcepts: string[] }[],
) {
  return check.questions
    .filter((q) => !current.some((p) => p.originId === `${check.id}:${q.id}`))
    .map((q) => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        version: 1,
        kind: 'choice' as const,
        prompt: q.prompt,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        term: q.term,
        chapterId:
          chapters.find((c) => c.keyConcepts.includes(q.term))?.id ?? '',
        evidence: check.evidence.filter((e) => q.sourceIds.includes(e.id)),
        source: check.source,
        status: 'draft' as const,
        createdAt: now,
        updatedAt: now,
        originId: `${check.id}:${q.id}`,
      };
    });
}
export function latestAttempt(state: PracticeState, id: string) {
  return state.attempts.filter((a) => a.questionId === id).at(-1);
}
export function weakTerms(state: PracticeState) {
  const active = new Set(
    state.questions
      .filter((q) => !q.deletedAt && q.status === 'ready')
      .map((q) => q.id),
  );
  const map = new Map<
    string,
    { term: string; total: number; wrong: number; pending: number }
  >();
  for (const a of state.attempts.filter((a) => active.has(a.questionId))) {
    const row = map.get(a.question.term) ?? {
      term: a.question.term,
      total: 0,
      wrong: 0,
      pending: 0,
    };
    row.total++;
    if (!a.correct) row.wrong++;
    map.set(row.term, row);
  }
  for (const q of state.questions.filter((q) => active.has(q.id))) {
    const a = latestAttempt(state, q.id);
    if (a && !a.correct) {
      const row = map.get(a.question.term);
      if (row) row.pending++;
    }
  }
  return [...map.values()]
    .filter((r) => r.wrong)
    .sort((a, b) => b.pending - a.pending || b.wrong - a.wrong);
}
export function planFromAttempt(
  a: PracticeAttempt,
  course: { id: string; name: string },
): ReviewPlan {
  const now = new Date().toISOString(),
    date = localDate();
  return {
    id: `practice-plan-${a.id}`,
    courseId: course.id,
    title: `${course.name} · ${a.question.term}`,
    goal: `依据作答 ${a.id}：${a.question.prompt}`,
    startDate: date,
    endDate: addDays(date, a.correct ? 4 : 2),
    dailyMinutes: 20,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    tasks: [0, a.correct ? 4 : 2].map((day, i) => ({
      id: `${a.id}-${i}`,
      title: `${i ? '重做并解释' : '回看原文'}：${a.question.prompt}`.slice(
        0,
        160,
      ),
      date: addDays(date, day),
      minutes: 10,
      noteIds: [],
      questionId: a.questionId,
      done: false,
    })),
  };
}
