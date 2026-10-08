'use client';
import { useState } from 'react';
import type { Evidence } from '@/lib/knowledge';
import type { CitationReview } from '@/lib/learning-feedback';
export default function CitationFeedback({
  evidence,
  claim,
  reviews,
  onSave,
  disabled,
}: {
  evidence: Evidence;
  claim: string;
  reviews: CitationReview[];
  onSave: (r: CitationReview) => void;
  disabled: boolean;
}) {
  const [verdict, setVerdict] = useState<CitationReview['verdict']>('supports'),
    [comment, setComment] = useState(''),
    [correction, setCorrection] = useState(''),
    [saved, setSaved] = useState(false);
  const history = reviews.filter(
    (r) =>
      r.evidence.fileId === evidence.fileId &&
      r.evidence.name === evidence.name &&
      r.evidence.quote === evidence.quote,
  );
  return (
    <details className="citation-feedback">
      <summary>核对引用 · {history.length} 条记录</summary>
      {claim ? (
        <blockquote>{claim.slice(0, 1500)}</blockquote>
      ) : (
        <p>未关联具体回答；本次记录对该原文片段的核对意见。</p>
      )}
      <label>
        你的判断
        <select
          value={verdict}
          onChange={(e) => {
            setVerdict(e.target.value as CitationReview['verdict']);
            setSaved(false);
          }}
        >
          <option value="supports">支持这段内容</option>
          <option value="partial">仅部分支持</option>
          <option value="mismatch">引用不符</option>
        </select>
      </label>
      <label>
        核对说明
        <textarea
          maxLength={2000}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved(false);
          }}
          placeholder="具体哪句话需要核对？"
        />
      </label>
      <label>
        修正建议
        <textarea
          maxLength={2000}
          value={correction}
          onChange={(e) => {
            setCorrection(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button
        disabled={
          disabled || saved || (verdict !== 'supports' && !comment.trim())
        }
        onClick={() => {
          onSave({
            id: crypto.randomUUID(),
            evidence: structuredClone(evidence),
            claim: claim.slice(0, 4000),
            verdict,
            comment: comment.trim(),
            correction: correction.trim(),
            updatedAt: new Date().toISOString(),
          });
          setSaved(true);
        }}
      >
        保存核对记录
      </button>
      {saved && <output> 已保存</output>}
      <p className="muted small">
        这是你的人工核对记录；不会自动替换原回答或证明其正确性。
      </p>
      {history
        .slice(-5)
        .reverse()
        .map((r) => (
          <p key={r.id}>
            {new Date(r.updatedAt).toLocaleString()} ·{' '}
            {
              { supports: '支持', partial: '部分支持', mismatch: '引用不符' }[
                r.verdict
              ]
            }{' '}
            · {r.comment}
            {r.correction && ` · 修正：${r.correction}`}
          </p>
        ))}
    </details>
  );
}
