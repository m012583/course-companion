import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'course-ai-config-'));
const oldKey = process.env.OPENAI_API_KEY;
const oldFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Invalid configuration must not reach the provider');
  };
  const bodies = {
    chat: { question: '测试问题', contexts: [] },
    'knowledge-map': { title: '测试', content: '测试正文' },
    plans: { courses: [], dueCount: 0, upcomingCount: 0 },
  };
  for (const [name, body] of Object.entries(bodies)) {
    const outfile = join(dir, `${name}.mjs`);
    await build({
      plugins: [
        {
          name: 'isolated-storage',
          setup(b) {
            b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
              path: 'storage',
              namespace: 'test',
            }));
            b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
              contents:
                'export const env={DB:{prepare(){return {bind(){return this},async first(){return null},async run(){}}}}};',
              loader: 'js',
            }));
          },
        },
      ],
      entryPoints: [`app/api/${name}/route.ts`],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile,
    });
    const { POST } = await import(pathToFileURL(outfile).href);
    for (const key of ['说明文字=fake-test-key', 'fake key', 'fake\nkey', '']) {
      process.env.OPENAI_API_KEY = key;
      const response = await POST(
        new Request(`http://localhost/api/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 503);
      const text = await response.text();
      if (key)
        assert.ok(!text.includes(key), 'Response must not echo credential');
    }
  }
  assert.equal(calls, 0);
  console.log(
    'All three AI routes reject malformed credentials before fetch; no credentials echoed.',
  );
} finally {
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = oldKey;
  globalThis.fetch = oldFetch;
  await rm(dir, { recursive: true, force: true });
}
