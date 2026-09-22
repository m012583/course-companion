/* oxlint-disable typescript/no-require-imports -- Standalone CommonJS test with an external Playwright installation. */
// Run with PLAYWRIGHT_MODULE pointing to playwright-core; all API writes are mocked.
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core',
);
const assert = require('node:assert/strict');
const path = require('node:path');
const now = new Date().toISOString();
const course = (id, name) => ({
  id,
  name,
  code: '',
  materials: [],
  sessions: [],
  chapters: [],
  graphFocus: '',
});
let state = {
  courses: [course('c1', '测试数学'), course('c2', '测试物理')],
  notes: [
    {
      id: 'n1',
      title: '测试笔记甲',
      text: '矩阵正文关键词',
      courseId: 'c1',
      course: '测试数学',
      chapter: '第一章',
      createdAt: now,
      relatedIds: ['n2'],
      sessionId: 's1',
    },
    {
      id: 'n2',
      title: '测试笔记乙',
      text: '物理正文',
      courseId: 'c2',
      course: '测试物理',
      createdAt: now,
      relatedIds: ['n1'],
      relatedLabels: { n1: '关联' },
    },
  ],
  tasks: [
    {
      id: 't1',
      title: '测试任务',
      kind: 'learn',
      courseId: 'c1',
      content: '任务正文',
      status: 'todo',
      createdAt: now,
    },
  ],
  activeView: 'home',
  courseId: 'c1',
};
state.courses[0].chapters = ['第一章'];
state.courses[0].materials = [
  {
    name: '测试资料.txt',
    fileId: 'f1',
    type: 'TXT',
    size: '1 KB',
    content: '独特正文检索词',
    chapter: '第一章',
    status: '已解析',
  },
];
state.courses[0].sessions = [
  {
    id: 's1',
    title: '测试对话',
    messages: [
      { role: 'user', text: '对话检索词' },
      { role: 'assistant', text: '测试回答' },
    ],
    updatedAt: now,
  },
];
let revision = 1;
(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.EDGE_PATH ||
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      assert.equal(body.revision, revision);
      state = body.state;
      revision++;
      await route.fulfill({ json: { revision } });
    } else await route.fulfill({ json: { state, revision } });
  });
  await context.route('**/api/files**', (route) =>
    route.fulfill({ json: { id: 'test-upload' } }),
  );
  await context.route('**/api/chat', (route) =>
    route.fulfill({ json: { answer: '自动测试回答', evidence: [] } }),
  );
  const settle = () => page.waitForTimeout(850);
  async function go(hash) {
    await settle();
    await page.goto(`http://localhost:3000/#${hash}`);
    await page.getByRole('button', { name: '个人设置', exact: true }).waitFor();
    await settle();
  }
  async function rename(name) {
    await page
      .getByRole('dialog')
      .getByLabel('名称', { exact: true })
      .fill(name);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '保存修改', exact: true })
      .click();
    await settle();
  }
  async function confirm() {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '确认删除', exact: true })
      .click();
    await settle();
  }
  try {
    await go('view=home');
    await page.getByLabel('搜索课程', { exact: true }).fill('测试数学');
    assert.equal(await page.locator('.course-card').count(), 1);
    await page
      .getByRole('button', { name: '删除课程 测试数学', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    assert.equal(state.courses.length, 2);
    console.log('PASS course search and cancel deletion');

    await go('view=course&course=c1');
    await page
      .locator('.chapter-row')
      .getByRole('button', { name: '改名', exact: true })
      .click();
    await rename('更新章节');
    assert.equal(state.notes[0].chapter, '更新章节');
    assert.equal(state.courses[0].materials[0].chapter, '更新章节');
    await page.getByLabel('搜索章节', { exact: true }).fill('不存在');
    assert.equal(await page.locator('.chapter-row').count(), 0);
    await page.getByLabel('搜索章节', { exact: true }).fill('');
    await page.getByRole('button', { name: '删除章节', exact: true }).click();
    await confirm();
    assert.equal(state.notes[0].chapter, '');
    assert.equal(state.courses[0].materials[0].chapter, '');
    await page.getByLabel('新章节名称', { exact: true }).fill('新增章节');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await settle();
    assert(state.courses[0].chapters.includes('新增章节'));
    console.log(
      'PASS chapter create/search/rename/delete with cascading classification',
    );

    await go('view=materials&course=c1');
    await page.getByLabel('搜索资料', { exact: true }).fill('独特正文检索词');
    assert.equal(await page.locator('.material-row').count(), 1);
    await page.getByRole('button', { name: '重命名', exact: true }).click();
    await rename('更名资料.txt');
    assert.equal(state.courses[0].materials[0].name, '更名资料.txt');
    await page.getByLabel('搜索资料', { exact: true }).fill('');
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: '新增资料.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('新增测试文本'),
      });
    await page
      .locator('.material-row')
      .filter({ hasText: '新增资料.txt' })
      .waitFor();
    await settle();
    assert.equal(state.courses[0].materials.length, 2);
    await page
      .getByRole('button', { name: '移除 新增资料.txt', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '移除资料', exact: true })
      .click();
    await settle();
    assert.equal(state.courses[0].materials.length, 1);
    console.log('PASS material upload/search/rename/remove');

    await go('view=study&course=c1&session=s1');
    await page.getByLabel('搜索对话', { exact: true }).fill('对话检索词');
    assert.equal(await page.locator('.session-row').count(), 1);
    await page
      .locator('.conversation-heading')
      .getByRole('button', { name: '改名', exact: true })
      .click();
    await rename('更新对话');
    await page
      .getByRole('button', { name: '编辑消息', exact: true })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('消息内容', { exact: true })
      .fill('改写问题');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '保存修改', exact: true })
      .click();
    await settle();
    assert.equal(state.courses[0].sessions[0].messages[0].text, '改写问题');
    await page
      .getByRole('button', { name: '删除消息', exact: true })
      .last()
      .click();
    await confirm();
    assert.equal(state.courses[0].sessions[0].messages.length, 1);
    await page.getByRole('button', { name: '删除对话', exact: true }).click();
    await confirm();
    assert.equal(state.courses[0].sessions.length, 0);
    assert.equal(state.notes[0].sessionId, undefined);
    await page.getByRole('button', { name: '新建对话', exact: true }).click();
    await settle();
    assert.equal(state.courses[0].sessions.length, 1);
    console.log(
      'PASS session create/search/rename/delete and message edit/delete',
    );

    await go('view=review');
    await page.getByLabel('搜索任务', { exact: true }).fill('任务正文');
    assert.equal(await page.locator('.task-item').count(), 1);
    await page
      .getByRole('button', { name: '查看任务详情 测试任务', exact: true })
      .click();
    await page
      .getByRole('button', { name: '编辑任务信息', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('名称', { exact: true }).fill('更新任务');
    await dialog.getByLabel('类型', { exact: true }).selectOption('review');
    await dialog.getByLabel('关联课程', { exact: true }).selectOption('c2');
    await dialog.getByLabel('计划日期', { exact: true }).fill('2026-10-01');
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
    await settle();
    assert.equal(state.tasks[0].courseId, 'c2');
    assert.equal(state.tasks[0].kind, 'review');
    assert.equal(state.tasks[0].date, '2026-10-01');
    await page
      .getByRole('button', { name: '删除任务 更新任务', exact: true })
      .click();
    await confirm();
    assert.equal(state.tasks.length, 0);
    console.log('PASS task full edit/search/delete');

    await page.locator('.add-task summary').click();
    await page
      .locator('.task-form')
      .getByLabel('任务名称', { exact: true })
      .fill('新增学习任务');
    await page.getByRole('button', { name: '添加到计划', exact: true }).click();
    await settle();
    assert.equal(state.tasks.length, 1);
    await page.getByLabel('搜索任务', { exact: true }).fill('新增学习任务');
    await page.getByLabel('标记完成 新增学习任务', { exact: true }).check();
    await settle();
    assert.equal(state.tasks[0].status, 'done');
    console.log('PASS task create and complete');

    await go('view=knowledge');
    await page.getByRole('button', { name: '新建笔记', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('概念标题', { exact: true })
      .fill('新增知识笔记');
    await page
      .getByRole('dialog')
      .getByLabel('笔记正文', { exact: true })
      .fill('新增正文');
    await page.getByRole('button', { name: '保存笔记', exact: true }).click();
    await settle();
    const newNote = state.notes.find((n) => n.title === '新增知识笔记');
    assert(newNote);
    await go('view=knowledge');
    await page.getByLabel('搜索全部笔记', { exact: true }).fill('新增正文');
    assert.equal(await page.locator('.note-row').count(), 1);
    await page.locator('.note-row').click();
    await page.getByRole('button', { name: '编辑笔记', exact: true }).click();
    await page.getByLabel('概念标题', { exact: true }).fill('修改知识笔记');
    await page.getByRole('button', { name: '完成编辑', exact: true }).click();
    await settle();
    assert.equal(
      state.notes.find((n) => n.id === newNote.id).title,
      '修改知识笔记',
    );
    await page.getByRole('tab', { name: '篇内概念图', exact: true }).click();
    await page
      .getByRole('button', { name: '手动绘制 · 不用 AI', exact: true })
      .click();
    await page.getByRole('button', { name: '概念', exact: true }).click();
    await settle();
    assert.equal(
      state.notes.find((n) => n.id === newNote.id).conceptGraph.nodes.length,
      2,
    );
    await page
      .locator('.note-visuals')
      .getByLabel('名称', { exact: true })
      .fill('新增概念');
    await page
      .locator('.note-visuals')
      .getByRole('button', { name: '保存修改', exact: true })
      .click();
    await page
      .getByLabel('搜索概念或关联笔记', { exact: true })
      .fill('新增概念');
    await page.getByRole('button', { name: '新增概念', exact: true }).first().click();
    await page.getByRole('button', { name: '编辑概念', exact: true }).click();
    await page.getByRole('button', { name: '删除概念', exact: true }).click();
    await settle();
    assert.equal(
      state.notes.find((n) => n.id === newNote.id).conceptGraph.nodes.length,
      1,
    );
    await page.getByRole('button', { name: '删除笔记', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '确认删除笔记', exact: true })
      .click();
    await settle();
    console.log(
      'PASS note create/edit/search and concept create/edit/search/delete',
    );

    await go('view=graph');
    await page.getByLabel('搜索图谱笔记', { exact: true }).fill('测试笔记甲');
    await page.locator('.network-search-results button').click();
    await page
      .getByRole('button', { name: '移除与 测试笔记乙 的关联', exact: true })
      .click();
    await settle();
    assert.deepEqual(state.notes.find((n) => n.id === 'n1').relatedIds, []);
    assert.deepEqual(state.notes.find((n) => n.id === 'n2').relatedIds, []);
    await page
      .locator('.network-link-editor select')
      .first()
      .selectOption('n2');
    await page
      .locator('.network-link-editor select')
      .last()
      .selectOption({ label: '先修知识' });
    await page.getByRole('button', { name: '保存关联', exact: true }).click();
    await settle();
    assert.equal(
      state.notes.find((n) => n.id === 'n1').relatedLabels.n2,
      '先修知识',
    );
    console.log(
      'PASS graph search, remove both directions and create association',
    );

    await go('view=knowledge&note=n1');
    await page.getByRole('button', { name: '删除笔记', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '确认删除笔记', exact: true })
      .click();
    await settle();
    assert.equal(state.notes.length, 1);
    assert.deepEqual(state.notes[0].relatedIds, []);
    assert.deepEqual(state.notes[0].relatedLabels, {});
    await page.reload();
    await page.getByRole('button', { name: '个人设置', exact: true }).waitFor();
    assert.equal(await page.locator('.note-row').count(), 1);
    console.log(
      'PASS note deletion, related-link cleanup and reload persistence',
    );

    await go('view=home');
    for (const name of ['测试数学', '测试物理']) {
      await page
        .getByRole('button', { name: `删除课程 ${name}`, exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '确认删除课程', exact: true })
        .click();
      await settle();
    }
    assert.equal(state.courses.length, 0);
    assert.equal(state.notes.length, 0);
    await page.reload();
    await page
      .getByRole('button', { name: '添加第一门课程', exact: true })
      .waitFor();
    await settle();
    assert.equal(state.courses.length, 0);
    await page
      .getByRole('button', { name: '添加第一门课程', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('课程名称', { exact: true })
      .fill('重新开始');
    await page
      .getByRole('button', { name: '创建并上传资料', exact: true })
      .click();
    await settle();
    assert.equal(state.courses.length, 1);
    assert.equal(state.courses[0].name, '重新开始');
    console.log(
      'PASS delete last course, reload empty workspace and add again',
    );
    await page.setViewportSize({ width: 430, height: 900 });
    await go('view=home');
    await page.screenshot({
      path: path.join(
        __dirname,
        '..',
        '..',
        'gui-test-screenshots',
        'crud-mobile.png',
      ),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log('PASS no browser runtime errors');
  } catch (error) {
    await page.screenshot({
      path: path.join(
        __dirname,
        '..',
        '..',
        'gui-test-screenshots',
        'crud-failure.png',
      ),
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
