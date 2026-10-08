import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  if (source.includes('@/lib/ai-provider'))
    source = source.replace(
      '@/lib/ai-provider',
      await moduleUrl('../lib/ai-provider.ts'),
    );
  for (const [from, to] of replacements) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const navigationUrl = await moduleUrl('../lib/note-navigation.ts');
const graphUrl = await moduleUrl('../lib/note-graph.ts', [
  ['./note-navigation', navigationUrl],
]);
const { buildKnowledgeNetwork, neighborhood, layoutNetwork } = await import(
  await moduleUrl('../lib/knowledge-network.ts', [
    ['./note-navigation', navigationUrl],
  ])
);

test('whole-library graph deduplicates mutual links, retains isolated notes and ignores missing targets', () => {
  const notes = [
    {
      id: 'a',
      relatedIds: ['b', 'b', 'gone', 'a'],
      relatedLabels: { b: '先修知识' },
    },
    { id: 'b', relatedIds: ['a', 'c'] },
    { id: 'c', relatedIds: [] },
    { id: 'isolated', relatedIds: [] },
  ];
  const graph = buildKnowledgeNetwork(notes);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(graph.edges[0].labels, ['先修知识', '已关联']);
  assert.deepEqual(
    neighborhood(graph, 'a', 1).nodes.map((n) => n.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    neighborhood(graph, 'a', 2).nodes.map((n) => n.id),
    ['a', 'b', 'c'],
  );
  assert.equal(neighborhood(graph, 'isolated', 2).nodes.length, 1);
  assert.equal(neighborhood(graph, 'missing', 2).nodes.length, 0);
  const filtered = buildKnowledgeNetwork(notes.filter((n) => n.id !== 'b'));
  assert.equal(filtered.edges.length, 0);
});
test('network layout is deterministic and keeps finite positions for small and large libraries', () => {
  for (const size of [0, 1, 10, 501]) {
    const graph = buildKnowledgeNetwork(
      Array.from({ length: size }, (_, i) => ({
        id: String(i),
        relatedIds: i ? [String(i - 1)] : [],
      })),
    );
    const positions = layoutNetwork(graph);
    assert.equal(Object.keys(positions).length, size);
    assert.ok(
      Object.values(positions).every(
        (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
    );
    assert.deepEqual(positions, layoutNetwork(graph));
  }
});
const { parseConceptGraph, noteFingerprint, relatedGraph } = await import(
  graphUrl
);
const { POST } = await import(
  await moduleUrl('../app/api/knowledge-map/route.ts', [
    ['@/lib/note-graph', graphUrl],
  ])
);
const content = '矩阵的迹是主对角线元素之和。迹满足线性性。';
const fixture = () => ({
  nodes: [
    { id: 'root', label: '矩阵的迹', quote: '矩阵的迹是主对角线元素之和。' },
    { id: 'linear', label: '线性性', quote: '不在笔记里的引用' },
  ],
  edges: [{ from: 'root', to: 'linear', label: '满足' }],
});
test('graph preserves only exact note quotations and fingerprints its source', () => {
  const graph = parseConceptGraph(
    '```json\n' + JSON.stringify(fixture()) + '\n```',
    '矩阵',
    content,
  );
  assert.equal(graph.nodes[0].quote, '矩阵的迹是主对角线元素之和。');
  assert.equal(graph.nodes[1].quote, undefined);
  assert.equal(graph.sourceFingerprint, noteFingerprint('矩阵', content));
  assert.notEqual(
    graph.sourceFingerprint,
    noteFingerprint('矩阵', content + '修改'),
  );
  assert.notEqual(graph.sourceFingerprint, noteFingerprint('新标题', content));
});
test('invalid model output is rejected instead of replaced by a demonstration graph', () => {
  for (const mutate of [
    (g) => {
      g.nodes[1].id = 'root';
    },
    (g) => {
      g.edges[0].to = 'missing';
    },
    (g) => {
      g.edges[0].to = 'root';
    },
    (g) => {
      g.edges = [];
    },
    (g) => {
      g.nodes[0].id = 'another';
    },
    (g) => {
      g.edges.push({ ...g.edges[0] });
    },
    (g) => {
      g.nodes[1].label = ' ';
    },
  ]) {
    const graph = fixture();
    mutate(graph);
    assert.throws(() =>
      parseConceptGraph(JSON.stringify(graph), '矩阵', content),
    );
  }
  assert.throws(() => parseConceptGraph('not JSON', '矩阵', content));
});
test('related graph uses saved incoming and outgoing links and ignores deleted notes', () => {
  const root = {
    id: 'a',
    title: '矩阵',
    text: '',
    relatedIds: ['b', 'deleted'],
    relatedLabels: { b: '先修知识' },
  };
  const graph = relatedGraph(root, [
    root,
    { id: 'b', title: '向量', text: '' },
    { id: 'c', title: '秩', text: '', relatedIds: ['a'] },
    { id: 'd', title: '相似标题', text: '' },
  ]);
  assert.deepEqual(
    graph.nodes.map((n) => n.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    graph.edges.map((e) => e.label),
    ['先修知识', '已关联'],
  );
});
test('API validates requests and reports missing configuration without contacting a model', async () => {
  const oldKey = process.env.OPENAI_API_KEY,
    originalFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = () => {
    throw new Error('unexpected model request');
  };
  const request = (body, origin) =>
    new Request('http://localhost/api/knowledge-map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await POST(
          request({ title: '矩阵', content }, 'https://another.example'),
        )
      ).status,
      403,
    );
    assert.equal(
      (await POST(request({ title: '矩阵', content: '' }))).status,
      400,
    );
    assert.equal(
      (await POST(request({ title: '矩阵', content: '字'.repeat(24001) })))
        .status,
      413,
    );
    assert.equal((await POST(request({ title: '矩阵', content }))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test('API sends only the requested note and preserves valid model graph, rejecting malformed responses', async () => {
  const oldKey = process.env.OPENAI_API_KEY,
    originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  const request = () =>
    new Request('http://localhost/api/knowledge-map', {
      method: 'POST',
      body: JSON.stringify({ title: '矩阵', content, model: 'test-model' }),
    });
  try {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, 'test-model');
      assert.deepEqual(JSON.parse(sent.messages[1].content), {
        title: '矩阵',
        笔记正文: content,
      });
      return Response.json({
        choices: [{ message: { content: JSON.stringify(fixture()) } }],
      });
    };
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).graph.nodes.length, 2);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: '{}' } }] });
    const invalid = await POST(request());
    assert.equal(invalid.status, 502);
    assert.equal((await invalid.json()).graph, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
