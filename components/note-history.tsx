'use client';
import { useState } from 'react';
import type { Note } from '@/lib/knowledge';
import LearningMarkdown from './learning-markdown';
export default function NoteHistory({
  note,
  onRestore,
  disabled,
}: {
  note: Note;
  onRestore: (id: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(''),
    [confirm, setConfirm] = useState(false);
  const version = note.versions?.find((v) => v.id === selected);
  return (
    <details className="note-history">
      <summary>笔记历史 · {note.versions?.length ?? 0} 个版本</summary>
      <p className="muted small">
        每次进入编辑前保存快照，最多保留最近 20 个版本。恢复前会保存当前内容。
      </p>
      <label>
        选择历史版本
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setConfirm(false);
          }}
        >
          <option value="">请选择</option>
          {note.versions?.map((v) => (
            <option key={v.id} value={v.id}>
              {new Date(v.createdAt).toLocaleString()} · {v.title}
            </option>
          ))}
        </select>
      </label>
      {version && (
        <>
          <div className="note-version-compare">
            <section>
              <h3>历史内容</h3>
              <h4>{version.title}</h4>
              <LearningMarkdown text={version.text} />
              <small>
                {version.chapter} · {version.tags.join('、')}
              </small>
            </section>
            <section>
              <h3>当前内容</h3>
              <h4>{note.title}</h4>
              <LearningMarkdown text={note.text} />
              <small>
                {note.chapter} · {note.tags?.join('、')}
              </small>
            </section>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            已比较内容，确认恢复此版本
          </label>
          <button
            disabled={disabled || !confirm}
            onClick={() => {
              onRestore(version.id);
              setConfirm(false);
            }}
          >
            恢复此版本
          </button>
        </>
      )}
    </details>
  );
}
