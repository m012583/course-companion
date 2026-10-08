import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return import(
    `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
  );
}
const { resolveModel, publicAiSettings, supportsImages } = await load(
  '../lib/ai-provider.ts',
);
const { imageMime, readChatImages, imageMessages } = await load(
  '../lib/chat-images.ts',
);
const { removeChapter, restoreChapter } = await load('../lib/course-trash.ts');

test('official DeepSeek migrates stale provider model names to the vision default without exposing credentials', () => {
  const base = process.env.OPENAI_BASE_URL,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = 'https://api.deepseek.com';
  process.env.OPENAI_API_KEY = 'private-test-key';
  try {
    assert.equal(resolveModel('kimi-k2.7-code'), 'deepseek-flash');
    assert.equal(resolveModel('deepseek-v4-flash'), 'deepseek-flash');
    assert.equal(supportsImages('deepseek-flash'), true);
    assert.equal(supportsImages('deepseek-v4-pro'), false);
    assert.equal(publicAiSettings().configured, true);
    assert.doesNotMatch(JSON.stringify(publicAiSettings()), /private-test-key/);
  } finally {
    if (base === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = base;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});

test('vision uses actual image bytes, bounds image context, rejects fake files and does not persist base64', async () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(imageMime(png), 'image/png');
  assert.throws(
    () => imageMime(new TextEncoder().encode('<html>bad</html>')),
    /格式/,
  );
  assert.throws(
    () => readChatImages([{ fileId: 'https://evil.example', name: 'bad' }]),
    /无效/,
  );
  const images = Array.from({ length: 9 }, () => ({
    fileId: crypto.randomUUID(),
    name: 'test.png',
  }));
  const turns = [0, 3, 6].map((index) => ({
    role: 'user',
    content: '看图',
    images: images.slice(index, index + 3),
  }));
  let calls = 0;
  const messages = await imageMessages(turns, async () => {
    calls++;
    return png;
  });
  assert.equal(calls, 6);
  assert.equal(typeof messages[0].content, 'string');
  assert.match(messages[0].content, /已省略/);
  assert.equal(messages[2].content[1].type, 'image_url');
  assert.match(
    messages[2].content[1].image_url.url,
    /^data:image\/png;base64,/,
  );
  assert.doesNotMatch(JSON.stringify(turns), /base64/);
  const repeated = await imageMessages(
    Array.from({ length: 9 }, () => ({
      role: 'user',
      content: '再次看图',
      images: [images[0]],
    })),
    async () => png,
  );
  assert.equal(
    repeated.filter((message) => Array.isArray(message.content)).length,
    6,
    'repeated attachment IDs must not bypass the six-image token budget',
  );
  await assert.rejects(
    () => imageMessages(turns, async () => new Uint8Array(5 * 1024 * 1024 + 1)),
    /5 MB/,
  );
});

test('chapter deletion retains content, unassigns its notes and materials, and restores only unchanged classifications', () => {
  const chapter = {
    id: 'g1',
    title: '矩阵',
    narrative: '概览',
    keyConcepts: ['定义'],
    prerequisites: [],
    learningGoals: ['运算'],
  };
  const course = {
    id: 'c1',
    name: '数学',
    chapters: ['矩阵'],
    materials: [{ fileId: 'f1', name: '矩阵.pdf', chapter: '矩阵' }],
    guide: { chapters: [chapter], source: 'ai' },
  };
  const notes = [
    { id: 'n1', courseId: 'c1', chapter: '矩阵', text: '必须保留' },
    { id: 'n2', courseId: 'c2', chapter: '矩阵', text: '另一门课程' },
  ];
  const removed = removeChapter(course, notes, '矩阵');
  assert.equal(removed.notes[0].text, '必须保留');
  assert.equal(removed.notes[0].chapter, '');
  assert.equal(removed.notes[1].chapter, '矩阵');
  assert.equal(removed.course.materials[0].chapter, '');
  assert.equal(removed.course.guide.chapters.length, 0);
  const restored = restoreChapter(
    removed.course,
    removed.notes,
    removed.course.removedChapters[0].id,
  );
  assert.equal(restored.course.guide.chapters[0].id, 'g1');
  assert.equal(restored.notes[0].chapter, '矩阵');
  const reclassified = restoreChapter(
    removed.course,
    [{ ...removed.notes[0], chapter: '新的归类' }, removed.notes[1]],
    removed.course.removedChapters[0].id,
  );
  assert.equal(reclassified.notes[0].chapter, '新的归类');
  assert.throws(
    () =>
      restoreChapter(
        { ...removed.course, chapters: ['矩阵'] },
        removed.notes,
        removed.course.removedChapters[0].id,
      ),
    /同名/,
  );
  assert.throws(
    () =>
      restoreChapter(
        { ...removed.course, guide: undefined },
        removed.notes,
        removed.course.removedChapters[0].id,
      ),
    /先恢复课程导览/,
  );
});
