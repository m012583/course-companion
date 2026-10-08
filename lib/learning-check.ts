import { localDate, type Evidence } from './knowledge';
import { addDays, type ReviewPlan } from './review-plans';

export type CheckQuestion = {
  id: string;
  term: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  sourceIds: string[];
};
export type LearningCheck = {
  id: string;
  createdAt: string;
  source: 'ai' | 'demo';
  questions: CheckQuestion[];
  evidence: Evidence[];
  answers?: number[];
  submittedAt?: string;
  planId?: string;
  deletedAt?: string;
};
export function parseCheck(
  raw: string,
  terms: string[],
  evidence: Evidence[],
): CheckQuestion[] {
  const parsed = JSON.parse(
    raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim(),
  ) as { questions?: unknown };
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 2)
    throw new Error('模型需要完整返回两道诊断题，请重试。');
  const ids = new Set(evidence.map((e) => e.id));
  const questions = parsed.questions.map((q) => {
    if (
      !q ||
      !terms.includes(q.term) ||
      typeof q.prompt !== 'string' ||
      !q.prompt.trim() ||
      q.prompt.length > 500 ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      q.options.some(
        (v: unknown) => typeof v !== 'string' || !v.trim() || v.length > 250,
      ) ||
      new Set(q.options).size !== 4 ||
      !Number.isInteger(q.correct) ||
      q.correct < 0 ||
      q.correct > 3 ||
      typeof q.explanation !== 'string' ||
      !q.explanation.trim() ||
      q.explanation.length > 1000 ||
      !Array.isArray(q.sourceIds) ||
      !q.sourceIds.length ||
      q.sourceIds.some((id: unknown) => typeof id !== 'string' || !ids.has(id))
    )
      throw new Error('诊断题或引用校验失败，未保存不完整结果。');
    return {
      id: crypto.randomUUID(),
      term: q.term,
      prompt: q.prompt,
      options: q.options,
      correct: q.correct,
      explanation: q.explanation,
      sourceIds: [...new Set(q.sourceIds)],
    } as CheckQuestion;
  });
  if (
    new Set(questions.map((q) => q.term)).size !==
    Math.min(2, new Set(terms).size)
  )
    throw new Error('两道题需要覆盖不同知识点。');
  return questions;
}
export function checkResult(check: LearningCheck, answers: number[]) {
  if (
    answers.length !== check.questions.length ||
    answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)
  )
    throw new Error('请完成每一道题。');
  const incorrect = check.questions.filter((q, i) => q.correct !== answers[i]);
  return {
    correct: check.questions.length - incorrect.length,
    incorrect,
    terms: [...new Set(incorrect.map((q) => q.term))],
  };
}
export function planFromCheck(
  check: LearningCheck,
  course: { id: string; name: string },
  date = localDate(),
): ReviewPlan {
  const result = checkResult(check, check.answers ?? []);
  const terms = result.terms.length
    ? result.terms
    : check.questions.map((q) => q.term);
  const now = new Date().toISOString();
  return {
    id: `check-plan-${check.id}`,
    courseId: course.id,
    title: `${course.name} · 自测后复习`,
    goal: `根据 ${check.createdAt.slice(0, 10)} 的两道自测题安排；仅反映本次题目表现。`,
    startDate: date,
    endDate: addDays(date, 2),
    dailyMinutes: 30,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    tasks: terms.flatMap((term, index) => [
      {
        id: `${check.id}-${index}-read`,
        title: `回看原文并用自己的话解释：${term}`,
        date,
        minutes: 10,
        noteIds: [],
        done: false,
      },
      {
        id: `${check.id}-${index}-recall`,
        title: `不看资料回忆并举例：${term}`,
        date: addDays(date, 2),
        minutes: 10,
        noteIds: [],
        done: false,
      },
    ]),
  };
}
