import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(file, replacements = []) {
  let source = await readFile(new URL(file, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const url = await moduleUrl('../lib/note-navigation.ts');
const {
  wikiReferences,
  resolveWikiReference,
  outgoingNoteIds,
  noteConnections,
  searchKnowledge,
  remarkNoteLinks,
} = await import(url);
const { buildKnowledgeNetwork } = await import(
  await moduleUrl('../lib/knowledge-network.ts', [['./note-navigation', url]])
);
const makeNote = (id, title, text = '', extra = {}) => ({
  id,
  title,
  text,
  courseId: 'math',
  course: '线性代数',
  createdAt: '2026-09-11',
  ...extra,
});

test('wiki references preserve aliases and positions and ignore code, math, and escaped examples', () => {
  const body =
    '见 [[矩阵|基础矩阵]] 与 [[ 特征值 ]]。`[[代码]]`\n```md\n[[示例]]\n```\n~~~\n[[另一个示例]]\n~~~\n$[[公式]]$ \\[\\[转义]]';
  const refs = wikiReferences(body);
  assert.deepEqual(
    refs.map((r) => [r.target, r.label]),
    [
      ['矩阵', '基础矩阵'],
      ['特征值', '特征值'],
    ],
  );
  assert.equal(body.slice(refs[0].start, refs[0].end), '[[矩阵|基础矩阵]]');
});

test('same-title notes resolve within the source course; ambiguous references remain unresolved', () => {
  const a = makeNote('a', '矩阵');
  const b = makeNote('b', '矩阵', '', { courseId: 'cs', course: '数据结构' });
  assert.equal(resolveWikiReference('矩阵', [a, b], a).id, 'a');
  assert.equal(resolveWikiReference('矩阵', [a, b]), undefined);
  assert.equal(resolveWikiReference('b', [a, b], a).id, 'b');
  assert.equal(resolveWikiReference('不存在', [a, b], a), undefined);
  assert.equal(
    resolveWikiReference('矩阵', [a, { ...a, id: 'c' }], a),
    undefined,
  );
});

test('manual links and wiki links feed the same backlinks and global network without duplicates', () => {
  const a = makeNote('a', '矩阵', '参考 [[特征值]] 和 [[特征值|谱]]', {
    relatedIds: ['b', 'missing', 'a'],
  });
  const b = makeNote('b', '特征值', '基础来自 [[矩阵]]');
  const notes = [a, b];
  assert.deepEqual(outgoingNoteIds(a, notes), ['b']);
  assert.deepEqual(
    noteConnections(b, notes).incoming.map((n) => n.id),
    ['a'],
  );
  assert.equal(buildKnowledgeNetwork(notes).edges.length, 1);
});

test('soft deletion hides notes and links from search and graph, restoration preserves the original connections', () => {
  const a = makeNote('a', '矩阵', '参考 [[特征值]]', { relatedIds: ['b'] });
  const b = makeNote('b', '特征值', '', {
    starred: true,
    graphPositions: { global: { x: 10, y: 20 } },
  });
  const trashed = { ...b, deletedAt: '2026-09-26' };
  assert.deepEqual(
    searchKnowledge([a, trashed], '特征值').map((n) => n.id),
    ['a'],
  );
  assert.deepEqual(
    buildKnowledgeNetwork([a, trashed]).nodes.map((n) => n.id),
    ['a'],
  );
  assert.equal(buildKnowledgeNetwork([a, trashed]).edges.length, 0);
  assert.equal(noteConnections(a, [a, trashed]).outgoing.length, 0);
  const restored = { ...trashed, deletedAt: undefined };
  assert.equal(buildKnowledgeNetwork([a, restored]).edges.length, 1);
  assert.equal(restored.starred, true);
  assert.deepEqual(restored.graphPositions, b.graphPositions);
  assert.deepEqual(a.relatedIds, ['b']);
});

test('search ranks title matches above body matches and requires all query words', () => {
  const a = makeNote('a', '笔记', '矩阵', { createdAt: '2026-09-26' });
  const b = makeNote('b', '矩阵', '', { tags: ['考试'] });
  assert.deepEqual(
    searchKnowledge([a, b], '矩阵').map((n) => n.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    searchKnowledge([a, b], '矩阵 考试').map((n) => n.id),
    ['b'],
  );
  assert.equal(searchKnowledge([a, b], '缺失词').length, 0);
});

test('renderer adds safe internal links and unique heading IDs while leaving code unchanged', () => {
  const a = makeNote('a', '矩阵');
  const tree = {
    type: 'root',
    children: [
      {
        type: 'heading',
        position: { start: { line: 2 } },
        children: [{ type: 'text', value: '定义' }],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '参考 [[矩阵|定义]] 和 [[不存在]]' }],
      },
      { type: 'inlineCode', value: '[[矩阵]]' },
    ],
  };
  remarkNoteLinks({ notes: [a], source: a })(tree);
  assert.equal(tree.children[0].data.hProperties.id, 'note-heading-2');
  const link = tree.children[1].children.find((n) => n.type === 'link');
  assert.equal(link.url, '#note-ref=a');
  assert.equal(link.children[0].value, '定义');
  assert.equal(tree.children[2].value, '[[矩阵]]');
});
