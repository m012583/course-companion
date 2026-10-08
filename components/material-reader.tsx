'use client';
import { useState, useRef, useEffect } from 'react';
import type { Evidence, Material, Passage } from '@/lib/knowledge';
import { coverageLabel } from '@/lib/knowledge';
import { readingEvidence, type ReadingPosition } from '@/lib/learning-flow';
import { sourceAnchor } from '@/lib/source-anchor';
import LearningMarkdown from './learning-markdown';
import MaterialCorrection from './material-correction';

export default function MaterialReader({
  material,
  position,
  chapters,
  disabled,
  uploading,
  scanning,
  onPosition,
  onAsk,
  onNote,
  onReparse,
  onScan,
  onStopScan,
  onCorrect,
  onChapter,
}: {
  material: Material;
  position?: ReadingPosition;
  chapters: string[];
  disabled: boolean;
  uploading: boolean;
  scanning: boolean;
  onPosition: (position: ReadingPosition) => void;
  onAsk: (text: string) => void;
  onNote: (text: string, evidence: Evidence) => void;
  onReparse: () => void;
  onScan: () => void;
  onStopScan: () => void;
  onCorrect: (passages: Passage[]) => void;
  onChapter: (chapter: string) => void;
}) {
  const [original, setOriginal] = useState(false);
  const [selection, setSelection] = useState('');
  const reader = useRef<HTMLDivElement>(null);
  const passages = material.passages?.length
    ? material.passages
    : [{ section: '正文', text: material.content ?? '' }];
  const same =
    position &&
    (position.fileId
      ? position.fileId === material.fileId
      : position.name === material.name);
  const index = same
    ? Math.min(Math.max(position.passage, 0), passages.length - 1)
    : 0;
  const passage = passages[index];
  function jump(next: number) {
    setSelection('');
    onPosition({
      fileId: material.fileId,
      name: material.name,
      passage: next,
      updatedAt: new Date().toISOString(),
    });
    reader.current?.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const capture = () => {
      const selected = window.getSelection();
      if (
        selected &&
        reader.current?.contains(selected.anchorNode) &&
        reader.current.contains(selected.focusNode)
      )
        setSelection(selected.toString().trim().slice(0, 4000));
    };
    document.addEventListener('selectionchange', capture);
    return () => document.removeEventListener('selectionchange', capture);
  }, []);
  const snippet = selection || passage.text.slice(0, 4000);
  const evidence = {
    ...readingEvidence(material, index),
    ...sourceAnchor(material, passage),
    quote: snippet,
  };
  return (
    <section className="panel material-reader">
      <div className="panel-heading">
        <h2>{material.name}</h2>
        {material.fileId && (
          <a
            className="button"
            href={`/api/files?id=${encodeURIComponent(material.fileId)}#page=${passage.page ?? 1}`}
            target="_blank"
            rel="noreferrer"
          >
            打开原文件
          </a>
        )}
      </div>
      <div className="reader-controls">
        <button
          disabled={disabled || index === 0}
          onClick={() => jump(index - 1)}
        >
          上一段
        </button>
        <label>
          阅读位置
          <select
            aria-label="阅读位置"
            disabled={disabled}
            value={index}
            onChange={(e) => jump(Number(e.target.value))}
          >
            {passages.map((p, i) => (
              <option key={i} value={i}>
                {i + 1}. {p.page ? `第 ${p.page} 页 · ` : ''}
                {p.section}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={disabled || index === passages.length - 1}
          onClick={() => jump(index + 1)}
        >
          下一段
        </button>
        {material.type === 'PDF' && material.fileId && (
          <button onClick={() => setOriginal((v) => !v)}>
            {original ? '切换提取文字' : '查看 PDF 页'}
          </button>
        )}
      </div>
      <p className="muted small">
        第 {index + 1} / {passages.length} 段 · 切换段落会保存阅读位置。
        {original
          ? 'PDF 可按页查看；选段提问请切换提取文字。'
          : '可选中文字，再提问或保存笔记。'}
      </p>
      {original && material.fileId ? (
        <iframe
          title={`${material.name}原文`}
          className="document-frame"
          src={`/api/files?id=${encodeURIComponent(material.fileId)}#page=${passage.page ?? 1}`}
        />
      ) : (
        <div className="reader-passage" ref={reader}>
          <h3>{passage.section}</h3>
          {passage.text ? (
            <LearningMarkdown text={passage.text} />
          ) : (
            <p>暂无可读取正文。请识别扫描文字或手动校正。</p>
          )}
        </div>
      )}
      <div className="reader-actions actions">
        <button
          className="primary"
          disabled={!snippet || disabled}
          onClick={() =>
            onAsk(
              `请依据《${material.name}》${passage.section}，解释这段原文的含义和适用条件：\n\n${snippet}`,
            )
          }
        >
          {selection ? '用选段提问' : '解释本段'}
        </button>
        <button
          disabled={!snippet || disabled}
          onClick={() => onNote(snippet, evidence)}
        >
          {selection ? '选段记笔记' : '本段记笔记'}
        </button>
      </div>
      <details className="reader-tools">
        <summary>教材信息与文字校正</summary>
        <p className="notice">{coverageLabel(material)}</p>
        <label>
          所属章节
          <select
            value={material.chapter ?? ''}
            disabled={disabled}
            onChange={(e) => onChapter(e.target.value)}
          >
            <option value="">未分类</option>
            {chapters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button
            disabled={disabled || !material.fileId || uploading}
            onClick={onReparse}
          >
            重新解析
          </button>
          {material.fileId &&
            /^(PDF|PNG|JPG|JPEG|WEBP)$/.test(material.type) && (
              <button disabled={disabled || uploading} onClick={onScan}>
                识别扫描文字
              </button>
            )}
          {scanning && <button onClick={onStopScan}>停止识别</button>}
        </div>
        <MaterialCorrection
          material={material}
          disabled={disabled || uploading}
          onSave={onCorrect}
        />
        <p className="muted small">
          扫描识别在本机完成，每次最多前 20 页。复杂公式和低清图片需要人工核对。
        </p>
      </details>
    </section>
  );
}
