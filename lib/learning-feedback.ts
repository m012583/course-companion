import type { Evidence } from './knowledge';
export type CitationReview = {
  id: string;
  evidence: Evidence;
  claim: string;
  verdict: 'supports' | 'partial' | 'mismatch';
  comment: string;
  correction: string;
  updatedAt: string;
};
export type RetellingFeedback = {
  covered: string[];
  missing: string[];
  issues: string[];
  sourceIds: string[];
};
export type Retelling = {
  id: string;
  prompt: string;
  answer: string;
  evidence: Evidence[];
  createdAt: string;
  feedback?: RetellingFeedback;
  assessment?: 'understood' | 'needs-work';
  correction?: string;
};
export function parseRetellingFeedback(
  raw: string,
  evidence: Evidence[],
): RetellingFeedback {
  const data = JSON.parse(
    raw.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''),
  );
  for (const k of ['covered', 'missing', 'issues', 'sourceIds'])
    if (
      !Array.isArray(data[k]) ||
      data[k].length > 10 ||
      data[k].some(
        (x: unknown) => typeof x !== 'string' || !x.trim() || x.length > 800,
      )
    )
      throw new Error('AI 返回的核对格式无效，请重试或自行对照原文。');
  if (
    !data.sourceIds.length ||
    data.sourceIds.some((id: string) => !evidence.some((e) => e.id === id))
  )
    throw new Error('AI 使用了无效的原文编号。');
  return {
    covered: data.covered,
    missing: data.missing,
    issues: data.issues,
    sourceIds: data.sourceIds,
  };
}
