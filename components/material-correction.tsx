import { useState } from 'react';
import type { Passage } from '@/lib/knowledge';
export default function MaterialCorrection({
  passages,
  save,
}: {
  passages: Passage[];
  save: (passages: Passage[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(passages[0]?.text ?? '');
  const [message, setMessage] = useState('');
  return (
    <details className="note-review-settings">
      <summary>校正识别正文</summary>
      <p>
        对照原文件修改当前片段。已保存笔记中的历史引文不会自动改写；原文件保持不变。
      </p>
      <label>
        校正片段
        <select
          value={index}
          onChange={(e) => {
            const i = Number(e.target.value);
            setIndex(i);
            setText(passages[i]?.text ?? '');
            setMessage('');
          }}
        >
          {(passages.length
            ? passages
            : [{ section: '新增正文', text: '' }]
          ).map((p, i) => (
            <option key={i} value={i}>
              {i + 1} · {p.section}
            </option>
          ))}
        </select>
      </label>
      <label>
        校正正文
        <textarea
          aria-label="校正正文"
          value={text}
          maxLength={12000}
          rows={6}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        disabled={!text.trim()}
        onClick={() => {
          save(
            passages.length
              ? passages.map((p, i) =>
                  i === index ? { ...p, text: text.trim() } : p,
                )
              : [{ section: '人工校正正文', text: text.trim() }],
          );
          setMessage('已保存校正，后续检索使用新正文');
        }}
      >
        保存校正
      </button>
      <output>{message}</output>
    </details>
  );
}
