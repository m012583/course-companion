'use client';
import { useState } from 'react';
import { validateBackup, MAX_BACKUP_BYTES, type Backup } from '@/lib/backup';
import type { TrashEntry } from '@/lib/workspace';

export default function DataManagement({
  trash,
  run,
  restore,
  remove,
}: {
  trash: TrashEntry[];
  run: (backup?: Backup) => Promise<void>;
  restore: (id: string) => void;
  remove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [history, setHistory] = useState<{ id: string; createdAt: string }[]>(
    [],
  );
  const [permanent, setPermanent] = useState('');
  async function execute(backup?: Backup) {
    setBusy(true);
    setError('');
    try {
      await run(backup);
      setCandidate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="form-stack data-management"
      aria-label="数据管理"
      aria-busy={busy}
    >
      <h3>完整备份与恢复</h3>
      <p className="muted">
        包含课程、笔记、已暂存草稿、对话、任务、回收站及全部引用附件。单文件最多
        20 MB，附件总量最多 100 MB。备份含个人学习内容，请妥善保存。
      </p>
      <button disabled={busy} onClick={() => void execute()}>
        下载完整备份（含附件）
      </button>
      <label>
        选择完整备份文件
        <input
          type="file"
          accept=".json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            setCandidate(null);
            setError('');
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > MAX_BACKUP_BYTES)
                throw new Error('文件超过 150 MB');
              setCandidate(await validateBackup(JSON.parse(await file.text())));
            } catch (err) {
              setError(err instanceof Error ? err.message : '备份格式错误');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {candidate && (
        <div className="backup-preview">
          <strong>恢复预览</strong>
          <p>
            {candidate.state.courses.length} 门课程 ·{' '}
            {candidate.state.notes.length} 条笔记 ·{' '}
            {candidate.state.tasks?.length ?? 0} 个任务 ·{' '}
            {candidate.state.drafts?.length ?? 0} 条草稿 ·{' '}
            {candidate.files.length} 个附件 ·{' '}
            {candidate.state.trash?.length ?? 0} 项回收站内容
          </p>
          <p>
            这会替换当前工作区。恢复前自动保存当前数据快照，可从下方恢复历史下载。
          </p>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void execute(candidate)}
          >
            确认替换并恢复
          </button>
          <button disabled={busy} onClick={() => setCandidate(null)}>
            取消恢复
          </button>
        </div>
      )}
      <button
        disabled={busy}
        onClick={async () => {
          setError('');
          try {
            const response = await fetch('/api/backup?history=1');
            const data = (await response.json()) as {
              history?: typeof history;
              error?: string;
            };
            if (!response.ok) throw new Error(data.error || '读取失败');
            setHistory(data.history ?? []);
            if (!data.history?.length)
              setError('尚无数据快照；保存修改或恢复备份后生成。');
          } catch (e) {
            setError(e instanceof Error ? e.message : '读取失败');
          }
        }}
      >
        查看本地数据快照
      </button>
      {history.map((item) => (
        <a
          key={item.id}
          href={`/api/backup?recovery=${encodeURIComponent(item.id)}`}
          download
        >
          下载 {item.id.startsWith('auto-') ? '自动' : '恢复前'}快照 ·{' '}
          {new Date(item.createdAt).toLocaleString()}
        </a>
      ))}
      <p className="muted">
        有修改时每隔至少 30 分钟保存一次修改前快照，保留最近 20
        份自动快照；恢复前快照单独保留。快照在本机，不能代替异地备份。
      </p>
      <h3>回收站（{trash.length}）</h3>
      <small className="muted">
        恢复课程会一并恢复其笔记、对话和任务。永久删除只清除此回收站条目，已有备份及恢复快照仍保留。
      </small>
      {trash.length === 0 && <p>回收站为空</p>}
      {trash.map((item) => (
        <div className="trash-row" key={item.id}>
          <strong>
            {
              {
                course: '课程',
                note: '笔记',
                task: '任务',
                session: '对话',
                material: '资料',
              }[item.kind]
            }
            ：{item.title}
          </strong>
          <small>{new Date(item.deletedAt).toLocaleString()}</small>
          <div className="button-row">
            <button
              disabled={busy}
              onClick={() => {
                try {
                  restore(item.id);
                  setError('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : '恢复失败');
                }
              }}
            >
              恢复
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => setPermanent(item.id)}
            >
              永久删除
            </button>
          </div>
          {permanent === item.id && (
            <div>
              <p>确定永久删除此回收站条目？此操作不能在回收站撤销。</p>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  remove(item.id);
                  setPermanent('');
                }}
              >
                确认永久删除
              </button>
              <button onClick={() => setPermanent('')}>取消</button>
            </div>
          )}
        </div>
      ))}
      {busy && <output>正在校验和处理备份，请勿关闭页面…</output>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
