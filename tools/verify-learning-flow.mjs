import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { moduleUrl } from '../tests/load-ts.mjs';

const base = process.env.COURSE_KB_TEST_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error('Set COURSE_KB_TEST_URL to a disposable local instance.');
const health = await (await fetch(`${base}/api/health`)).json();
assert.equal(
  health.instance,
  createHash('sha256')
    .update(resolve('.').toLowerCase())
    .digest('hex')
    .slice(0, 16),
  'Instance must match the current checkout',
);
const { demoWorkspace } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const getState = async () => (await fetch(`${base}/api/workspace`)).json();
async function saveState(state, revision) {
  const response = await fetch(`${base}/api/workspace`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ state, revision }),
  });
  assert.ok(response.ok, `Workspace save: ${response.status}`);
}
const before = await getState();
const course = demoWorkspace().courses[0];
course.id = `demo-flow-${randomUUID()}`;
course.name = '流程验收专用课';
course.studyLab = undefined;
course.sessions = [];
const initial = before.state ?? demoWorkspace();
await saveState(
  { ...initial, courses: [...initial.courses, course] },
  before.revision,
);
await mkdir('work/ui04', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EDGE_PATH ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const checkpoints = [];
async function saved() {
  await page.waitForTimeout(1300);
  await page.getByText('所有更改已保存', { exact: true }).waitFor();
}
try {
  await page.goto(`${base}/#view=lab&course=${course.id}`);
  await page
    .getByRole('button', { name: '体验原创示例题', exact: true })
    .click();
  await page
    .getByRole('button', { name: '核对题目', exact: true })
    .first()
    .click();
  await page.getByLabel('已核对题目、答案和来源，可用于练习').check();
  await page
    .getByRole('button', { name: '保存并开始练习', exact: true })
    .click();
  await page.getByRole('radio').last().check();
  await page.getByRole('button', { name: '提交本次作答', exact: true }).click();
  await page.getByLabel('记录错因').selectOption('概念不清');
  await page.getByRole('button', { name: '预览复习安排', exact: true }).click();
  await page.getByRole('button', { name: '确认加入复习', exact: true }).click();
  await saved();
  let state = await getState();
  const practice = state.state.courses.find((c) => c.id === course.id).studyLab
    .practice;
  assert.equal(practice.questions.length, 2);
  assert.equal(practice.attempts.length, 1);
  assert.equal(practice.attempts[0].reason, '概念不清');
  assert.equal(
    state.state.reviewPlans.filter((p) => p.courseId === course.id).length,
    1,
  );
  checkpoints.push(
    'draft confirmation, answer snapshot, wrong reason, review saved',
  );
  await page.getByRole('button', { name: '复习计划', exact: true }).click();
  await page
    .getByRole('button', { name: '打开关联练习', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: '提交本次作答', exact: true })
    .waitFor();
  checkpoints.push('review task opens exact question');
  await page.getByRole('button', { name: '教材阅读', exact: true }).click();
  await page.getByRole('button', { name: '下一段', exact: true }).click();
  await saved();
  await page.reload();
  await page.getByLabel('阅读位置', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('阅读位置', { exact: true }).inputValue(),
    '1',
  );
  checkpoints.push('reading position survives reload');
  await page.getByRole('button', { name: '本段记笔记', exact: true }).click();
  await page.getByRole('button', { name: '关闭草稿', exact: true }).click();
  await saved();
  state = await getState();
  assert.ok(state.state.noteDraft.note.sources.length);
  checkpoints.push('reading excerpt creates evidence-linked persistent draft');
  await page.getByRole('button', { name: '解释本段', exact: true }).click();
  assert.ok(await page.locator('.reading-chat textarea').inputValue());
  assert.match(await page.locator('.reading-chat').innerText(), /1 份可读取资料/);
  await page.screenshot({
    path: 'work/ui04/reader-desktop.png',
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '教材', exact: true }).click();
    assert.equal(
      await page.getByLabel('阅读位置', { exact: true }).inputValue(),
      '1',
    );
    await page.screenshot({
      path: `work/ui04/reader-${width}.png`,
      fullPage: true,
    });
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert.ok(size.scroll <= size.width + 1, `Overflow at ${width}`);
  }
  checkpoints.push(
    'desktop split view and 768/390 mobile switching without overflow',
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '练习与错题', exact: true }).click();
  await page.getByRole('button', { name: '题库', exact: true }).click();
  await page
    .getByRole('button', { name: '开始练习', exact: true })
    .first()
    .click();
  await page.getByRole('radio').nth(1).check();
  await page.getByRole('button', { name: '提交本次作答', exact: true }).click();
  await page.getByText('本次答对', { exact: false }).first().waitFor();
  await saved();
  state = await getState();
  assert.equal(
    state.state.courses.find((c) => c.id === course.id).studyLab.practice
      .attempts.length,
    2,
  );
  checkpoints.push('repeat practice preserves both attempts');
  await page.getByRole('button', { name: '返回题目列表', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).first().click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('.practice-filter-details summary').click();
  await page.getByLabel('范围', { exact: true }).selectOption('trash');
  await page.getByRole('button', { name: '恢复题目', exact: true }).click();
  await page.getByLabel('范围', { exact: true }).selectOption('all');
  await saved();
  checkpoints.push('question deletion and restore preserve history');
  await page.locator('.course-more summary').click();
  await page.getByRole('button', { name: '删除课程', exact: true }).click();
  await page.getByRole('button', { name: '取消删除课程', exact: true }).click();
  checkpoints.push(
    'course deletion remains discoverable and requires confirmation',
  );
  await page.screenshot({
    path: 'work/ui04/practice-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'work/ui04/practice-390.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    'docs/evaluation/learning-ui-v1.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        browser: 'Headless Edge',
        checkpoints,
        pageErrors: errors,
        limits: '模拟视口和自动操作；不是实体手机、第二台电脑或真实同学试用。',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ passed: checkpoints.length, checkpoints }));
} catch (error) {
  await page.screenshot({ path: 'work/ui04/failure.png', fullPage: true });
  await writeFile(
    'work/ui04/failure.txt',
    await page.locator('body').innerText(),
  );
  throw error;
} finally {
  await browser.close();
  // Only remove this script's own course, plans and draft; never restore over unrelated edits.
  const current = await getState();
  const state = current.state;
  state.courses = state.courses.filter((c) => c.id !== course.id);
  state.reviewPlans = (state.reviewPlans ?? []).filter(
    (p) => p.courseId !== course.id,
  );
  if (state.noteDraft?.note?.courseId === course.id)
    state.noteDraft = initial.noteDraft;
  if (state.courseId === course.id) {
    state.courseId = initial.courseId;
    state.activeView = 'home';
    state.sessionId = '';
  }
  await saveState(state, current.revision);
}
