'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Maximize2,
  Network,
  Plus,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Note } from '@/lib/knowledge';
import {
  buildKnowledgeNetwork,
  layoutNetwork,
  neighborhood,
} from '@/lib/knowledge-network';

type Point = { x: number; y: number };
type Props = {
  notes: Note[];
  courses: { id: string; name: string }[];
  onOpen: (note: Note) => void;
  onNew: () => void;
  onChange: (id: string, patch: Partial<Note>) => void;
};
const colors = [
  '#71917e',
  '#7e99b2',
  '#a18abb',
  '#b89a65',
  '#b57879',
  '#6b9b9e',
];
export default function KnowledgeNetwork({
  notes,
  courses,
  onOpen,
  onNew,
  onChange,
}: Props) {
  const [course, setCourse] = useState('all'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState('');
  const [local, setLocal] = useState(false),
    [depth, setDepth] = useState(1);
  const [tag, setTag] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [moves, setMoves] = useState<Record<string, Point>>({});
  const [linkTo, setLinkTo] = useState(''),
    [label, setLabel] = useState('相关');
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id?: string;
    start: Point;
    origin: Point;
    moved: boolean;
    position: Point;
  } | null>(null);
  const suppressClick = useRef(false);
  const owner = (n: Note) =>
    courses.find((c) =>
      n.courseId ? c.id === n.courseId : c.name === n.course,
    );
  const filtered = useMemo(
    () =>
      notes
        .filter((n) => !tag || n.tags?.includes(tag))
        .filter(
          (n) =>
            course === 'all' ||
            n.courseId === course ||
            (!n.courseId &&
              n.course === courses.find((c) => c.id === course)?.name),
        ),
    [notes, courses, course, tag],
  );
  const whole = useMemo(() => buildKnowledgeNetwork(filtered), [filtered]);
  const graph = useMemo(
    () => (local ? neighborhood(whole, selected, depth) : whole),
    [whole, selected, depth, local],
  );
  // Content edits do not restart layout; only topology changes do.
  const topology = JSON.stringify({
    ids: whole.nodes.map((n) => n.id),
    edges: whole.edges.map((e) => [e.from, e.to]),
  });
  const positions = useMemo(() => {
    const data = JSON.parse(topology) as {
      ids: string[];
      edges: [string, string][];
    };
    return layoutNetwork({
      nodes: data.ids.map((id) => ({ id }) as Note),
      edges: data.edges.map(([from, to]) => ({
        id: JSON.stringify([from, to]),
        from,
        to,
        labels: [],
      })),
    });
  }, [topology]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const point = (id: string): Point =>
    moves[id] ??
    noteById.get(id)?.graphPositions?.global ??
    positions[id] ?? { x: 500, y: 320 };
  const active = filtered.find((n) => n.id === selected);
  const matches = query.trim()
    ? filtered.filter((n) =>
        `${n.title} ${(n.tags ?? []).join(' ')}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : [];
  const matchingIds = new Set(matches.map((n) => n.id));
  const neighbors = new Set(
    whole.edges.flatMap((e) =>
      e.from === selected ? [e.to] : e.to === selected ? [e.from] : [],
    ),
  );
  const connected = new Set(whole.edges.flatMap((e) => [e.from, e.to]));
  const isolated = whole.nodes.filter((n) => !connected.has(n.id)).length;
  function fit() {
    const box = viewport.current?.getBoundingClientRect();
    if (!box || !graph.nodes.length) return;
    const points = graph.nodes.map((n) => point(n.id));
    const minX = Math.min(...points.map((p) => p.x)) - 100,
      maxX = Math.max(...points.map((p) => p.x)) + 100;
    const minY = Math.min(...points.map((p) => p.y)) - 70,
      maxY = Math.max(...points.map((p) => p.y)) + 70;
    const scale = Math.max(
      0.08,
      Math.min(1.6, box.width / (maxX - minX), box.height / (maxY - minY)),
    );
    setCamera({
      scale,
      x: box.width / 2 - ((maxX + minX) / 2) * scale,
      y: box.height / 2 - ((maxY + minY) / 2) * scale,
    });
  }
  function zoom(factor: number) {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    setCamera((c) => {
      const scale = Math.max(0.08, Math.min(3, c.scale * factor));
      return {
        scale,
        x: box.width / 2 - ((box.width / 2 - c.x) * scale) / c.scale,
        y: box.height / 2 - ((box.height / 2 - c.y) * scale) / c.scale,
      };
    });
  }
  const fitLatest = useEffectEvent(fit);
  const visibleIds = graph.nodes.map((n) => n.id).join('\0');
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => fitLatest());
    observer.observe(element);
    return () => observer.disconnect();
  }, [visibleIds]);
  function choose(id: string, center = false) {
    setSelected(id);
    setLinkTo('');
    if (center && viewport.current) {
      const box = viewport.current.getBoundingClientRect(),
        p = point(id);
      setCamera({ scale: 1, x: box.width / 2 - p.x, y: box.height / 2 - p.y });
    }
  }
  function addLink(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!active || !linkTo || linkTo === active.id) return;
    onChange(active.id, {
      relatedIds: [...new Set([...(active.relatedIds ?? []), linkTo])],
      relatedLabels: { ...active.relatedLabels, [linkTo]: label },
      updatedAt: new Date().toISOString(),
    });
    setLinkTo('');
  }
  const listId = 'knowledge-network-search';
  return (
    <div className="network-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">把零散笔记连成知识网络</p>
          <h1>知识图谱</h1>
          <p className="muted">
            {graph.nodes.length} 篇笔记 · {graph.edges.length} 条关联 ·
            按课程与标签范围查看
          </p>
        </div>
        <button onClick={onNew}>
          <Plus size={16} />
          新建笔记
        </button>
      </div>
      <div className="network-controls">
        <div className="network-search">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="搜索图谱笔记"
              aria-controls={listId}
              placeholder="搜索笔记标题或标签"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {query.trim() && (
            <div className="network-search-results" id={listId}>
              <small>
                {matches.length
                  ? `找到 ${matches.length} 篇${matches.length > 12 ? '，显示前 12 篇' : ''}`
                  : '没有匹配的笔记'}
              </small>
              {matches.slice(0, 12).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    choose(n.id, true);
                    setQuery('');
                  }}
                >
                  {n.title || '未命名笔记'}
                  <small>{owner(n)?.name ?? n.course}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          aria-label="图谱课程范围"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            setSelected('');
            setLocal(false);
            setQuery('');
            setCamera({ x: 0, y: 0, scale: 1 });
          }}
        >
          <option value="all">全部课程</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="network-modes" aria-label="图谱范围">
          <select
            aria-label="图谱标签范围"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setSelected('');
              setLocal(false);
            }}
          >
            <option value="">全部标签</option>
            {[...new Set(notes.flatMap((n) => n.tags ?? []))]
              .sort()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
          <button aria-pressed={!local} onClick={() => setLocal(false)}>
            全部知识
          </button>
          <button
            aria-pressed={local}
            disabled={!active}
            onClick={() => setLocal(true)}
          >
            当前笔记附近
          </button>
        </div>
        {local && (
          <select
            aria-label="关联层数"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
          >
            <option value={1}>一层关联</option>
            <option value={2}>两层关联</option>
          </select>
        )}
      </div>
      <div className="network-status">
        <span>
          {graph.nodes.length} 篇笔记 · {graph.edges.length} 条关联
          {isolated > 0 && !local ? ` · ${isolated} 篇尚未关联` : ''}
        </span>
        <span>读取已有关联 · 不消耗 AI token</span>
      </div>
      {!whole.nodes.length ? (
        <div className="graph-empty">
          <Network size={32} />
          <h3>
            {notes.length ? '当前课程或标签下没有笔记' : '从第一篇笔记开始'}
          </h3>
          <p>保存笔记后会出现节点，添加关联后会出现连线。</p>
          <button
            onClick={
              notes.length
                ? () => {
                    setCourse('all');
                    setTag('');
                  }
                : onNew
            }
          >
            {notes.length ? '查看全部课程' : '新建笔记'}
          </button>
        </div>
      ) : (
        <>
          <div className={`network-workbench ${active ? 'with-detail' : ''}`}>
            <div className="network-stage">
              <div className="network-canvas-toolbar">
                <span>拖动空白平移 · 拖动节点整理</span>
                <div className="actions">
                  <button
                    className="icon-button"
                    aria-label="缩小知识图谱"
                    onClick={() => zoom(1 / 1.25)}
                  >
                    <ZoomOut size={17} />
                  </button>
                  <span>{Math.round(camera.scale * 100)}%</span>
                  <button
                    className="icon-button"
                    aria-label="放大知识图谱"
                    onClick={() => zoom(1.25)}
                  >
                    <ZoomIn size={17} />
                  </button>
                  <button onClick={fit}>
                    <Maximize2 size={15} />
                    显示全部
                  </button>
                </div>
              </div>
              <div
                className="network-viewport"
                ref={viewport}
                onPointerDown={(e) => {
                  if (
                    e.button !== 0 ||
                    (e.target as HTMLElement).closest('button')
                  )
                    return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    start: { x: e.clientX, y: e.clientY },
                    origin: { x: camera.x, y: camera.y },
                    position: { x: camera.x, y: camera.y },
                    moved: false,
                  };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  const dx = e.clientX - d.start.x,
                    dy = e.clientY - d.start.y;
                  if (Math.abs(dx) + Math.abs(dy) < 4 && !d.moved) return;
                  d.moved = true;
                  d.position = {
                    x: d.origin.x + dx / (d.id ? camera.scale : 1),
                    y: d.origin.y + dy / (d.id ? camera.scale : 1),
                  };
                  if (d.id)
                    setMoves((current) => ({
                      ...current,
                      [d.id!]: d.position,
                    }));
                  else setCamera((c) => ({ ...c, ...d.position }));
                }}
                onPointerUp={() => {
                  const d = drag.current;
                  if (!d) return;
                  suppressClick.current = d.moved;
                  if (d.id && d.moved) {
                    const n = notes.find((n) => n.id === d.id);
                    if (n)
                      onChange(n.id, {
                        graphPositions: {
                          ...n.graphPositions,
                          global: d.position,
                        },
                      });
                  }
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  suppressClick.current = false;
                }}
              >
                <div
                  className="network-world"
                  style={{
                    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                  }}
                >
                  <svg
                    className="network-lines"
                    width={1000}
                    height={640}
                    aria-label="笔记之间已保存的关联"
                  >
                    <title>
                      每条线代表两篇笔记已有的关联，关系详情见右侧。
                    </title>
                    {graph.edges.map((e) => {
                      const a = point(e.from),
                        b = point(e.to);
                      return (
                        <line
                          key={e.id}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          className={
                            e.from === selected || e.to === selected
                              ? 'active'
                              : ''
                          }
                        />
                      );
                    })}
                  </svg>
                  {graph.nodes.map((n) => {
                    const p = point(n.id),
                      o = owner(n),
                      color =
                        colors[
                          Math.max(
                            0,
                            courses.findIndex((c) => c.id === o?.id),
                          ) % colors.length
                        ];
                    const showLabel =
                      graph.nodes.length <= 60 ||
                      n.id === selected ||
                      neighbors.has(n.id) ||
                      matchingIds.has(n.id);
                    return (
                      <button
                        key={n.id}
                        className={`network-node ${n.id === selected ? 'selected' : ''} ${query.trim() && !matchingIds.has(n.id) ? 'dimmed' : ''}`}
                        style={{ left: p.x, top: p.y, color }}
                        aria-label={`查看笔记：${n.title || '未命名笔记'}`}
                        aria-pressed={n.id === selected}
                        title={n.title}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          drag.current = {
                            id: n.id,
                            start: { x: e.clientX, y: e.clientY },
                            origin: p,
                            position: p,
                            moved: false,
                          };
                          suppressClick.current = false;
                        }}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          choose(n.id);
                        }}
                      >
                        <span className="network-dot" />
                        {showLabel && (
                          <span className="network-node-label">
                            {n.title || '未命名笔记'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="network-legend">
                {courses
                  .filter((c) =>
                    filtered.some(
                      (n) =>
                        n.courseId === c.id ||
                        (!n.courseId && n.course === c.name),
                    ),
                  )
                  .map((c) => (
                    <span key={c.id}>
                      <i
                        style={{
                          background:
                            colors[courses.indexOf(c) % colors.length],
                        }}
                      />
                      {c.name}
                    </span>
                  ))}
              </div>
            </div>
            {active && (
              <aside className="network-detail">
                <button
                  className="icon-button graph-inspector-close"
                  aria-label="关闭笔记详情"
                  onClick={() => {
                    setSelected('');
                    setLocal(false);
                  }}
                >
                  <X size={17} />
                </button>
                <p className="eyebrow">
                  {owner(active)?.name ?? active.course}
                </p>
                <h2>{active.title || '未命名笔记'}</h2>
                <p className="network-excerpt">
                  {active.text.replace(/[#*`]/g, '').slice(0, 320) ||
                    '这篇笔记还没有正文。'}
                  {active.text.length > 320 ? '…' : ''}
                </p>
                <button className="primary" onClick={() => onOpen(active)}>
                  <BookOpen size={16} />
                  打开笔记
                </button>
                <h3>已有关联 · {neighbors.size}</h3>
                {!neighbors.size && (
                  <p className="muted">还没有关联，可以从下方添加。</p>
                )}
                {whole.edges
                  .filter((e) => e.from === active.id || e.to === active.id)
                  .map((e) => {
                    const n = filtered.find(
                      (n) => n.id === (e.from === active.id ? e.to : e.from),
                    );
                    return (
                      n && (
                        <div key={e.id}>
                          <button
                            className="network-related-row"
                            onClick={() => choose(n.id, true)}
                          >
                            {n.title}
                            <small>
                              {active.relatedIds?.includes(n.id)
                                ? `本篇 → 该笔记：${active.relatedLabels?.[n.id] || '已关联'}`
                                : `该笔记 → 本篇：${n.relatedLabels?.[active.id] || '已关联'}`}
                            </small>
                            {active.relatedIds?.includes(n.id) &&
                              n.relatedIds?.includes(active.id) && (
                                <small>
                                  该笔记 → 本篇：
                                  {n.relatedLabels?.[active.id] || '已关联'}
                                </small>
                              )}
                          </button>
                          <button
                            className="danger"
                            aria-label={`移除与 ${n.title} 的关联`}
                            onClick={() => {
                              for (const [from, to] of [
                                [active, n],
                                [n, active],
                              ]) {
                                const labels = { ...from.relatedLabels };
                                delete labels[to.id];
                                onChange(from.id, {
                                  relatedIds: from.relatedIds?.filter(
                                    (id) => id !== to.id,
                                  ),
                                  relatedLabels: labels,
                                });
                              }
                            }}
                          >
                            移除关联
                          </button>
                        </div>
                      )
                    );
                  })}
                <form
                  className="form-stack network-link-editor"
                  onSubmit={addLink}
                >
                  <h3>添加或修改关联</h3>
                  <label>
                    另一篇笔记
                    <select
                      value={linkTo}
                      onChange={(e) => setLinkTo(e.target.value)}
                      required
                    >
                      <option value="">选择笔记</option>
                      {notes
                        .filter((n) => n.id !== active.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title || '未命名笔记'} · {n.course}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    关系
                    <select
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    >
                      <option>相关</option>
                      <option>先修知识</option>
                      <option>后续应用</option>
                      <option>容易混淆</option>
                      <option>同一主题</option>
                    </select>
                  </label>
                  <button disabled={!linkTo} type="submit">
                    <Plus size={15} />
                    保存关联
                  </button>
                  <small className="muted">
                    课程筛选可能隐藏跨课程连线。所有关联都会同步到笔记。
                  </small>
                </form>
              </aside>
            )}
          </div>
          {!whole.edges.length && (
            <p className="network-hint">
              目前还没有连线。点击任意笔记节点，在详情中添加关联；系统不会根据标题相似自动猜测关系。
            </p>
          )}
        </>
      )}
    </div>
  );
}
