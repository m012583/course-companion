'use client';
import { useState } from 'react';
import type { Material, Passage } from '@/lib/knowledge';
export default function MaterialCorrection({
  material,
  disabled,
  onSave,
}: {
  material: Material;
  disabled: boolean;
  onSave: (passages: Passage[]) => void;
}) {
  const [editing, setEditing] = useState(false),
    [rows, setRows] = useState<Passage[]>([]),
    [error, setError] = useState('');
  return (
    <div className="material-correction">
      {!editing ? (
        <button
          disabled={disabled}
          onClick={() => {
            setRows(
              structuredClone(
                material.passages?.length
                  ? material.passages
                  : [{ text: material.content ?? '', section: '人工补充正文' }],
              ),
            );
            setEditing(true);
          }}
        >
          校正提取文字
        </button>
      ) : (
        <div className="panel practice-editor">
          <h3>核对并校正正文</h3>
          <p className="muted">
            只更新检索用文字；原文件和历史引用原文保留。校正后旧讲解可能需要复核。
          </p>
          {rows.map((p, i) => (
            <label key={i}>
              {p.page ? `第 ${p.page} 页 · ` : ''}
              {p.section}
              <textarea
                rows={4}
                value={p.text}
                maxLength={20000}
                onChange={(e) =>
                  setRows(
                    rows.map((r, j) =>
                      j === i ? { ...r, text: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
          ))}
          <div className="actions">
            <button onClick={() => setEditing(false)}>取消</button>
            <button
              disabled={disabled}
              onClick={() =>
                setRows([
                  ...rows,
                  { section: `人工补充 ${rows.length + 1}`, text: '' },
                ])
              }
            >
              补充一段
            </button>
            <button
              className="primary"
              disabled={disabled}
              onClick={() => {
                if (rows.reduce((n, p) => n + p.text.length, 0) > 400000) {
                  setError('正文最多 40 万字，请拆分资料。');
                  return;
                }
                if (!rows.some((p) => p.text.trim())) {
                  setError('请至少保留一段正文。');
                  return;
                }
                onSave(rows.filter((p) => p.text.trim()));
                setEditing(false);
                setError('');
              }}
            >
              确认校正并更新检索
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
