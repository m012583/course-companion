import type { Note } from './knowledge';

export type NetworkEdge = {
  id: string;
  from: string;
  to: string;
  labels: string[];
};
export type NetworkData = { nodes: Note[]; edges: NetworkEdge[] };
export function buildKnowledgeNetwork(notes: Note[]): NetworkData {
  const nodes = [...new Map(notes.map((n) => [n.id, n])).values()];
  const ids = new Set(nodes.map((n) => n.id));
  const edges = new Map<string, NetworkEdge>();
  for (const note of nodes)
    for (const related of new Set(note.relatedIds ?? [])) {
      if (related === note.id || !ids.has(related)) continue;
      const pair = [note.id, related].sort();
      const id = JSON.stringify(pair);
      const label = note.relatedLabels?.[related] || '已关联';
      const edge = edges.get(id);
      if (edge) {
        if (!edge.labels.includes(label)) edge.labels.push(label);
      } else edges.set(id, { id, from: pair[0], to: pair[1], labels: [label] });
    }
  return { nodes, edges: [...edges.values()] };
}
export function neighborhood(
  graph: NetworkData,
  root: string,
  depth: number,
): NetworkData {
  if (!graph.nodes.some((n) => n.id === root)) return { nodes: [], edges: [] };
  const included = new Set([root]);
  const adjacency = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, new Set());
    if (!adjacency.has(e.to)) adjacency.set(e.to, new Set());
    adjacency.get(e.from)!.add(e.to);
    adjacency.get(e.to)!.add(e.from);
  }
  let frontier = [root];
  for (let i = 0; i < depth; i++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!included.has(neighbor)) {
          included.add(neighbor);
          next.push(neighbor);
        }
      }
    frontier = next;
  }
  return {
    nodes: graph.nodes.filter((n) => included.has(n.id)),
    edges: graph.edges.filter(
      (e) => included.has(e.from) && included.has(e.to),
    ),
  };
}

export function layoutNetwork(graph: NetworkData) {
  const count = graph.nodes.length;
  const radius = Math.max(110, Math.sqrt(count) * 48);
  const points = graph.nodes.map((n, i) => {
    const angle = i * 2.3999632297,
      distance = radius * Math.sqrt((i + 0.5) / Math.max(count, 1));
    return {
      id: n.id,
      x: 500 + Math.cos(angle) * distance,
      y: 320 + Math.sin(angle) * distance,
    };
  });
  const index = new Map(points.map((p, i) => [p.id, i]));
  // A bounded static simulation keeps the page idle after layout. Large libraries
  // use the evenly spaced initial layout instead of a quadratic calculation.
  if (count <= 500)
    for (let step = 0; step < 70; step++) {
      const forces = points.map(() => ({ x: 0, y: 0 }));
      for (let a = 0; a < count; a++)
        for (let b = a + 1; b < count; b++) {
          const dx = points[a].x - points[b].x,
            dy = points[a].y - points[b].y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const force = Math.min(10, 2100 / (distance * distance));
          forces[a].x += (dx / distance) * force;
          forces[a].y += (dy / distance) * force;
          forces[b].x -= (dx / distance) * force;
          forces[b].y -= (dy / distance) * force;
        }
      for (const edge of graph.edges) {
        const a = index.get(edge.from),
          b = index.get(edge.to);
        if (a === undefined || b === undefined) continue;
        const dx = points[b].x - points[a].x,
          dy = points[b].y - points[a].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const force = (distance - 125) * 0.035;
        forces[a].x += (dx / distance) * force;
        forces[a].y += (dy / distance) * force;
        forces[b].x -= (dx / distance) * force;
        forces[b].y -= (dy / distance) * force;
      }
      points.forEach((p, i) => {
        p.x += Math.max(-12, Math.min(12, forces[i].x));
        p.y += Math.max(-12, Math.min(12, forces[i].y));
      });
    }
  return Object.fromEntries(points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
