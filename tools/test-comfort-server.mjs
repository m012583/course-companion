import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'comfort-test-'));
const oldFetch = globalThis.fetch;
try {
  const outfile = join(dir, 'route.mjs');
  await build({
    entryPoints: ['app/api/chat/route.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'mock-config',
        setup(b) {
          b.onResolve({ filter: /ai-settings$/ }, () => ({
            path: 'config',
            namespace: 'mock',
          }));
          b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
            contents: `export async function readAIConfig(){return {apiKey:'fake-key',baseUrl:'https://example.invalid',model:'fake'}};export function providerError(){return '请求失败'}`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const { POST } = await import(pathToFileURL(outfile).href);
  const input = {
    stream: true,
    question: '矩阵秩',
    contexts: [
      {
        name: '测试',
        passages: [{ text: '矩阵秩等于非零行数', section: '秩' }],
      },
    ],
  };
  let upstreamSignal;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    upstreamSignal = init.signal;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(
      'data: ' +
        JSON.stringify({
          choices: [{ delta: { content: '矩阵秩 [S1] 未知 [S99]' } }],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
    return new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += 3)
            c.enqueue(bytes.slice(i, i + 3));
          c.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
  const request = () =>
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  const result = await POST(request());
  const lines = (await result.text()).trim().split('\n').map(JSON.parse);
  assert.equal(lines.at(-1).type, 'done');
  assert.ok(lines.at(-1).answer.includes('矩阵秩'));
  assert.ok(!lines.at(-1).answer.includes('[S99]'));
  assert.equal(lines.at(-1).evidence[0].id, 'S1');
  globalThis.fetch = async () =>
    new Response(
      'data: ' +
        JSON.stringify({ choices: [{ delta: { content: '部分内容' } }] }) +
        '\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  const broken = await POST(request());
  assert.equal(
    (await broken.text()).trim().split('\n').map(JSON.parse).at(-1).type,
    'error',
  );
  let cancelled = false;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    upstreamSignal = init.signal;
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"正在生成"}}]}\n\n',
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  };
  const pending = await POST(request());
  const reader = pending.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.ok(upstreamSignal.aborted);
  // Validate pre-change backup with the same production validator, including hashes.
  const backupOut = join(dir, 'backup.mjs');
  await build({
    entryPoints: ['lib/backup.ts'],
    outfile: backupOut,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { validateBackup } = await import(pathToFileURL(backupOut).href);
  if (process.env.COURSE_KB_VERIFY_BACKUP)
    await validateBackup(
      JSON.parse(await readFile(process.env.COURSE_KB_VERIFY_BACKUP, 'utf8')),
    );
  const searchOut = join(dir, 'search.mjs');
  await build({
    entryPoints: ['lib/search.ts'],
    outfile: searchOut,
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { searchWorkspace } = await import(pathToFileURL(searchOut).href);
  const hits = searchWorkspace(
    {
      courses: [
        {
          id: 'c',
          name: '代数',
          materials: [
            {
              name: '讲义',
              passages: [{ text: '可逆矩阵', section: '第一章' }],
            },
          ],
          sessions: [],
        },
      ],
      notes: [],
      tasks: [],
    },
    '可逆',
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, '资料');
  assert.equal(searchWorkspace({ courses: [], notes: [] }, '').length, 0);
  console.log(
    'Passed: fragmented UTF-8 SSE, citation validation, interrupted streams, cancellation signal, redirect handling and cross-content search.',
  );
  void cancelled;
} finally {
  globalThis.fetch = oldFetch;
  await rm(dir, { recursive: true, force: true });
}
