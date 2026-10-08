import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { moduleUrl } from '../tests/load-ts.mjs';
const base = process.env.COURSE_KB_TEST_URL;
assert.match(base ?? '', /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const health = await (await fetch(base + '/api/health')).json();
assert.equal(
  health.instance,
  createHash('sha256')
    .update(resolve('.').toLowerCase())
    .digest('hex')
    .slice(0, 16),
);
const initialAi = await (await fetch(base + '/api/ai-settings')).json();
assert.equal(
  initialAi.configured,
  false,
  'Use an unconfigured disposable test instance',
);
const { demoWorkspace, demoCheck } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const { attachCheck } = await import(
  await moduleUrl('../lib/learning-flow.ts')
);
const { answerQuestion, planFromAttempt } = await import(
  await moduleUrl('../lib/practice.ts')
);
const fixture = demoWorkspace(),
  course = fixture.courses[0];
course.id = `demo-experience-${randomUUID()}`;
course.name = '新版体验验收专用课程';
course.sessions = [];
course.studyLab = attachCheck(
  undefined,
  demoCheck(),
  course.guide.chapters,
  '',
);
const question = course.studyLab.practice.questions[0];
question.status = 'ready';
question.prompt = '验收用矩阵乘法题';
const plan = planFromAttempt(
  answerQuestion(question, question.correct),
  course,
);
const duplicate = { ...structuredClone(plan), id: randomUUID() };
const note = {
  ...fixture.notes[0],
  id: randomUUID(),
  course: course.name,
  courseId: course.id,
  title: '验收笔记',
  text: '原始笔记：矩阵乘法需要注意顺序。',
  sources: question.evidence,
};
course.sessions = [
  {
    id: randomUUID(),
    title: '验收历史问答',
    updatedAt: new Date().toISOString(),
    messages: [
      {
        role: 'assistant',
        text: '历史回答唯一词：矩阵可逆的条件需要核对。',
        evidence: question.evidence,
      },
    ],
  },
];
const get = async () => (await fetch(base + '/api/workspace')).json();
async function put(state, revision) {
  const r = await fetch(base + '/api/workspace', {
    method: 'PUT',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, revision }),
  });
  assert.ok(r.ok, await r.text());
}
const before = await get();
const initial = before.state ?? demoWorkspace();
await put(
  {
    ...initial,
    courses: [...initial.courses, course],
    notes: [...initial.notes, note],
    reviewPlans: [...(initial.reviewPlans ?? []), plan, duplicate],
  },
  before.revision,
);
await mkdir('work/ui05', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().includes('same key'))
    errors.push(m.text());
});
const mockRequests = [];
const provider = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const payload = JSON.parse(raw);
  mockRequests.push(payload);
  let content = '连接成功';
  if (payload.messages[0].content.includes('教材复述核对')) {
    const data = JSON.parse(payload.messages[1].content);
    content = JSON.stringify({
      covered: ['说明了顺序'],
      missing: ['补充适用条件'],
      issues: [],
      sourceIds: [data.evidence[0].id],
    });
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content } }],
    }),
  );
});
await new Promise((r) => provider.listen(0, '127.0.0.1', r));
const mockPort = provider.address().port;
const configAction = async (action) =>
  fetch(base + '/api/ai-settings', {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
async function saved() {
  await page.waitForTimeout(1400);
  await page.getByText('所有更改已保存', { exact: true }).waitFor();
}
async function go(view, more = {}) {
  await page.goto(
    base + '/#' + new URLSearchParams({ view, course: course.id, ...more }),
    { waitUntil: 'networkidle' },
  );
  await page.getByRole('button', { name: '个人设置', exact: true }).waitFor();
  await page.waitForTimeout(300);
}
async function search(term, kind) {
  await page.getByRole('button', { name: '全局搜索（Ctrl K）' }).click();
  await page
    .getByRole('combobox', { name: '课程范围', exact: true })
    .selectOption(course.id);
  await page
    .getByRole('combobox', { name: '内容类型', exact: true })
    .selectOption(kind);
  await page
    .getByRole('combobox', { name: '搜索学习内容', exact: true })
    .fill(term);
}
try {
  await go('home');
  assert.equal(await page.locator('.home-page .learning-next').count(), 0);
  assert.match(
    await page
      .locator('.course-card')
      .filter({ hasText: course.name })
      .innerText(),
    /1 份资料/,
  );
  await page.screenshot({ path: 'work/ui05/home.png', fullPage: true });
  checks.push('one home resume and consistent material count');
  await search('矩阵的秩', '教材');
  await page
    .getByRole('option')
    .filter({ hasText: '矩阵的秩' })
    .first()
    .click();
  await page.getByRole('combobox', { name: '阅读位置', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('combobox', { name: '阅读位置', exact: true })
      .inputValue(),
    '2',
  );
  await saved();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page
      .getByRole('combobox', { name: '阅读位置', exact: true })
      .inputValue(),
    '2',
  );
  checks.push('search passage location survives reload');
  await page.getByRole('button', { name: '打开问答', exact: true }).click();
  await page.locator('.reading-chat').waitFor();
  await saved();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.reading-chat').waitFor();
  checks.push('reader opens chat directly and remembers split');
  await page.getByRole('button', { name: '收起问答', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector('.sidebar').getBoundingClientRect().right <= 1,
  );
  await page.getByRole('button', { name: '专注阅读', exact: true }).click();
  assert.ok(await page.locator('.course-heading').isHidden());
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'work/ui05/reader-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '退出专注阅读', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await search('历史回答唯一词', '回答');
  await page.getByRole('option').filter({ hasText: '验收历史问答' }).click();
  await page.locator('.message.search-highlight').waitFor();
  assert.match(
    await page.locator('.message.search-highlight').innerText(),
    /历史回答唯一词/,
  );
  checks.push('history answer search highlights exact message');
  await go('knowledge', { note: note.id, course: initial.courses[0].id });
  await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
  await page
    .getByRole('textbox', { name: /^笔记正文/ })
    .fill('修改后笔记：新增核对条件。');
  await page.getByRole('button', { name: '完成编辑', exact: true }).click();
  await saved();
  await page.locator('.note-history>summary').click();
  await page
    .getByRole('combobox', { name: '选择历史版本', exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole('checkbox', { name: '已比较内容，确认恢复此版本' })
    .check();
  await page.getByRole('button', { name: '恢复此版本', exact: true }).click();
  await saved();
  let state = (await get()).state;
  const changed = state.notes.find((n) => n.id === note.id);
  assert.equal(changed.text, note.text);
  assert.equal(changed.versions[0].text, '修改后笔记：新增核对条件。');
  checks.push('note comparison and restoration keep both contents');
  await page
    .getByRole('button')
    .filter({ hasText: question.evidence[0].name })
    .first()
    .click();
  await page.locator('.citation-feedback>summary').click();
  await page
    .getByRole('combobox', { name: '你的判断', exact: true })
    .selectOption('partial');
  await page
    .getByRole('textbox', { name: '核对说明', exact: true })
    .fill('需要补充条件');
  await page.getByRole('button', { name: '保存核对记录', exact: true }).click();
  await saved();
  assert.equal(
    (await get()).state.courses.find((c) => c.id === course.id)
      .citationReviews[0].verdict,
    'partial',
  );
  await page.getByRole('button', { name: '关闭原文', exact: true }).click();
  checks.push('citation review stored with original evidence and claim');
  await go('review');
  assert.equal(
    await page
      .locator('.queue-row')
      .filter({ hasText: question.prompt })
      .count(),
    1,
  );
  await page
    .locator('.queue-row')
    .filter({ hasText: question.prompt })
    .getByRole('button', { name: '明天提醒' })
    .click();
  await saved();
  assert.equal(
    await page
      .locator('.queue-row')
      .filter({ hasText: question.prompt })
      .count(),
    0,
  );
  await page.getByRole('button', { name: '取消暂缓提醒' }).click();
  await saved();
  assert.equal(
    await page
      .locator('.queue-row')
      .filter({ hasText: question.prompt })
      .count(),
    1,
  );
  checks.push('same question deduplicated, snoozed and restored');
  await page
    .locator('.queue-row')
    .filter({ hasText: question.prompt })
    .getByRole('button', { name: '开始复习' })
    .click();
  await page.getByRole('radio').nth(question.correct).check();
  await page.getByRole('button', { name: '提交本次作答', exact: true }).click();
  await saved();
  state = (await get()).state;
  for (const id of [plan.id, duplicate.id]) {
    const p = state.reviewPlans.find((p) => p.id === id);
    assert.ok(p.tasks[0].done && !p.tasks[1].done);
  }
  checks.push(
    'practice completes merged due tasks without completing future tasks',
  );
  await go('lab');
  await page.getByRole('button', { name: '快速自测', exact: true }).click();
  if ((await page.locator('.flow-setup').getAttribute('open')) === null)
    await page.locator('.flow-setup>summary').click();
  assert.ok(
    await page
      .getByRole('button', { name: '连接 AI 后生成', exact: true })
      .isDisabled(),
  );
  await page.getByRole('button', { name: '复述练习', exact: true }).click();
  await page
    .getByRole('textbox', { name: '你的复述', exact: true })
    .fill('矩阵乘法与顺序有关。');
  await saved();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '复述练习', exact: true }).click();
  assert.equal(
    await page
      .getByRole('textbox', { name: '你的复述', exact: true })
      .inputValue(),
    '矩阵乘法与顺序有关。',
  );
  await page
    .getByRole('button', { name: '保存复述并查看原文', exact: true })
    .click();
  await saved();
  checks.push('retelling draft and evidence snapshot persist without AI');
  await page
    .getByRole('button', { name: '连接 AI 后核对', exact: true })
    .click();
  await page.locator('.ai-setup>summary').click();
  await page
    .getByRole('combobox', { name: 'AI 服务', exact: true })
    .selectOption('custom');
  await page
    .getByRole('textbox', { name: '服务地址', exact: true })
    .fill(`http://127.0.0.1:${mockPort}/v1`);
  await page
    .getByRole('textbox', { name: '模型名称', exact: true })
    .fill('fixture-model');
  await page
    .getByLabel('API 密钥', { exact: true })
    .fill('local-test-placeholder');
  await page.getByRole('button', { name: '保存 AI 配置', exact: true }).click();
  await page
    .getByText('配置已加密保存。请测试连接。', { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel('API 密钥', { exact: true }).inputValue(),
    '',
  );
  await page
    .getByRole('button', { name: '测试已保存的连接', exact: true })
    .click();
  await page
    .locator('.ai-setup output')
    .filter({ hasText: '连接成功' })
    .waitFor();
  assert.equal(mockRequests.length, 1);
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page
    .getByRole('button', { name: '请 AI 核对遗漏与错误', exact: true })
    .click();
  await page.getByText('补充适用条件', { exact: true }).waitFor();
  await page
    .getByRole('combobox', { name: '你的核对结论', exact: true })
    .selectOption('needs-work');
  await page
    .getByRole('textbox', { name: '修正与补充', exact: true })
    .fill('我需要再核对适用条件。');
  await saved();
  assert.equal(mockRequests.length, 2);
  const bundleText = await (await fetch(base + '/api/backup')).text();
  assert.ok(!bundleText.includes('local-test-placeholder'));
  assert.ok(!bundleText.includes('COURSE_KB_AI_SECRET'));
  checks.push(
    'encrypted local AI setup and mock feedback; credentials excluded from backup',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector('.sidebar').getBoundingClientRect().right <= 1,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'work/ui05/retelling-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await go('review');
  await page.screenshot({ path: 'work/ui05/review.png', fullPage: true });
  checks.push('desktop and mobile review/retelling layout fits viewport');
  assert.deepEqual(errors, []);
  const result = {
    checkedAt: new Date().toISOString(),
    checks,
    pageErrors: errors,
    ai: 'Local mock server only; no paid AI or real accuracy measurement',
    physicalDevices: false,
  };
  await writeFile(
    'docs/evaluation/experience-ui-v1.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page.screenshot({ path: 'work/ui05/failure.png', fullPage: true });
  console.log(JSON.stringify({ completed: checks, pageErrors: errors }));
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => provider.close(r));
  await configAction('clear');
  const current = await get();
  const state = current.state;
  await put(
    {
      ...state,
      courses: state.courses.filter((c) => c.id !== course.id),
      notes: state.notes.filter((n) => n.id !== note.id),
      reviewPlans: state.reviewPlans.filter((p) => p.courseId !== course.id),
      preferences: initial.preferences,
      courseId: initial.courseId,
      sessionId: initial.sessionId,
      activeView: initial.activeView,
      model: initial.model,
    },
    current.revision,
  );
}
