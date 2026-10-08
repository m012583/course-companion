'use client';
import { RotateCcw, Trash2 } from 'lucide-react';
export type CourseTrashItem = {
  id: string;
  kind: string;
  title: string;
  onRestore: () => void;
};
export default function CourseRecycleBin({
  name,
  items,
}: {
  name: string;
  items: CourseTrashItem[];
}) {
  if (!items.length) return null;
  return (
    <details className="course-recycle-bin">
      <summary>
        <Trash2 size={16} />
        {name} · 课程回收站<span>{items.length} 项</span>
      </summary>
      <p>删除的内容保留在这里，可单独恢复。</p>
      {items.map((item) => (
        <div className="course-trash-item" key={item.id}>
          <span className="trash-kind">{item.kind}</span>
          <strong>{item.title}</strong>
          <button
            onClick={item.onRestore}
            aria-label={`恢复${item.kind}：${item.title}`}
          >
            <RotateCcw size={14} />
            恢复
          </button>
        </div>
      ))}
    </details>
  );
}
