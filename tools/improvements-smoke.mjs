import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core',
);
const base = process.env.COURSE_KB_STORAGE_URL;
if (
  !base ||
  new URL(base).hostname !== 'localhost' ||
  process.env.COURSE_KB_ALLOW_TEST_WRITES !== 'isolated-test-workspace'
)
  throw new Error('仅允许显式指定的隔离本机测试空间');
const getState = async () => (await fetch(base + '/api/workspace')).json();
const current = await getState();
if (!current.state?.courses.every((c) => c.id.startsWith('storage-test-')))
  throw new Error('包含非测试数据，拒绝覆盖');
const file = current.state.courses[0].materials[0];
const state = {
  ...current.state,
  trash: [],
  reading: undefined,
  courses: [
    {
      ...current.state.courses[0],
      name: '备份验收课程',
      materials: [
        {
          ...file,
          passages: [
            { text: '矩阵的秩是线性无关列的最大数量。', section: '第一段' },
            { text: '可逆方阵的秩等于阶数。', section: '第二段' },
          ],
        },
      ],
    },
  ],
  notes: [
    {
      id: 'storage-test-note',
      title: '回收站测试笔记',
      text: '矩阵与秩',
      courseId: 'storage-test-course',
      course: '备份验收课程',
      createdAt: new Date().toISOString(),
      reviewAt: '2020-01-01',
    },
  ],
};
const seed = await fetch(base + '/api/workspace', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ state, revision: current.revision }),
});
assert.equal(seed.status, 200);
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.EDGE_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const settled = async () => {
  await page.waitForTimeout(1000);
};
const go = async (hash) => {
  await page.goto(base + '/#' + hash);
  await page.getByRole('button', { name: '个人设置', exact: true }).waitFor();
};
try {
  await go('view=materials&course=storage-test-course&file=' + file.fileId);
  await page.getByRole('button', { name: '下一段', exact: true }).click();
  await settled();
  assert.equal((await getState()).state.reading.passage, 1);
  await page.reload();
  await page.getByLabel('阅读位置', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('阅读位置', { exact: true }).inputValue(),
    '1',
  );
  await page
    .getByRole('button', { name: '本段保存为笔记', exact: true })
    .click();
  await page.getByRole('button', { name: '保存笔记', exact: true }).click();
  await settled();
  let saved = (await getState()).state;
  const note = saved.notes.find((n) => n.title.includes('第二段'));
  assert.equal(note.sources[0].fileId, file.fileId);
  await page.getByText('复习与掌握情况', { exact: true }).click();
  await page.getByRole('button', { name: '复习这条', exact: true }).click();
  await page.getByLabel('你的回答', { exact: true }).fill('可逆方阵满秩');
  await page.getByRole('button', { name: '查看笔记解析', exact: true }).click();
  await page
    .getByRole('button', { name: '有点吃力 · 明天巩固', exact: true })
    .click();
  await settled();
  saved = (await getState()).state;
  assert.equal(
    saved.notes.find((n) => n.id === note.id).reviewHistory[0].rating,
    'hard',
  );
  await go('view=home');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  assert.equal(
    await page.getByLabel('阅读位置', { exact: true }).inputValue(),
    '1',
  );
  await page
    .getByRole('button', { name: '用当前段落提问', exact: true })
    .click();
  assert.ok(
    await page
      .locator('textarea')
      .filter({ visible: true })
      .first()
      .inputValue()
      .then((s) => s.includes('可逆方阵')),
  );
  await go('view=knowledge&note=storage-test-note');
  await page.getByRole('button', { name: '删除笔记', exact: true }).click();
  await page.getByRole('button', { name: '确认删除笔记', exact: true }).click();
  await settled();
  await page.getByRole('button', { name: '个人设置', exact: true }).click();
  await page
    .locator('.trash-row')
    .filter({ hasText: '回收站测试笔记' })
    .getByRole('button', { name: '恢复', exact: true })
    .click();
  await settled();
  assert.ok(
    (await getState()).state.notes.some((n) => n.id === 'storage-test-note'),
  );
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await go('view=home');
  const deleteButton = page.getByRole('button', {
    name: '删除课程 备份验收课程',
    exact: true,
  });
  const rect = await deleteButton.boundingBox();
  assert.ok(rect && rect.x < 650, 'delete button remains left-aligned');
  await deleteButton.click();
  await page.getByRole('button', { name: '确认删除课程', exact: true }).click();
  await settled();
  assert.equal((await getState()).state.courses.length, 0);
  await page.getByRole('button', { name: '个人设置', exact: true }).click();
  await page
    .locator('.trash-row')
    .getByRole('button', { name: '恢复', exact: true })
    .click();
  await settled();
  assert.equal((await getState()).state.notes.length, 2);
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: '下载完整备份（含附件）', exact: true })
    .click();
  const download = await downloadPromise;
  const backupPath = resolve('test-results/ui-full-backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.files.length, 1);
  const broken = structuredClone(backup);
  broken.files[0].sha256 = '0'.repeat(64);
  await page
    .getByLabel('选择完整备份文件', { exact: true })
    .setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(broken)),
    });
  await page.getByRole('alert').filter({ hasText: '附件校验失败' }).waitFor();
  backup.state.courses[0].name = '已恢复课程';
  await page
    .getByLabel('选择完整备份文件', { exact: true })
    .setInputFiles({
      name: 'restore.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page
    .getByRole('button', { name: '确认替换并恢复', exact: true })
    .click();
  await page
    .getByRole('button', { name: '删除课程 已恢复课程', exact: true })
    .waitFor();
  await settled();
  const after = await getState();
  assert.equal(after.state.courses[0].name, '已恢复课程');
  assert.notEqual(after.state.courses[0].materials[0].fileId, file.fileId);
  await page.screenshot({
    path: 'test-results/improvements-home.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '个人设置', exact: true }).click();
  await page.setViewportSize({ width: 430, height: 900 });
  await page.screenshot({
    path: 'test-results/improvements-settings-mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  // An external writer advances the revision before export. UI must not overwrite it.
  const conflict = await fetch(base + '/api/workspace', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: {
        ...after.state,
        preferences: {
          brandName: '外部更新',
          userName: '测试',
          semester: '测试',
        },
      },
      revision: after.revision,
    }),
  });
  assert.equal(conflict.status, 200);
  await page
    .getByRole('button', { name: '下载完整备份（含附件）', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: '另一个窗口' }).waitFor();
  assert.equal((await getState()).state.preferences.brandName, '外部更新');
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/improvements-report.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks: [
          'reading reload/resume',
          'passage to cited note',
          'self review history',
          'passage to question',
          'note recycle restore',
          'course bundle restore',
          'left delete placement',
          'full backup download',
          'corrupt file preview rejection',
          'confirmed restore remaps files',
          'mobile no horizontal overflow',
          'external writer conflict protected',
          'no browser errors',
        ],
      },
      null,
      2,
    ),
  );
  console.log('PASS improvements browser flow: 13 checks with real storage');
} catch (error) {
  await page.screenshot({
    path: 'test-results/improvements-failure.png',
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
