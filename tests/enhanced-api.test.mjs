import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const load = async (path) => import(await moduleUrl(path));
const { demoWorkspace, demoMaterial, demoCheck } = await load(
  '../lib/demo-course.ts',
);
const { bytesToBase64, digest } = await load('../lib/backup.ts');
const { readEventStream } = await load('../lib/event-stream.ts');
const { lessonRequest } = await load('../lib/chapter-lesson.ts');
const files = new Map();
let saved = null,
  revision = 0,
  failCommit = false;
globalThis.__testStorage = {
  FILES: {
    async get(id) {
      const f = files.get(id);
      return f
        ? {
            size: f.bytes.length,
            arrayBuffer: async () =>
              f.bytes.buffer.slice(
                f.bytes.byteOffset,
                f.bytes.byteOffset + f.bytes.byteLength,
              ),
            httpMetadata: f.options.httpMetadata,
            customMetadata: f.options.customMetadata,
          }
        : null;
    },
    async put(id, data, options) {
      files.set(id, { bytes: new Uint8Array(data), options });
    },
    async delete(id) {
      files.delete(id);
    },
  },
  DB: {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return saved
                ? { payload: JSON.stringify(saved), revision }
                : null;
            },
            async run() {
              if (sql.startsWith('INSERT') && saved === null)
                saved = JSON.parse(args[1]);
              if (sql.startsWith('UPDATE')) {
                if (failCommit || args[2] !== revision)
                  return { meta: { changes: 0 } };
                saved = JSON.parse(args[0]);
                revision++;
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
        async run() {
          return {};
        },
      };
    },
  },
};
const backup = await load('../app/api/backup/route.ts');
const chat = await load('../app/api/chat/route.ts');
const lessons = await load('../app/api/chapter-lesson/route.ts');
const diagnostics = await load('../app/api/learning-check/route.ts');
const { semanticRewrite } = await load('../lib/semantic-search.ts');
const req = (path, body, stream = false) =>
  new Request(`http://localhost:3002/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3002',
      ...(stream ? { Accept: 'text/event-stream' } : {}),
    },
    body: JSON.stringify(body),
  });
test('complete backup restore validates hashes, stages new IDs, commits atomically and exports identical attachment bytes', async () => {
  const old = demoWorkspace();
  saved = old;
  revision = 4;
  files.clear();
  const state = demoWorkspace();
  state.courses[0].materials[0].fileId = 'incoming';
  state.courses[0].studyLab = {
    calibration: {
      materialKeys: ['incoming'],
      toc: '第一章 矩阵',
      updatedAt: 'today',
    },
  };
  const bytes = new TextEncoder().encode('original textbook bytes 中文');
  const bundle = {
    format: 'course-kb-bundle',
    version: 2,
    state,
    files: [
      {
        id: 'incoming',
        name: '教材.txt',
        type: 'text/plain',
        data: bytesToBase64(bytes),
        sha256: await digest(bytes),
      },
    ],
  };
  const broken = structuredClone(bundle);
  broken.files[0].sha256 = '0'.repeat(64);
  assert.equal(
    (await backup.POST(req('backup', { backup: broken, revision: 4 }))).status,
    400,
  );
  assert.equal(saved, old);
  assert.equal(files.size, 0);
  failCommit = true;
  assert.equal(
    (await backup.POST(req('backup', { backup: bundle, revision: 4 }))).status,
    400,
  );
  assert.equal(saved, old);
  assert.equal(files.size, 0);
  failCommit = false;
  const response = await backup.POST(
    req('backup', { backup: bundle, revision: 4 }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.revision, 5);
  assert.equal(files.size, 1);
  assert.notEqual(result.state.courses[0].materials[0].fileId, 'incoming');
  assert.equal(
    result.state.courses[0].studyLab.calibration.materialKeys[0],
    result.state.courses[0].materials[0].fileId,
  );
  const exported = await (await backup.GET()).json();
  assert.equal(exported.files[0].data, bytesToBase64(bytes));
  assert.equal(exported.files[0].sha256, bundle.files[0].sha256);
  assert.equal(
    (await backup.POST(req('backup', { backup: bundle, revision: 4 }))).status,
    409,
  );
  assert.equal(files.size, 1);
});
test('legacy text backup with missing attachments requires explicit opt-in', async () => {
  const state = demoWorkspace();
  state.courses[0].materials[0].fileId = 'unavailable';
  const before = saved;
  assert.equal(
    (await backup.POST(req('backup', { backup: state, revision }))).status,
    400,
  );
  assert.equal(saved, before);
  const result = await backup.POST(
    req('backup', { backup: state, revision, allowMissing: true }),
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).missing, 1);
});
test('chat streams real deltas and status, filters invented citations, returns source metadata', async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.stream, true);
    assert.ok(sent.messages[0].content.includes('矩阵乘法'));
    const chunks = [
      'data: {"choices":[{"delta":{"content":"先 B 后 A [S1]。"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"不存在的引用 [S99]。"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];
    return new Response(
      new ReadableStream({
        start(c) {
          chunks.forEach((chunk) => c.enqueue(new TextEncoder().encode(chunk)));
          c.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
  try {
    const response = await chat.POST(
      req('chat', { question: '矩阵乘法', contexts: [demoMaterial()] }, true),
    );
    const events = [];
    for await (const raw of readEventStream(response.body))
      events.push(JSON.parse(raw));
    assert.equal(calls, 1);
    assert.equal(events.filter((e) => e.type === 'delta').length, 2);
    assert.ok(
      events.some((e) => e.type === 'status' && e.text.includes('检索')),
    );
    const done = events.find((e) => e.type === 'done');
    assert.ok(done.answer.includes('[无对应原文]'));
    assert.ok(done.evidence.some((e) => e.id === 'S1'));
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test('grounded chapter generation sends only real selected passages and retains evidence across persistence', async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  const course = demoWorkspace().courses[0],
    chapter = course.guide.chapters[0];
  globalThis.fetch = async (_url, options) => {
    const sent = JSON.parse(options.body);
    assert.doesNotMatch(sent.messages[0].content, /没有教材原文/);
    const context = JSON.parse(sent.messages[1].content);
    assert.ok(context.evidence.length > 0);
    assert.ok(
      course.materials[0].passages.some(
        (p) => p.text === context.evidence[0].quote,
      ),
    );
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...chapter.lesson,
              overview: '根据教材理解矩阵 [S99]。',
            }),
          },
        },
      ],
    });
  };
  try {
    const response = await lessons.POST(
      req('chapter-lesson', {
        ...lessonRequest(course.name, course.guide, chapter),
        contexts: course.materials,
      }),
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.lesson.evidence.length > 0);
    assert.ok(result.lesson.materialFingerprint);
    assert.ok(result.lesson.overview.includes('[无对应原文]'));
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test('diagnostic generation rejects absent grounding without calling any model', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('unexpected paid call');
  };
  try {
    const response = await diagnostics.POST(
      req('learning-check', { terms: ['矩阵乘法', '特征向量'], materials: [] }),
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test('cancelling a streamed response aborts the upstream model request', async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  let upstreamSignal;
  let fetched;
  const started = new Promise((resolve) => {
    fetched = resolve;
  });
  globalThis.fetch = async (_url, options) => {
    upstreamSignal = options.signal;
    fetched();
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        'abort',
        () => reject(options.signal.reason),
        { once: true },
      );
    });
  };
  try {
    const response = await chat.POST(
      req('chat', { question: '矩阵乘法', contexts: [demoMaterial()] }, true),
    );
    await started;
    await response.body.cancel();
    assert.equal(upstreamSignal.aborted, true);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test('semantic rewriting is bounded, cached and safely falls back when invalid', async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).max_tokens, 220);
    return Response.json({
      choices: [
        {
          message: {
            content: calls === 1 ? '["特征向量"]' : '{"invalid":true}',
          },
        },
      ],
    });
  };
  try {
    const signal = new AbortController().signal;
    assert.deepEqual(
      (await semanticRewrite('方向呢', 'test', undefined, signal)).rewrites,
      ['特征向量'],
    );
    assert.match(
      (await semanticRewrite('方向呢', 'test', undefined, signal)).status,
      /缓存/,
    );
    assert.equal(calls, 1);
    assert.match(
      (await semanticRewrite('另一个问法', 'test', undefined, signal)).status,
      /回退/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
test('AI diagnostics return two validated questions grounded in actual selected material', async () => {
  const original = globalThis.fetch,
    key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(JSON.parse(options.body).messages[1].content);
    const questions = demoCheck().questions.map((q) => ({
      ...q,
      sourceIds: [payload.evidence.find((e) => e.section === q.term).id],
    }));
    return Response.json({
      choices: [
        {
          message: { content: JSON.stringify({ questions }) },
          finish_reason: 'stop',
        },
      ],
    });
  };
  try {
    const response = await diagnostics.POST(
      req('learning-check', {
        terms: ['矩阵乘法', '特征向量'],
        materials: [demoMaterial()],
      }),
    );
    assert.equal(response.status, 200);
    const { check } = await response.json();
    assert.equal(check.source, 'ai');
    assert.equal(check.questions.length, 2);
    assert.ok(
      check.evidence.every((e) =>
        demoMaterial().passages.some((p) => p.text === e.quote),
      ),
    );
    assert.equal(check.planId, undefined);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
