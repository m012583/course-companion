'use client';
import { useEffect, useRef, useState } from 'react';
import type { Passage } from '@/lib/knowledge';

export default function PassageReader({
  passages,
  initial,
  remember,
  ask,
  save,
}: {
  passages: Passage[];
  initial: number;
  remember: (index: number) => void;
  ask: (quote: string, passage: Passage) => void;
  save: (quote: string, passage: Passage) => void;
}) {
  const [index, setIndex] = useState(
    Math.min(initial, Math.max(0, passages.length - 1)),
  );
  const [selection, setSelection] = useState('');
  const root = useRef<HTMLParagraphElement>(null);
  const passage = passages[index];
  useEffect(() => {
    function captureSelection() {
      const selected = window.getSelection();
      setSelection(
        selected &&
          root.current?.contains(selected.anchorNode) &&
          root.current?.contains(selected.focusNode)
          ? selected.toString().trim().slice(0, 3000)
          : '',
      );
    }
    document.addEventListener('selectionchange', captureSelection);
    return () =>
      document.removeEventListener('selectionchange', captureSelection);
  }, []);
  if (!passage) return null;
  function turn(next: number) {
    setIndex(next);
    setSelection('');
    remember(next);
  }
  return (
    <section className="passage-reader" aria-label="分段阅读">
      <div className="button-row">
        <button disabled={index === 0} onClick={() => turn(index - 1)}>
          上一段
        </button>
        <label>
          阅读位置{' '}
          <select
            aria-label="阅读位置"
            value={index}
            onChange={(e) => turn(Number(e.target.value))}
          >
            {passages.map((p, i) => (
              <option key={i} value={i}>
                {i + 1} / {passages.length} · {p.section}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={index >= passages.length - 1}
          onClick={() => turn(index + 1)}
        >
          下一段
        </button>
      </div>
      <p className="muted">
        切换段落自动记住位置。可选择下方原文的一部分，再提问或保存笔记。
      </p>
      <p ref={root} className="passage-quote">
        {passage.text}
      </p>
      <div className="button-row">
        <button onClick={() => ask(selection || passage.text, passage)}>
          {selection ? '用选中文字提问' : '用当前段落提问'}
        </button>
        <button onClick={() => save(selection || passage.text, passage)}>
          {selection ? '选文保存为笔记' : '本段保存为笔记'}
        </button>
      </div>
    </section>
  );
}
