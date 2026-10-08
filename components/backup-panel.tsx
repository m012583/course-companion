'use client';
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { parseBackup } from '@/lib/backup';
export default function BackupPanel({
  onExport,
  onRestore,
  onDemo,
  disabled,
}: {
  onExport: () => Promise<unknown>;
  onRestore: (backup: unknown, allowMissing: boolean) => Promise<void>;
  onDemo: () => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    data: unknown;
    name: string;
    courses: number;
    notes: number;
    files: number;
    missing: number;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [allowMissing, setAllowMissing] = useState(false),
    [message, setMessage] = useState('');
  async function exportAll() {
    setBusy(true);
    setError('');
    try {
      const data = await onExport();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `课伴迁移包-${new Date().toISOString().slice(0, 10)}.kb.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('迁移包已下载，包含正文、记录和原始附件。');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '导出失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="backup-panel">
      <h3>完整迁移与恢复</h3>
      <p className="muted">
        增强版独立保存。迁移包包含原始附件与校验值，最多 50 MB 附件；不含 API
        密钥。
      </p>
      <div className="actions">
        <button disabled={busy || disabled} onClick={() => void exportAll()}>
          <Download size={16} />
          导出含附件迁移包
        </button>
        <button
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          选择备份恢复
        </button>
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept=".json,application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setError('');
          setPending(null);
          setAllowMissing(false);
          try {
            if (file.size > 80_000_000) throw new Error('备份超过 80 MB。');
            const data = JSON.parse(await file.text());
            const parsed = parseBackup(data);
            setPending({
              data,
              name: file.name,
              courses: parsed.state.courses.length,
              notes: parsed.state.notes.length,
              files: parsed.files.length,
              missing: parsed.missing.length,
            });
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : '无法读取备份。');
          }
        }}
      />
      {pending && (
        <div className="backup-confirm">
          <strong>{pending.name}</strong>
          <p>
            {pending.courses} 门课程 · {pending.notes} 篇笔记 · {pending.files}{' '}
            个附件
          </p>
          <p>
            将替换增强版当前数据，原版不受影响。请先导出当前增强版的迁移包留档。
          </p>
          {pending.missing > 0 && (
            <label className="lab-checkline">
              <input
                type="checkbox"
                checked={allowMissing}
                onChange={(e) => setAllowMissing(e.target.checked)}
              />
              旧备份未包含 {pending.missing}{' '}
              个原始附件，我确认仅恢复文字及记录。
            </label>
          )}
          <div className="actions">
            <button disabled={busy} onClick={() => setPending(null)}>
              取消
            </button>
            <button
              className="primary"
              disabled={
                busy || disabled || (!!pending.missing && !allowMissing)
              }
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onRestore(pending.data, allowMissing);
                  setPending(null);
                  setMessage('恢复完成，附件与记录已校验。');
                } catch (issue) {
                  setError(
                    issue instanceof Error ? issue.message : '恢复失败。',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认恢复到增强版
            </button>
          </div>
        </div>
      )}
      <button disabled={busy || disabled} onClick={onDemo}>
        添加示例课程 · 无需 AI
      </button>
      {busy && <output>正在校验和迁移，请保持页面打开…</output>}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && <output>{message}</output>}
    </section>
  );
}
