import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Explicit opt-in: real provider requests incur service usage; no workspace writes.
if (process.env.COURSE_KB_LIVE_EVAL !== 'self-authored-only')
  throw new Error('Set COURSE_KB_LIVE_EVAL=self-authored-only');
const entries = (await readFile('../course-knowledge-base/.env.local', 'utf8'))
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.trim().startsWith('#'))
  .map((l) => {
    const n = l.indexOf('=');
    return [
      l.slice(0, n).trim(),
      l
        .slice(n + 1)
        .trim()
        .replace(/^['"]|['"]$/g, ''),
    ];
  });
const env = Object.fromEntries(entries);
const config = {
  apiKey: env.OPENAI_API_KEY,
  baseUrl: env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  model: env.OPENAI_MODEL || 'deepseek-flash',
};
if (!config.apiKey) throw new Error('No configured key');
const dir = await mkdtemp(join(tmpdir(), 'course-live-'));
const results = [];
try {
  await build({
    entryPoints: ['app/api/chat/route.ts'],
    outfile: join(dir, 'route.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'evaluation-config',
        setup(b) {
          b.onResolve({ filter: /ai-settings$/ }, () => ({
            path: 'config',
            namespace: 'evaluation',
          }));
          b.onLoad({ filter: /.*/, namespace: 'evaluation' }, () => ({
            contents:
              'export async function readAIConfig(){return globalThis.__courseEvaluationConfig};export function providerError(status){return "Provider status "+status}',
            loader: 'js',
          }));
        },
      },
    ],
  });
  globalThis.__courseEvaluationConfig = config;
  const { POST } = await import(pathToFileURL(join(dir, 'route.mjs')).href);
  for (const item of JSON.parse(
    await readFile('evaluation/reliability-fixture.json', 'utf8'),
  )) {
    const started = performance.now();
    try {
      const r = await POST(
        new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        }),
      );
      const data = await r.json();
      results.push({
        ...item,
        status: r.status,
        elapsedMs: Math.round(performance.now() - started),
        ...data,
        review: '待逐题核对',
      });
      console.log(item.id, r.status);
    } catch {
      results.push({
        ...item,
        status: 'failed',
        review: '请求失败，未生成模拟结果',
      });
      console.log(item.id, 'failed');
    }
  }
  await writeFile(
    process.env.COURSE_KB_EVAL_OUTPUT || 'evaluation/reliability-live.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        model: config.model,
        scope:
          '自编新增回归集，非独立盲测；通过当前路由代码调用真实服务，无用户资料',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  delete globalThis.__courseEvaluationConfig;
  await rm(dir, { recursive: true, force: true });
}
