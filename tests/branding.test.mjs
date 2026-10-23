import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const { BRAND_NAME, migrateBrandPreferences } = await import(
  await moduleUrl('../lib/branding.ts')
);
const { demoWorkspace } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const { validateWorkspace, parseBackup } = await import(
  await moduleUrl('../lib/backup.ts')
);

test('legacy default branding upgrades without changing custom preferences or the input', () => {
  for (const brandName of [
    '课伴',
    '课伴·研学版',
    '课伴 · 研学增强版',
    '课伴研学增强版',
    '课伴知识库',
  ]) {
    const original = {
      brandName,
      userName: '学习者',
      semester: '秋季',
      reviewMinutes: 30,
      reviewSnoozes: { n1: '2026-10-22' },
    };
    const before = structuredClone(original);
    const upgraded = migrateBrandPreferences(original);
    assert.deepEqual(upgraded, { ...before, brandName: BRAND_NAME });
    assert.deepEqual(original, before);
    assert.strictEqual(migrateBrandPreferences(upgraded), upgraded);
  }
  for (const brandName of ['我的课程空间', '课伴讨论小组', BRAND_NAME, '']) {
    const custom = { brandName, userName: '同学', semester: '秋季' };
    assert.strictEqual(migrateBrandPreferences(custom), custom);
  }
});

test('legacy workspace and bundle imports keep learning data and file format intact', () => {
  const state = demoWorkspace();
  state.preferences.brandName = '课伴·研学版';
  const original = structuredClone(state);
  const validated = validateWorkspace(state);
  assert.deepEqual(validated, {
    ...original,
    preferences: { ...original.preferences, brandName: BRAND_NAME },
  });
  assert.deepEqual(state, original);
  const bundle = {
    format: 'course-kb-bundle',
    version: 2,
    exportedAt: '2026-10-21T00:00:00Z',
    state,
    files: [],
  };
  const restored = parseBackup(bundle);
  assert.equal(restored.state.preferences.brandName, BRAND_NAME);
  assert.deepEqual(restored.state.courses, original.courses);
  assert.deepEqual(restored.state.notes, original.notes);
  assert.equal(bundle.state.preferences.brandName, '课伴·研学版');
  assert.equal(bundle.format, 'course-kb-bundle');
});

test('workspace validation preserves a user-defined space name', () => {
  const state = demoWorkspace();
  state.preferences.brandName = '高数复习小组';
  assert.deepEqual(validateWorkspace(state), state);
});
