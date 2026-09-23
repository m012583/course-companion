import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
const base = process.env.COURSE_KB_STORAGE_URL;
if (
  !base ||
  new URL(base).hostname !== 'localhost' ||
  process.env.COURSE_KB_ALLOW_TEST_WRITES !== 'isolated-test-workspace'
)
  throw new Error(
    '必须显式设置隔离本机测试地址和 COURSE_KB_ALLOW_TEST_WRITES=isolated-test-workspace',
  );
const get = async (path) => {
  const res = await fetch(base + path);
  assert.equal(res.status, 200);
  return res.json();
};
const send = async (path, body, method = 'POST') =>
  fetch(base + path, {
    method: method === 'PUT' ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const initial = await get('/api/workspace');
if (
  initial.state &&
  !initial.state.courses?.every((c) => c.id.startsWith('storage-test-'))
)
  throw new Error('目标包含非测试数据，拒绝覆盖');
const content = '备份恢复测试：附件正文与笔记引用必须保留。';
const form = new FormData();
form.set(
  'file',
  new File([content], 'storage-fixture.txt', { type: 'text/plain' }),
);
const upload = await fetch(base + '/api/files', { method: 'POST', body: form });
assert.equal(upload.status, 200);
const { id } = await upload.json();
const state = {
  courses: [
    {
      id: 'storage-test-course',
      name: '备份验收课程',
      code: '',
      graphFocus: '',
      sessions: [],
      materials: [
        {
          name: 'storage-fixture.txt',
          type: 'TXT',
          size: '1 KB',
          status: '已解析',
          fileId: id,
          content,
        },
      ],
    },
  ],
  notes: [],
  tasks: [],
};
const put = await send(
  '/api/workspace',
  { state, revision: initial.revision },
  'PUT',
);
assert.equal(put.status, 200);
const revision = (await put.json()).revision;
assert.equal(
  (await send('/api/workspace', { state, revision: revision - 1 }, 'PUT'))
    .status,
  409,
);
assert.equal(
  (
    await send(
      '/api/workspace',
      { state: { courses: [null] }, revision },
      'PUT',
    )
  ).status,
  400,
);
const backup = await get('/api/backup');
assert.equal(Buffer.from(backup.files[0].data, 'base64').toString(), content);
assert.equal(
  backup.files[0].sha256,
  createHash('sha256').update(content).digest('hex'),
);
const broken = structuredClone(backup);
broken.files[0].sha256 = '0'.repeat(64);
assert.equal(
  (await send('/api/backup', { backup: broken, revision })).status,
  400,
);
assert.deepEqual((await get('/api/workspace')).state, state);
assert.equal(
  (await send('/api/backup', { backup, revision: revision - 1 })).status,
  409,
);
const restored = await send('/api/backup', { backup, revision });
assert.equal(restored.status, 200);
const result = await restored.json();
const newId = result.state.courses[0].materials[0].fileId;
assert.notEqual(newId, id);
assert.equal(
  await (await fetch(base + '/api/files?id=' + newId)).text(),
  content,
);
assert.equal(await (await fetch(base + '/api/files?id=' + id)).text(), content);
const history = await get('/api/backup?history=1');
assert.ok(history.history.some((item) => item.id === result.recoveryId));
const recovery = await get('/api/backup?recovery=' + result.recoveryId);
assert.deepEqual(recovery.state, state);
const undo = await send('/api/backup', {
  backup: recovery,
  revision: result.revision,
});
assert.equal(undo.status, 200);
const final = await get('/api/workspace');
assert.equal(final.state.courses[0].name, '备份验收课程');
assert.equal(
  (await fetch(base + '/api/files?id=' + id, { method: 'DELETE' })).status,
  409,
);
assert.equal(
  (
    await fetch(base + '/api/backup', {
      method: 'POST',
      headers: {
        Origin: 'https://foreign.invalid',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
  ).status,
  403,
);
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/storage-report.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      base,
      revision: final.revision,
      checks: [
        'attachment roundtrip',
        'SHA-256',
        'corrupt backup rejected with state unchanged',
        'stale PUT and restore rejected',
        'new attachment IDs',
        'prior files retained',
        'recovery snapshot roundtrip',
        'physical deletion protected',
        'cross-origin mutation rejected',
      ],
      restartPending: true,
    },
    null,
    2,
  ),
);
console.log('PASS real D1/R2 storage, 9 checks. Restart verification pending.');
