'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowUpRight, Link2, List, Network } from 'lucide-react';
import { normalizeMath, type Note } from '@/lib/knowledge';
import { noteConnections, remarkNoteLinks } from '@/lib/note-navigation';

export default function NoteReader({
  note,
  notes,
  onOpen,
  onShowGraph,
}: {
  note: Note;
  notes: Note[];
  onOpen: (note: Note) => void;
  onShowGraph: () => void;
}) {
  const content = useRef<HTMLElement>(null);
  const [headings, setHeadings] = useState<
    { id: string; text: string; level: number }[]
  >([]);
  const [activeHeading, setActiveHeading] = useState('');
  const connections = useMemo(
    () => noteConnections(note, notes),
    [note, notes],
  );
  const neighbors = [
    ...new Map(
      [...connections.outgoing, ...connections.incoming].map((n) => [n.id, n]),
    ).values(),
  ];
  const visible = neighbors.slice(0, 5);
  const points = visible.map((_, i) => {
    const angle =
      -Math.PI / 2 + (i * Math.PI * 2) / Math.max(visible.length, 1);
    return { x: 130 + Math.cos(angle) * 90, y: 90 + Math.sin(angle) * 63 };
  });
  useEffect(() => {
    const elements = [
      ...(content.current?.querySelectorAll<HTMLHeadingElement>(
        'h1, h2, h3, h4',
      ) ?? []),
    ];
    setHeadings(
      elements.map((element) => ({
        id: element.id,
        text: element.textContent ?? '',
        level: Number(element.tagName.slice(1)),
      })),
    );
    setActiveHeading(elements[0]?.id ?? '');
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry) setActiveHeading(visibleEntry.target.id);
      },
      { rootMargin: '-10% 0px -65% 0px' },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [note.id, note.text]);

  const referenceList = (items: Note[], direction: string) => (
    <section className="context-section">
      <h3>
        <Link2 size={15} />
        {direction}
        <span>{items.length}</span>
      </h3>
      {items.length ? (
        items.map((item) => (
          <button
            className="reference-note"
            key={item.id}
            onClick={() => onOpen(item)}
          >
            <span>
              <strong>{item.title}</strong>
              <small>
                {item.course} · {item.chapter || '未分类'}
              </small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))
      ) : (
        <p className="context-empty">
          {direction === '反向链接'
            ? '还没有笔记引用这一篇。'
            : '还没有链接到其他笔记。'}
        </p>
      )}
    </section>
  );

  return (
    <div className="reader-layout">
      <article
        className="reader-paper prose"
        ref={content}
        aria-label="笔记正文"
      >
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkMath,
            [remarkNoteLinks, { notes, source: note }],
          ]}
          rehypePlugins={[rehypeKatex]}
          components={{
            a: ({ href, children, ...props }) => {
              if (href?.startsWith('#note-ref=')) {
                const target = notes.find(
                  (n) =>
                    !n.deletedAt && encodeURIComponent(n.id) === href.slice(10),
                );
                if (target)
                  return (
                    <a
                      className="wiki-link"
                      href={`#${new URLSearchParams({ view: 'knowledge', note: target.id })}`}
                      onClick={(e) => {
                        if (
                          e.button === 0 &&
                          !e.metaKey &&
                          !e.ctrlKey &&
                          !e.shiftKey &&
                          !e.altKey
                        ) {
                          e.preventDefault();
                          onOpen(target);
                        }
                      }}
                    >
                      {children}
                      <ArrowUpRight size={12} />
                    </a>
                  );
              }
              return (
                <a {...props} href={href}>
                  {children}
                </a>
              );
            },
          }}
        >
          {normalizeMath(note.text)}
        </ReactMarkdown>
      </article>
      <aside className="note-context" aria-label="笔记导航与关联">
        <nav className="context-section outline-nav" aria-label="本文大纲">
          <h3>
            <List size={15} />
            本文大纲
          </h3>
          {headings.length ? (
            headings.map((heading) => (
              <button
                key={heading.id}
                aria-current={
                  activeHeading === heading.id ? 'location' : undefined
                }
                style={{
                  paddingLeft:
                    10 +
                    Math.max(
                      0,
                      heading.level - Math.min(...headings.map((h) => h.level)),
                    ) *
                      12,
                }}
                onClick={() => {
                  const element = document.getElementById(heading.id);
                  element?.scrollIntoView({
                    behavior: window.matchMedia(
                      '(prefers-reduced-motion: reduce)',
                    ).matches
                      ? 'instant'
                      : 'smooth',
                    block: 'start',
                  });
                  setActiveHeading(heading.id);
                }}
              >
                {heading.text}
              </button>
            ))
          ) : (
            <p className="context-empty">正文使用「## 标题」即可生成大纲。</p>
          )}
        </nav>
        <section className="context-section">
          <h3>
            <Network size={15} />
            附近的笔记<span>{neighbors.length}</span>
          </h3>
          <div className="mini-network">
            <svg viewBox="0 0 260 180" aria-hidden="true">
              {points.map((p, i) => (
                <line key={visible[i].id} x1={130} y1={90} x2={p.x} y2={p.y} />
              ))}
            </svg>
            <span className="mini-network-root" title={note.title}>
              <i />
              <span>当前笔记</span>
            </span>
            {visible.map((item, i) => (
              <button
                key={item.id}
                className="mini-network-node"
                title={item.title}
                aria-label={`打开关联笔记：${item.title}`}
                style={{
                  left: `${points[i].x / 2.6}%`,
                  top: `${points[i].y / 1.8}%`,
                }}
                onClick={() => onOpen(item)}
              >
                <i />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <button className="context-graph-link" onClick={onShowGraph}>
            打开关联图谱
            <ArrowUpRight size={15} />
          </button>
        </section>
        {referenceList(connections.incoming, '反向链接')}
        {referenceList(connections.outgoing, '链接到')}
        {!!connections.unresolved.length && (
          <p className="context-empty unresolved-links">
            {connections.unresolved.length} 处引用尚未匹配：
            {[...new Set(connections.unresolved.map((ref) => ref.target))].join(
              '、',
            )}
            。请核对笔记名称。
          </p>
        )}
        <p className="link-hint">
          在正文写下 <code>[[笔记名]]</code>，即可连接已有笔记。
        </p>
      </aside>
    </div>
  );
}
