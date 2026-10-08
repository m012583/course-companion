'use client';
import { budgetQueue, type QueueItem } from '@/lib/review-queue';
import { useState } from 'react';
export default function ReviewQueue({
  items,
  minutes,
  onMinutes,
  onOpen,
  onSnooze,
  onDone,
  onReset,
}: {
  items: QueueItem[];
  minutes: number;
  onMinutes: (n: number) => void;
  onOpen: (i: QueueItem) => void;
  onSnooze: (i: QueueItem) => void;
  onDone: (i: QueueItem) => void;
  onReset: () => void;
}) {
  const [all, setAll] = useState(false);
  const selected = budgetQueue(items, minutes),
    rows = all ? items : selected;
  return (
    <section className="panel unified-review">
      <div className="panel-heading">
        <h2>今日复习队列</h2>
        <label>
          今日可用时间
          <select
            value={minutes}
            onChange={(e) => onMinutes(Number(e.target.value))}
          >
            {[10, 20, 30, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} 分钟
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {items.length} 项到期或逾期 · 预算内安排 {selected.length} 项 ·
        相同题目的到期任务合并显示，历史记录保留。
      </p>
      {rows.map((item) => (
        <article key={item.key} className="queue-row">
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.date} · 预计 {item.minutes} 分钟 ·{' '}
              {item.kind === 'note'
                ? '笔记回忆'
                : item.kind === 'question'
                  ? '题目练习'
                  : '计划任务'}
            </small>
          </div>
          <div className="actions">
            <button onClick={() => onOpen(item)}>开始复习</button>
            <button onClick={() => onSnooze(item)}>明天提醒</button>
            {item.kind === 'task' && (
              <button onClick={() => onDone(item)}>标为完成</button>
            )}
          </div>
        </article>
      ))}
      {!rows.length && (
        <p>
          {items.length
            ? '有任务超过当前时间预算，可查看全部或增加时间。'
            : '当前没有到期任务。'}
        </p>
      )}
      <div className="actions">
        {items.length > selected.length && (
          <button onClick={() => setAll(!all)}>
            {all ? '按时间预算显示' : `查看全部 ${items.length} 项`}
          </button>
        )}
        <button onClick={onReset}>取消暂缓提醒</button>
      </div>
    </section>
  );
}
