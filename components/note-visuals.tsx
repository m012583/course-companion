'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Expand,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  noteFingerprint,
  relatedGraph,
  type ConceptGraph,
  type ConceptNode,
  type ConceptEdge,
  type NodePosition,
} from '@/lib/note-graph';
import type { Note } from '@/lib/knowledge';

type GraphData = { nodes: ConceptNode[]; edges: ConceptEdge[] };
type Props = {
  note: Note;
  notes: Note[];
  model: string;
  onChange: (id: string, patch: Partial<Note>) => void;
  onOpen: (note: Note) => void;
  renderText: (text: string) => React.ReactNode;
};
const pending = new Map<string, Promise<ConceptGraph>>();
function GraphCanvas({
  graph,
  root,
  positions,
  selected,
  onSelect,
  onMove,
}: {
  graph: GraphData;
  root: string;
  positions: Record<string, NodePosition>;
  selected: string;
  onSelect: (id: string) => void;
  onMove: (id: string, position: NodePosition) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: string;
      x: number;
      y: number;
      start: NodePosition;
      moved: boolean;
    } | null>(null);
  const [width, setWidth] = useState(600),
    [zoom, setZoom] = useState(1),
    [moving, setMoving] = useState<Record<string, NodePosition>>({});
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const branches = graph.nodes.filter((n) => n.id !== root),
    radial = width >= 510 && branches.length <= 6;
  const height =
    branches.length === 0
      ? 240
      : radial
        ? 480
        : Math.max(330, 190 + Math.ceil(branches.length / 2) * 130);
  const defaults: Record<string, NodePosition> = {
    [root]: { x: 0.5, y: radial ? 0.5 : 65 / height },
  };
  branches.forEach((n, i) => {
    const angle =
      -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, branches.length);
    defaults[n.id] = radial
      ? { x: 0.5 + Math.cos(angle) * 0.33, y: 0.5 + Math.sin(angle) * 0.34 }
      : { x: i % 2 ? 0.74 : 0.26, y: (205 + Math.floor(i / 2) * 130) / height };
  });
  const location = (id: string) => {
    const p = moving[id] ?? positions[id] ?? defaults[id] ?? { x: 0.5, y: 0.5 };
    return {
      x: Math.min(width - 68, Math.max(68, p.x * width)),
      y: Math.min(height - 42, Math.max(42, p.y * height)),
    };
  };
  return (
    <div className="graph-canvas-wrap">
      <div className="graph-canvas-tools">
        <span>点击查看 · 拖动节点</span>
        <div className="actions">
          <button
            className="icon-button"
            aria-label="缩小图谱"
            disabled={zoom <= 0.8}
            onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))}
          >
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label="放大图谱"
            disabled={zoom >= 1.6}
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))}
          >
            <ZoomIn size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="恢复缩放"
            onClick={() => setZoom(1)}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <div ref={ref} className="graph-viewport">
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="graph-world"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <svg
              width={width}
              height={height}
              className="graph-lines"
              aria-label="概念节点间的关系连线"
            >
              <title>选择节点，在详情中查看关系</title>
              {graph.edges.map((edge) => {
                const a = location(edge.from),
                  b = location(edge.to),
                  active = edge.from === selected || edge.to === selected;
                return (
                  <g key={edge.id}>
                    <path
                      className={active ? 'highlight' : ''}
                      d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + 18} ${(a.y + b.y) / 2 - 14} ${b.x} ${b.y}`}
                    />
                    {active && graph.edges.length <= 6 && (
                      <text
                        x={(a.x + b.x) / 2 + 9}
                        y={(a.y + b.y) / 2 - 13}
                        textAnchor="middle"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {graph.nodes.map((node) => {
              const p = location(node.id);
              return (
                <button
                  key={node.id}
                  className={`graph-node ${node.id === root ? 'root' : ''} ${selected === node.id ? 'chosen' : ''}`}
                  style={{ left: p.x, top: p.y }}
                  aria-pressed={selected === node.id}
                  title={node.label}
                  onClick={() => {
                    if (!drag.current?.moved) onSelect(node.id);
                    drag.current = null;
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: node.id,
                      x: e.clientX,
                      y: e.clientY,
                      start: { x: p.x / width, y: p.y / height },
                      moved: false,
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d || d.id !== node.id) return;
                    const dx = (e.clientX - d.x) / zoom,
                      dy = (e.clientY - d.y) / zoom;
                    if (Math.abs(dx) + Math.abs(dy) < 5 && !d.moved) return;
                    d.moved = true;
                    setMoving((current) => ({
                      ...current,
                      [node.id]: {
                        x: Math.min(
                          1 - 68 / width,
                          Math.max(68 / width, d.start.x + dx / width),
                        ),
                        y: Math.min(
                          1 - 42 / height,
                          Math.max(42 / height, d.start.y + dy / height),
                        ),
                      },
                    }));
                  }}
                  onPointerUp={(e) => {
                    if (drag.current?.moved && moving[node.id])
                      onMove(node.id, moving[node.id]);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setMoving({});
                  }}
                >
                  <span>{node.label}</span>
                  {node.id === root && (
                    <small>当前{root === 'root' ? '主题' : '笔记'}</small>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NoteVisuals({
  note,
  notes,
  model,
  onChange,
  onOpen,
  renderText,
}: Props) {
  const [tab, setTab] = useState<'related' | 'concept' | 'text'>(
      note.conceptGraph ? 'concept' : 'related',
    ),
    [inspectorOpen, setInspectorOpen] = useState(false),
    [selected, setSelected] = useState(note.id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmReplace, setConfirmReplace] = useState(false),
    [expanded, setExpanded] = useState(false),
    [addId, setAddId] = useState(''),
    [relation, setRelation] = useState('相关'),
    [editing, setEditing] = useState(false),
    [edgeFrom, setEdgeFrom] = useState('root'),
    [edgeTo, setEdgeTo] = useState(''),
    [edgeLabel, setEdgeLabel] = useState('相关');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [nodeQuery, setNodeQuery] = useState('');
  useEffect(() => {
    if (expanded) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [expanded]);
  const fingerprint = noteFingerprint(note.title, note.text),
    key = `${note.id}:${fingerprint}`;
  const stale =
    !!note.conceptGraph && note.conceptGraph.sourceFingerprint !== fingerprint;
  const local = relatedGraph(note, notes),
    graph: GraphData =
      tab === 'concept'
        ? (note.conceptGraph ?? { nodes: [], edges: [] })
        : local,
    root = tab === 'concept' ? 'root' : note.id;
  const active =
    graph.nodes.find((n) => n.id === selected) ??
    graph.nodes.find((n) => n.id === root);
  const selectedNote =
    tab === 'related' ? notes.find((n) => n.id === active?.id) : undefined;
  const prefix =
    tab === 'concept'
      ? `concept:${note.conceptGraph?.generatedAt ?? ''}:`
      : 'related:';
  const positions = Object.fromEntries(
    Object.entries(note.graphPositions ?? {})
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v]),
  );
  function switchTab(next: typeof tab) {
    setTab(next);
    setSelected(next === 'concept' ? 'root' : note.id);
    setEditing(false);
    setInspectorOpen(false);
    setError('');
  }
  function saveGraph(patch: Partial<ConceptGraph>) {
    if (note.conceptGraph)
      onChange(note.id, {
        conceptGraph: { ...note.conceptGraph, ...patch, edited: true },
      });
  }
  function startManualGraph() {
    setInspectorOpen(true);
    onChange(note.id, {
      conceptGraph: {
        nodes: [
          { id: 'root', label: note.title.slice(0, 36), description: '' },
        ],
        edges: [],
        generatedAt: new Date().toISOString(),
        sourceFingerprint: noteFingerprint(note.title, note.text),
        edited: true,
      },
    });
    setSelected('root');
    setEditing(true);
    setError('');
  }
  async function generate() {
    setConfirmReplace(false);
    setBusy(true);
    setError('');
    const noteId = note.id;
    let request = pending.get(key);
    if (!request) {
      request = (async () => {
        const response = await fetch('/api/knowledge-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: note.title,
            content: note.text,
            model,
          }),
        });
        const data = (await response.json()) as {
          graph?: ConceptGraph;
          error?: string;
        };
        if (!response.ok || !data.graph)
          throw new Error(data.error || '生成失败，已有图谱已保留。');
        return data.graph;
      })();
      pending.set(key, request);
    }
    try {
      const result = await request;
      onChange(noteId, {
        conceptGraph: result,
      });
      setSelected('root');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请重试。');
    } finally {
      pending.delete(key);
      setBusy(false);
    }
  }
  function addRelation(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!addId) return;
    onChange(note.id, {
      relatedIds: [...new Set([...(note.relatedIds ?? []), addId])],
      relatedLabels: {
        ...note.relatedLabels,
        [addId]: relation.trim() || '相关',
      },
    });
    setSelected(addId);
    setAddId('');
  }
  function addNode() {
    if (
      !note.conceptGraph ||
      graph.nodes.length >= 10 ||
      graph.edges.length >= 18
    )
      return;
    const id = crypto.randomUUID();
    saveGraph({
      nodes: [...graph.nodes, { id, label: '新概念', description: '' }],
      edges: [
        ...graph.edges,
        { id: crypto.randomUUID(), from: 'root', to: id, label: '包含' },
      ],
    });
    setSelected(id);
    setInspectorOpen(true);
    setEditing(true);
  }
  function removeNode() {
    if (!active || active.id === 'root') return;
    saveGraph({
      nodes: graph.nodes.filter((n) => n.id !== active.id),
      edges: graph.edges.filter(
        (e) => e.from !== active.id && e.to !== active.id,
      ),
    });
    setSelected('root');
  }
  const connections = graph.edges.filter(
    (e) => e.from === active?.id || e.to === active?.id,
  );
  function workbench() {
    return (
      <>
        {tab === 'related' && graph.nodes.length === 1 ? (
          <div className="graph-related-empty">
            <h3>把这篇笔记和其他知识连起来</h3>
            <p>
              {notes.length > 1
                ? '选择下方的笔记和关系，添加第一条连线。'
                : '目前只有这一篇笔记。再保存一篇后，就可以建立关联。'}
            </p>
          </div>
        ) : (
          <div
            className={`graph-workbench ${inspectorOpen ? 'has-inspector' : ''}`}
          >
            <GraphCanvas
              key={`${note.id}-${tab}-${note.conceptGraph?.generatedAt ?? ''}`}
              graph={graph}
              root={root}
              positions={positions}
              selected={inspectorOpen ? (active?.id ?? root) : ''}
              onSelect={(id) => {
                setSelected(id);
                setInspectorOpen(true);
                setEditing(false);
              }}
              onMove={(id, position) =>
                onChange(note.id, {
                  graphPositions: {
                    ...note.graphPositions,
                    [prefix + id]: position,
                  },
                })
              }
            />
            {inspectorOpen && (
              <aside className="graph-inspector" aria-live="polite">
                <button
                  className="icon-button graph-inspector-close"
                  aria-label="关闭节点详情"
                  onClick={() => {
                    setInspectorOpen(false);
                    setEditing(false);
                  }}
                >
                  <X size={16} />
                </button>
                {active && (
                  <>
                    <span className="eyebrow">
                      {tab === 'related' ? '关联笔记' : '概念详情'}
                    </span>
                    <h3>{active.label}</h3>
                    {tab === 'concept' && editing ? (
                      <form
                        key={active.id}
                        className="form-stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          const label = data.get('label');
                          const description = data.get('description');
                          saveGraph({
                            nodes: graph.nodes.map((n) =>
                              n.id === active.id
                                ? {
                                    ...n,
                                    label:
                                      typeof label === 'string' && label.trim()
                                        ? label.trim()
                                        : active.label,
                                    description:
                                      typeof description === 'string'
                                        ? description.trim()
                                        : '',
                                  }
                                : n,
                            ),
                          });
                          setEditing(false);
                        }}
                      >
                        <label>
                          名称
                          <input
                            name="label"
                            defaultValue={active.label}
                            maxLength={36}
                            required
                          />
                        </label>
                        <label>
                          解释
                          <textarea
                            name="description"
                            defaultValue={active.description}
                            rows={5}
                            maxLength={800}
                          />
                        </label>
                        <button type="submit">
                          <Check size={15} />
                          保存修改
                        </button>
                      </form>
                    ) : (
                      <div className="graph-description">
                        {renderText(
                          active.description.slice(
                            0,
                            tab === 'related' ? 420 : 800,
                          ) || '还没有解释，可以编辑补充。',
                        )}
                      </div>
                    )}
                    {active.quote && (
                      <details>
                        <summary>笔记原文依据</summary>
                        <blockquote>{active.quote}</blockquote>
                      </details>
                    )}
                    {tab === 'concept' && !active.quote && (
                      <small className="muted">
                        暂无逐字原文定位，请对照正文核验。
                      </small>
                    )}
                    <div className="graph-relations">
                      <h4>与其他节点的关系</h4>
                      {connections.map((edge) => (
                        <div className="graph-relationship" key={edge.id}>
                          <span>
                            {graph.nodes.find((n) => n.id === edge.from)?.label}
                          </span>
                          <strong>{edge.label}</strong>
                          <span>
                            {graph.nodes.find((n) => n.id === edge.to)?.label}
                          </span>
                          {tab === 'concept' && editing && (
                            <button
                              className="icon-button"
                              aria-label={`删除关系 ${edge.label}`}
                              onClick={() =>
                                saveGraph({
                                  edges: graph.edges.filter(
                                    (e) => e.id !== edge.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="actions">
                      {tab === 'related' &&
                        selectedNote &&
                        selectedNote.id !== note.id && (
                          <button
                            className="primary"
                            onClick={() => {
                              setExpanded(false);
                              onOpen(selectedNote);
                            }}
                          >
                            <BookOpen size={16} />
                            打开笔记
                            <ChevronRight size={15} />
                          </button>
                        )}
                      {tab === 'concept' && (
                        <>
                          <button onClick={() => setEditing(!editing)}>
                            {editing ? '取消编辑' : '编辑概念'}
                          </button>
                          {editing && active.id !== 'root' && (
                            <button className="danger" onClick={removeNode}>
                              <Trash2 size={15} />
                              删除概念
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </aside>
            )}
          </div>
        )}
        {tab === 'related' && (
          <form className="graph-link-form" onSubmit={addRelation}>
            <label>
              关联另一篇笔记
              <select
                aria-label="要关联的笔记"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                required
              >
                <option value="">选择笔记</option>
                {notes
                  .filter((n) => n.id !== note.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              关系
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                <option>相关</option>
                <option>先修知识</option>
                <option>后续应用</option>
                <option>容易混淆</option>
                <option>同一主题</option>
              </select>
            </label>
            <button disabled={!addId} type="submit">
              <Plus size={16} />
              保存关联
            </button>
            <small>已有关系也可以在这里修改，关系以当前笔记为参照。</small>
          </form>
        )}
        {tab === 'concept' && editing && (
          <form
            className="graph-link-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!edgeTo || edgeFrom === edgeTo) return;
              const existing = graph.edges.find(
                (edge) => edge.from === edgeFrom && edge.to === edgeTo,
              );
              saveGraph({
                edges: existing
                  ? graph.edges.map((edge) =>
                      edge === existing ? { ...edge, label: edgeLabel } : edge,
                    )
                  : [
                      ...graph.edges,
                      {
                        id: crypto.randomUUID(),
                        from: edgeFrom,
                        to: edgeTo,
                        label: edgeLabel,
                      },
                    ],
              });
            }}
          >
            <label>
              起点
              <select
                value={edgeFrom}
                onChange={(e) => setEdgeFrom(e.target.value)}
              >
                {graph.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              终点
              <select
                required
                value={edgeTo}
                onChange={(e) => setEdgeTo(e.target.value)}
              >
                <option value="">选择节点</option>
                {graph.nodes
                  .filter((n) => n.id !== edgeFrom)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              关系
              <input
                required
                maxLength={24}
                value={edgeLabel}
                onChange={(e) => setEdgeLabel(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={
                !edgeTo || edgeTo === edgeFrom || graph.edges.length >= 18
              }
            >
              保存关系
            </button>
          </form>
        )}
      </>
    );
  }
  return (
    <section className="note-visuals">
      <div className="note-view-tabs" role="tablist" aria-label="笔记展示方式">
        {(
          [
            { id: 'concept', name: '篇内概念图' },
            { id: 'related', name: '关联笔记' },
            { id: 'text', name: '正文' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`note-panel-${note.id}`}
            id={`note-tab-${note.id}-${item.id}`}
            onClick={() => switchTab(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`note-panel-${note.id}`}
        aria-labelledby={`note-tab-${note.id}-${tab}`}
      >
        {tab === 'text' ? (
          renderText(note.text)
        ) : (
          <>
            <div className="graph-heading">
              <span className="muted">
                {tab === 'related'
                  ? `${local.nodes.length - 1} 篇关联笔记 · 无需 AI`
                  : '仅依据当前笔记 · 生成后保存复用'}
              </span>
              <div className="actions">
                {tab === 'concept' && note.conceptGraph && (
                  <button
                    disabled={
                      graph.nodes.length >= 10 || graph.edges.length >= 18
                    }
                    onClick={addNode}
                  >
                    <Plus size={15} />
                    概念
                  </button>
                )}
                {graph.nodes.length > (tab === 'related' ? 1 : 0) && (
                  <button onClick={() => setExpanded(true)}>
                    <Expand size={15} />
                    展开
                  </button>
                )}
                {tab === 'concept' && (
                  <button
                    className={note.conceptGraph ? '' : 'primary'}
                    disabled={busy || pending.has(key) || !note.text.trim()}
                    onClick={() =>
                      note.conceptGraph
                        ? setConfirmReplace(true)
                        : void generate()
                    }
                  >
                    {busy || pending.has(key) ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : note.conceptGraph ? (
                      <RefreshCw size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}{' '}
                    {busy || pending.has(key)
                      ? '生成中…'
                      : note.conceptGraph
                        ? '重新生成'
                        : '生成概念图'}
                  </button>
                )}
              </div>
            </div>
            {stale && tab === 'concept' && (
              <p className="notice">
                正文或标题已修改，当前图谱可能过期。你可以保留它，或点击重新生成。
              </p>
            )}
            {graph.nodes.length > 0 && (
              <div className="form-stack">
                <input
                  aria-label="搜索概念或关联笔记"
                  placeholder="搜索概念名称或解释"
                  value={nodeQuery}
                  onChange={(e) => setNodeQuery(e.target.value)}
                />
                {nodeQuery.trim() && (
                  <div className="actions">
                    {graph.nodes
                      .filter((node) =>
                        `${node.label} ${node.description ?? ''}`
                          .toLocaleLowerCase()
                          .includes(nodeQuery.trim().toLocaleLowerCase()),
                      )
                      .map((node) => (
                        <button
                          key={node.id}
                          onClick={() => {
                            setSelected(node.id);
                            setInspectorOpen(true);
                          }}
                        >
                          {node.label}
                        </button>
                      ))}
                    {!graph.nodes.some((node) =>
                      `${node.label} ${node.description ?? ''}`
                        .toLocaleLowerCase()
                        .includes(nodeQuery.trim().toLocaleLowerCase()),
                    ) && <p className="muted">没有匹配的概念。</p>}
                  </div>
                )}
              </div>
            )}
            {confirmReplace && (
              <div className="graph-confirm">
                <p>重新生成会调用 AI，并替换当前概念图及手工调整。</p>
                <div className="actions">
                  <button onClick={() => setConfirmReplace(false)}>
                    保留当前图
                  </button>
                  <button className="primary" onClick={() => void generate()}>
                    重新生成并替换
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {graph.nodes.length > 0 ? (
              !expanded && workbench()
            ) : (
              <div className="graph-empty">
                <Sparkles size={30} />
                <h3>把这篇笔记变成一张概念图</h3>
                <p>
                  提取核心概念和关系，点击节点查看解释与原文。只有生成和重新生成会调用
                  AI。
                </p>
                <button
                  onClick={startManualGraph}
                  disabled={busy || pending.has(key)}
                >
                  手动绘制 · 不用 AI
                </button>
              </div>
            )}
            {tab === 'concept' && note.conceptGraph && (
              <p className="muted small">
                {note.conceptGraph.edited ? '含手工修改 · ' : ''}创建于{' '}
                {new Date(note.conceptGraph.generatedAt).toLocaleString(
                  'zh-CN',
                )}{' '}
                · AI 提炼的关系需结合正文核验。
              </p>
            )}
          </>
        )}
      </div>
      <dialog
        ref={dialogRef}
        className="modal graph-modal"
        onCancel={() => setExpanded(false)}
        aria-label="展开笔记图谱"
      >
        <div className="modal-heading">
          <h2>
            {note.title} · {tab === 'related' ? '关联图谱' : '篇内概念图'}
          </h2>
          <button
            className="icon-button"
            aria-label="收起图谱"
            onClick={() => setExpanded(false)}
          >
            <X size={20} />
          </button>
        </div>
        {expanded && workbench()}
      </dialog>
    </section>
  );
}
