/* oxlint-disable typescript/no-require-imports -- Standalone browser regression. */
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core',
);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const now = new Date().toISOString();
let state = {
  courses: [
    {
      id: 'c1',
      name: '体验课程',
      code: '',
      graphFocus: '',
      chapters: [],
      materials: [
        {
          fileId: 'f1',
          name: '体验讲义.txt',
          type: 'TXT',
          size: '1 KB',
          status: '可检索',
          passages: [
            { section: '第一章', text: '矩阵秩是线性无关列的最大数量。' },
          ],
        },
      ],
      sessions: [],
    },
  ],
  notes: [
    {
      id: 'n1',
      title: '待复习概念',
      text: '矩阵秩的定义',
      courseId: 'c1',
      course: '体验课程',
      createdAt: now,
      reviewAt: '2020-01-01',
    },
  ],
  tasks: [
    {
      id: 't1',
      title: '任务定位词',
      content: '做习题',
      courseId: 'c1',
      kind: 'learn',
      status: 'todo',
      createdAt: now,
    },
  ],
  courseId: 'c1',
  activeView: 'home',
  trash: [],
};
let revision = 1,
  chatMode = 'success',
  calls = 0;
(async () => {
  const browser = await chromium.launch({
    executablePath:
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (r) => {
      const u = new URL(r.request().url()),
        method = r.request().method();
      if (u.pathname === '/api/workspace') {
        if (method === 'PUT') {
          const d = r.request().postDataJSON();
          state = d.state;
          revision++;
        }
        return r.fulfill({ json: { state, revision } });
      }
      if (u.pathname === '/api/chat') {
        calls++;
        if (chatMode === 'slow')
          await new Promise((resolve) => setTimeout(resolve, 2200));
        if (chatMode === 'failure')
          return r.fulfill({ status: 502, json: { error: '模拟网络失败' } });
        return r
          .fulfill({
            contentType: 'application/x-ndjson',
            body:
              JSON.stringify({
                type: 'partial',
                answer: '分段回答',
                evidence: [],
              }) +
              '\n' +
              JSON.stringify({
                type: 'done',
                answer: '完整回答',
                evidence: [],
                scope: { selected: 1, matchedFiles: 0, passages: 0 },
              }) +
              '\n',
          })
          .catch(() => {});
      }
      if (u.pathname === '/api/ai-settings')
        return r.fulfill({
          json:
            method === 'GET'
              ? {
                  configured: false,
                  baseUrl: 'https://api.deepseek.com',
                  model: 'deepseek-flash',
                }
              : { ok: true, message: '设置已保存' },
        });
      return r.fulfill({ json: { history: [] } });
    });
    const base = process.env.COURSE_KB_TEST_URL || 'http://localhost:3015';
    await page.goto(base + '/#view=knowledge', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page.getByLabel('概念标题', { exact: true }).fill('刷新后继续的草稿');
    await page.getByLabel('笔记正文', { exact: true }).fill('不可丢失的正文');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '保留草稿', exact: true }).click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('未完成草稿（1）', { exact: true }).click();
    await page
      .getByRole('button', { name: /刷新后继续的草稿.*继续编辑/ })
      .click();
    assert.equal(
      await page.getByLabel('笔记正文', { exact: true }).inputValue(),
      '不可丢失的正文',
    );
    await page.getByLabel('加入复习', { exact: true }).uncheck();
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await page.waitForTimeout(700);
    assert.ok(
      state.notes.some((n) => n.title === '刷新后继续的草稿' && !n.reviewAt),
    );
    assert.equal(
      JSON.parse(
        await page.evaluate(() =>
          localStorage.getItem('course-companion-note-drafts-v1'),
        ),
      ).length,
      0,
    );
    console.log(
      'PASS draft persistence, resume, save cleanup and optional review',
    );
    await page.keyboard.press('Control+k');
    await page
      .getByRole('textbox', { name: '搜索全部内容', exact: true })
      .fill('线性无关');
    await page
      .getByRole('button', { name: /资料.*体验课程.*体验讲义/ })
      .click();
    await page.getByRole('button', { name: '并排记笔记', exact: true }).click();
    await page
      .getByRole('button', { name: '新建阅读笔记', exact: true })
      .click();
    await page.getByLabel('笔记标题', { exact: true }).fill('并排笔记');
    await page.getByLabel('笔记正文', { exact: true }).fill('阅读时记录');
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    assert.ok(
      await page
        .getByRole('heading', { name: '阅读笔记', exact: true })
        .isVisible(),
    );
    console.log('PASS cross-content search and reading alongside notes');
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('button', { name: /^复习/ })
      .click();
    await page.getByRole('button', { name: '开始复习', exact: true }).click();
    await page.getByRole('button', { name: '想不起来', exact: true }).click();
    await page.getByRole('button', { name: /答对了 · \d{4}-/ }).click();
    await page
      .getByRole('button', { name: '撤销上次评分', exact: true })
      .click();
    await page.waitForTimeout(700);
    assert.equal(state.notes.find((n) => n.id === 'n1').reviewAt, '2020-01-01');
    console.log('PASS explicit next review date and undo rating');
    await page.getByRole('button', { name: '今日学习', exact: true }).click();
    await page
      .getByRole('button', { name: '删除课程 体验课程', exact: true })
      .click();
    await page
      .getByRole('button', { name: '确认删除课程', exact: true })
      .click();
    await page.getByRole('button', { name: '撤销删除', exact: true }).click();
    await page.waitForTimeout(700);
    assert.equal(state.courses.length, 1);
    assert.ok(state.notes.length >= 3);
    assert.equal(state.tasks.length, 1);
    console.log('PASS course deletion undo restores notes and tasks');
    await page.getByRole('button', { name: '体验课程', exact: true }).click();
    await page.getByRole('textbox', { name: '学习问题' }).fill('测试回答');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByText('完整回答', { exact: true }).waitFor();
    chatMode = 'slow';
    await page.getByRole('textbox', { name: '学习问题' }).fill('停止这次回答');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await page.getByRole('button', { name: '重新发送', exact: true }).waitFor();
    await page.waitForTimeout(2400);
    assert.equal(await page.getByText('完整回答', { exact: true }).count(), 1);
    chatMode = 'failure';
    await page.getByRole('button', { name: '重新发送', exact: true }).click();
    await page.getByText(/模拟网络失败/).waitFor();
    assert.equal(
      await page.getByRole('textbox', { name: '学习问题' }).inputValue(),
      '停止这次回答',
    );
    chatMode = 'success';
    await page.getByRole('button', { name: '重新发送', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(calls, 4);
    assert.equal(await page.getByText('完整回答', { exact: true }).count(), 2);
    console.log(
      'PASS streamed reply, cancel without late append, failure retry and retained question',
    );
    await page.getByRole('button', { name: '设置与备份', exact: true }).click();
    await page.getByRole('button', { name: 'AI 服务', exact: true }).click();
    await page.getByLabel('API 密钥', { exact: true }).fill('fake-key');
    await page
      .getByRole('button', { name: '保存 AI 设置', exact: true })
      .click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.getByLabel('API 密钥', { exact: true }).inputValue(),
      '',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '今日学习', exact: true }).click();
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({
      path: 'test-results/comfort-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'test-results/comfort-mobile.png',
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS settings tabs, cleared secret input, mobile width and no runtime errors',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
