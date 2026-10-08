import type { Evidence, Material } from './knowledge';
import type { GuideChapter } from './course-guide';
import type { LearningCheck } from './learning-check';
import {
  checkToDrafts,
  emptyPractice,
  type PracticeState,
  type PracticeAttempt,
} from './practice';
import type { CalibrationConfig } from './textbook-calibration';

export type StudyLabState = {
  calibration?: CalibrationConfig;
  checks?: LearningCheck[];
  practice?: PracticeState;
  flow?: { chapterId: string; checkId: string; updatedAt: string };
};
export type LearningCourse = {
  id: string;
  name: string;
  materials: Material[];
  guide?: { chapters: GuideChapter[] };
  studyLab?: StudyLabState;
};
export type ReadingPosition = {
  fileId?: string;
  name: string;
  passage: number;
  updatedAt: string;
};

// One atomic workspace update stores the generated check and its drafts.
// A repeated import must not revive deleted questions or duplicate attempts.
export function attachCheck(
  state: StudyLabState | undefined,
  check: LearningCheck,
  chapters: GuideChapter[],
  chapterId: string,
): StudyLabState {
  const practice = state?.practice ?? emptyPractice();
  const drafts = checkToDrafts(check, practice.questions, chapters).map(
    (q) => ({
      ...q,
      chapterId: chapterId || q.chapterId,
    }),
  );
  return {
    ...state,
    checks: [check, ...(state?.checks ?? []).filter((c) => c.id !== check.id)],
    practice: { ...practice, questions: [...practice.questions, ...drafts] },
    flow: { chapterId, checkId: check.id, updatedAt: new Date().toISOString() },
  };
}

export function practiceAdvice(attempt: PracticeAttempt): string {
  if (attempt.correct)
    return '这次答对了。稍后不看答案再解释一次，检查是否能独立回忆。';
  const advice: Record<string, string> = {
    概念不清: '先回看教材中的定义和适用条件，再用自己的话解释后重练。',
    计算错误: '列出计算步骤，逐步检查符号、单位或矩阵维度，再做同类题。',
    审题失误: '圈出题目条件，说明每个条件如何影响答案，再重练。',
    记忆不牢: '先合上资料回忆关键结论，再对照原文，并安排两天后复习。',
  };
  return (
    advice[attempt.reason ?? ''] ??
    '先记录错因，再核对原文，选择重新讲解或同类练习。'
  );
}

export function readingEvidence(material: Material, index: number): Evidence {
  const passage = material.passages?.[index];
  return {
    id: 'R1',
    name: material.name,
    fileId: material.fileId,
    section: passage?.section ?? '正文',
    page: passage?.page,
    quote: (passage?.text ?? material.content ?? '').slice(0, 4000),
  };
}
