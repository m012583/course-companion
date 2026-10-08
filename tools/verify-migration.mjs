// This deliberately refuses any nonempty workspace or mismatched server instance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { moduleUrl } from '../tests/load-ts.mjs';
const args = process.argv.slice(2);
const parameter = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--base-url') || !args.includes('--expected-root'))
  throw new Error(
    'Supply --base-url and --expected-root for an EMPTY disposable instance.',
  );
const base = new URL(parameter('--base-url'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw new Error('Only local test servers are allowed.');
const instance = createHash('sha256')
  .update(resolve(parameter('--expected-root')).toLowerCase())
  .digest('hex')
  .slice(0, 16);
const get = async (path) => {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  return response.json();
};
const post = (path, data) =>
  fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base.origin },
    body: JSON.stringify(data),
  });
const health = await get('/api/health');
assert.equal(health.app, 'course-kb-v2');
assert.equal(
  health.instance,
  instance,
  'This is not the intended disposable instance',
);
const initial = await get('/api/workspace');
assert.equal(initial.state, null, 'Refusing to overwrite a nonempty workspace');
assert.equal(initial.revision, 0);
assert.equal(
  (await get('/api/ai-settings')).configured,
  false,
  'Clean package must not contain an API key',
);
const { demoWorkspace, demoCheck } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const { planFromCheck } = await import(
  await moduleUrl('../lib/learning-check.ts')
);
const bytes = Buffer.from('portable attachment 中文\n\u0000\u00ff');
const form = new FormData();
form.append(
  'file',
  new File([bytes], '迁移测试教材.txt', { type: 'text/plain' }),
);
const upload = await fetch(new URL('/api/files', base), {
  method: 'POST',
  body: form,
});
assert.equal(upload.status, 200);
const { id } = await upload.json();
const state = demoWorkspace();
state.courses[0].materials[0].fileId = id;
const check = {
  ...demoCheck(),
  answers: [0, 2],
  submittedAt: new Date().toISOString(),
};
check.evidence.forEach((e) => {
  e.fileId = id;
});
const plan = planFromCheck(check, state.courses[0]);
check.planId = plan.id;
state.reviewPlans.push(plan);
state.courses[0].studyLab = {
  calibration: {
    materialKeys: [id],
    toc: '第一章 矩阵与线性变换',
    updatedAt: new Date().toISOString(),
  },
  checks: [check],
};
assert.equal(
  (
    await fetch(new URL('/api/workspace', base), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: base.origin },
      body: JSON.stringify({ state, revision: 0 }),
    })
  ).status,
  200,
);
const backup = await get('/api/backup');
assert.equal(backup.files.length, 1);
assert.equal(
  backup.files[0].sha256,
  createHash('sha256').update(bytes).digest('hex'),
);
const damaged = structuredClone(backup);
damaged.files[0].sha256 = '0'.repeat(64);
assert.equal(
  (await post('/api/backup', { backup: damaged, revision: 1 })).status,
  400,
);
assert.deepEqual(
  (await get('/api/workspace')).state,
  JSON.parse(JSON.stringify(state)),
);
const response = await post('/api/backup', { backup, revision: 1 });
assert.equal(response.status, 200);
const restored = await response.json();
const restoredId = restored.state.courses[0].materials[0].fileId;
assert.notEqual(restoredId, id);
assert.equal(
  restored.state.courses[0].studyLab.calibration.materialKeys[0],
  restoredId,
);
assert.equal(
  restored.state.courses[0].studyLab.checks[0].evidence[0].fileId,
  restoredId,
);
assert.equal(restored.state.reviewPlans[0].id, check.planId);
assert.deepEqual(restored.state.courses[0].studyLab.checks[0].answers, [0, 2]);
const fileResponse = await fetch(new URL('/api/files?id=' + restoredId, base));
assert.equal(fileResponse.status, 200);
assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), bytes);
assert.equal((await post('/api/backup', { backup, revision: 1 })).status, 409);
const reexported = await get('/api/backup');
assert.equal(reexported.files[0].data, backup.files[0].data);
assert.deepEqual((await get('/api/workspace')).state, restored.state);
const report = {
  verifiedAt: new Date().toISOString(),
  baseUrl: base.origin,
  cleanWorkspace: true,
  noApiKey: true,
  attachmentByteRoundtrip: true,
  remappedSelectionsAndCitations: true,
  diagnosticAnswersAndPlanPreserved: true,
  corruptBackupRejectedWithoutWrites: true,
  staleRevisionRejected: true,
  notes:
    '同一台 Windows 电脑的独立解压目录，真实本地 D1/R2；未冒充第二台电脑或浏览器 UI 验收。',
};
await mkdir('docs/evaluation', { recursive: true });
await writeFile(
  'docs/evaluation/migration-check.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
