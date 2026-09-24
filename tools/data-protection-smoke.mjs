import assert from 'node:assert/strict';
const base = process.env.COURSE_KB_STORAGE_URL;
if (
  base !== 'http://localhost:3015' ||
  process.env.COURSE_KB_ALLOW_TEST_WRITES !== 'isolated-test-workspace'
)
  throw new Error('Requires isolated workspace');
const get = async (path) => {
  const r = await fetch(base + path);
  assert.equal(r.status, 200);
  return r.json();
};
const current = await get('/api/workspace');
assert.ok(current.state.courses.every((c) => c.id.startsWith('storage-test-')));
const history = await get('/api/backup?history=1');
const automatic = history.history.filter((x) => x.id.startsWith('auto-'));
assert.ok(automatic.length > 0 && automatic.length <= 20);
const draft = {
  id: 'storage-test-draft',
  title: '未完成草稿',
  text: '草稿正文',
  course: current.state.courses[0].name,
  courseId: current.state.courses[0].id,
  createdAt: new Date().toISOString(),
  sources: current.state.notes[0]?.sources,
};
const state = { ...current.state, drafts: [draft] };
const save = await fetch(base + '/api/workspace', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state, revision: current.revision }),
});
assert.equal(save.status, 200);
const backup = await get('/api/backup');
assert.deepEqual(
  backup.state.drafts,
  [draft].map((d) => JSON.parse(JSON.stringify(d))),
);
const stale = await fetch(base + '/api/workspace', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    state: { ...state, drafts: [] },
    revision: current.revision,
  }),
});
assert.equal(stale.status, 409);
assert.deepEqual(
  (await get('/api/workspace')).state.drafts,
  backup.state.drafts,
);
assert.equal(
  (await get('/api/backup?history=1')).history.filter((x) =>
    x.id.startsWith('auto-'),
  ).length,
  automatic.length,
);
const snap = await get(
  '/api/backup?recovery=' + encodeURIComponent(automatic[0].id),
);
assert.equal(snap.format, 'course-companion');
assert.ok(Array.isArray(snap.files));
console.log(
  'PASS automatic snapshot download/throttle, draft backup and conflicting write preserves drafts',
);

