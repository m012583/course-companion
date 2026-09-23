import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'course-domain-'));
try {
  await build({
    entryPoints: ['tests/domain.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(dir, 'test.mjs'),
  });
  await import(pathToFileURL(join(dir, 'test.mjs')).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
