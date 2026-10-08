'use client';
import { useState, useRef, useEffect } from 'react';
import {
  readingEvidence,
  type LearningCourse,
  type StudyLabState,
} from '@/lib/learning-flow';
import { sourceAnchor } from '@/lib/source-anchor';
import type { Retelling } from '@/lib/learning-feedback';
import type { Evidence } from '@/lib/knowledge';
export default function RetellingPanel({
  course,
  onChange,
  onSource,
  disabled,
  aiReady,
  onSetup,
}: {
  course: LearningCourse;
  onChange: (s: StudyLabState) => void;
  onSource: (e: Evidence) => void;
  disabled: boolean;
  aiReady: boolean;
  onSetup: () => void;
}) {
  const materials = course.materials.filter(
    (m) => !m.deletedAt && (m.passages?.length || m.content),
  );
  const draft = course.studyLab?.retellingDraft ?? {
    file: '',
    passage: 0,
    answer: '',
  };
  const material =
    materials.find((m) => (m.fileId ?? m.name) === draft.file) ?? materials[0];
  const passages = material?.passages?.length
    ? material.passages
    : [{ section: '正文', text: material?.content ?? '' }];
  const index = Math.min(draft.passage, passages.length - 1),
    passage = passages[index];
  const records = course.studyLab?.retellings ?? [];
  const [active, setActive] = useState(records[0]?.id ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const record = records.find((r) => r.id === active);
  const latest = useRef(course);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    latest.current = course;
  }, [course]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (disabled) controller.current?.abort();
  }, [disabled]);
  function patchRecord(id: string, patch: Partial<Retelling>) {
    const state = latest.current.studyLab ?? {};
    onChange({
      ...state,
      retellings: (state.retellings ?? []).map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  }
  function save() {
    if (!material || !draft.answer.trim() || disabled) return;
    if (records.length >= 200) {
      setError('本课程已保存 200 次复述。请先导出备份，暂不新增。');
      return;
    }
    const row: Retelling = {
      id: crypto.randomUUID(),
      prompt: `请用自己的话解释「${passage.section}」，说明适用条件并举一个例子。`,
      answer: draft.answer.trim(),
      evidence: [
        {
          ...readingEvidence(material, index),
          ...sourceAnchor(material, passage),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    onChange({
      ...course.studyLab,
      retellings: [row, ...records],
      retellingDraft: {
        file: material.fileId ?? material.name,
        passage: index,
        answer: '',
      },
    });
    setActive(row.id);
    setError('');
  }
  async function check() {
    if (!record || !aiReady || busy) return;
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const r = await fetch('/api/retelling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        signal: abort.signal,
      });
      const data = (await r.json()) as {
        error?: string;
        feedback: NonNullable<Retelling['feedback']>;
      };
      if (!r.ok) throw new Error(data.error);
      if (!abort.signal.aborted)
        patchRecord(record.id, { feedback: data.feedback });
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : '核对失败');
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return (
    <section className="panel retelling-panel">
      <h2>用自己的话解释</h2>
      <p className="muted">
        先合上原文复述，再对照教材。回答会保存，AI 只提供待核对的建议。
      </p>
      {!materials.length ? (
        <p>请先添加可读取的教材。</p>
      ) : (
        <>
          <div className="search-filters">
            <label>
              复述教材
              <select
                disabled={disabled || !!draft.answer}
                value={material?.fileId ?? material?.name}
                onChange={(e) =>
                  onChange({
                    ...course.studyLab,
                    retellingDraft: {
                      file: e.target.value,
                      passage: 0,
                      answer: '',
                    },
                  })
                }
              >
                {materials.map((m) => (
                  <option key={m.fileId ?? m.name} value={m.fileId ?? m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              复述段落
              <select
                disabled={disabled || !!draft.answer}
                value={index}
                onChange={(e) =>
                  onChange({
                    ...course.studyLab,
                    retellingDraft: {
                      file: material.fileId ?? material.name,
                      passage: Number(e.target.value),
                      answer: '',
                    },
                  })
                }
              >
                {passages.map((p, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {p.section}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>解释「{passage.section}」，说明适用条件并举例。</p>
          <label>
            你的复述
            <textarea
              rows={5}
              maxLength={8000}
              value={draft.answer}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...course.studyLab,
                  retellingDraft: {
                    file: material.fileId ?? material.name,
                    passage: index,
                    answer: e.target.value,
                  },
                })
              }
            />
          </label>
          <button disabled={disabled || !draft.answer.trim()} onClick={save}>
            保存复述并查看原文
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!!records.length && (
        <label>
          已保存的复述
          <select
            value={active}
            onChange={(e) => {
              controller.current?.abort();
              setActive(e.target.value);
              setError('');
            }}
          >
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.createdAt).toLocaleString()} · {r.prompt}
              </option>
            ))}
          </select>
        </label>
      )}
      {record && (
        <div className="retelling-result">
          <h3>已保存的回答</h3>
          <p className="preserve-lines">{record.answer}</p>
          <h3>对照原文</h3>
          {record.evidence.map((e) => (
            <div key={e.id}>
              <blockquote>{e.quote}</blockquote>
              <button onClick={() => onSource(e)}>
                查看来源 · {e.section}
              </button>
            </div>
          ))}
          {!record.feedback &&
            (aiReady ? (
              <button disabled={disabled || busy} onClick={() => void check()}>
                {busy ? '正在核对…' : '请 AI 核对遗漏与错误'}
              </button>
            ) : (
              <button onClick={onSetup}>连接 AI 后核对</button>
            ))}
          {busy && (
            <button onClick={() => controller.current?.abort()}>
              取消核对
            </button>
          )}
          {record.feedback && (
            <>
              <p className="notice">
                AI 建议，请对照原文确认。此处不计算掌握分数。
              </p>
              {(
                [
                  ['covered', '已覆盖'],
                  ['missing', '可能遗漏'],
                  ['issues', '需要核对'],
                ] as const
              ).map(([k, label]) => (
                <section key={k}>
                  <h4>{label}</h4>
                  <ul>
                    {record.feedback![k].map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
          <label>
            你的核对结论
            <select
              value={record.assessment ?? ''}
              disabled={disabled}
              onChange={(e) =>
                patchRecord(record.id, {
                  assessment: e.target.value as Retelling['assessment'],
                })
              }
            >
              <option value="" disabled>
                请选择
              </option>
              <option value="understood">这次能够独立解释</option>
              <option value="needs-work">还需要回看与练习</option>
            </select>
          </label>
          <label>
            修正与补充
            <textarea
              value={record.correction ?? ''}
              disabled={disabled}
              maxLength={2000}
              onChange={(e) =>
                patchRecord(record.id, { correction: e.target.value })
              }
            />
          </label>
        </div>
      )}
    </section>
  );
}
