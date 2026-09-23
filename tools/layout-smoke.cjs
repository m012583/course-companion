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

state.courses[0].sessions = [
  {
    id: 's1',
    title: '矩阵秩与可逆性的关系',
    updatedAt: now,
    messages: [
      { role: 'user', text: '矩阵秩和可逆有什么关系？' },
      {
        role: 'assistant',
        text: '对方阵而言，满秩等价于可逆。先通过消元求出非零行数，再判断是否等于矩阵阶数。\n\n**学习步骤**\n1. 对矩阵进行初等行变换。\n2. 统计非零行数。\n3. 对照阶数判断。',
        evidence: [
          {
            id: 'S1',
            name: '体验讲义.txt',
            fileId: 'f1',
            section: '第一章',
            quote: '矩阵秩是线性无关列的最大数量。',
          },
        ],
        scope: { selected: 1, matchedFiles: 1, passages: 1 },
      },
    ],
  },
];
state.courses.push(
  {
    ...state.courses[0],
    id: 'c2',
    name: '概率论与数理统计',
    sessions: [],
    materials: [],
  },
  {
    ...state.courses[0],
    id: 'c3',
    name: '计算机程序设计与数据结构基础课程',
    sessions: [],
    materials: [],
  },
);
state.notes[0].tags = ['定义', '重点'];
state.notes[0].sources = [state.courses[0].sessions[0].messages[1].evidence[0]];
state.notes.push(
  ...Array.from({ length: 5 }, (_, i) => ({
    ...state.notes[0],
    id: 'n' + (i + 2),
    title: [
      '可逆矩阵判定',
      '特征值与特征向量',
      '向量空间的基',
      '正交投影',
      '条件概率',
    ][i],
    reviewAt: undefined,
  })),
);

(async () => {
  const browser = await chromium.launch({
    executablePath:
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let revision = 1;
    await page.route('**/api/**', async (r) => {
      if (new URL(r.request().url()).pathname === '/api/workspace') {
        if (r.request().method() === 'PUT') {
          state = r.request().postDataJSON().state;
          revision++;
        }
        return r.fulfill({ json: { state: structuredClone(state), revision } });
      }
      return r.fulfill({
        json: {
          configured: true,
          baseUrl: 'https://example.invalid',
          model: 'mock',
          history: [],
        },
      });
    });
    const base = process.env.COURSE_KB_TEST_URL || 'http://localhost:3015';
    const go = async (hash) => {
      await page.goto(base + '/#view=' + hash, { waitUntil: 'networkidle' });
    };
    fs.mkdirSync('test-results/layout-after', { recursive: true });
    for (const [width, height] of [
      [1366, 900],
      [768, 1024],
      [390, 844],
      [320, 568],
      [844, 390],
      [390, 450],
    ]) {
      await page.setViewportSize({ width, height });
      await go('study&course=c1&session=s1');
      const send = await page
        .getByRole('button', { name: '发送', exact: true })
        .boundingBox();
      const input = await page
        .getByRole('textbox', { name: '学习问题' })
        .boundingBox();
      assert.ok(
        send &&
          input &&
          send.y >= 0 &&
          send.y + send.height <= height &&
          input.y >= 0 &&
          input.y + input.height <= height,
        `composer outside ${width}x${height}: ${JSON.stringify({ send, input })}`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${width}x${height}`,
      );
      if (width <= 900) {
        assert.equal(await page.locator('#session-list').isVisible(), false);
        await page.getByRole('button', { name: /历史对话/ }).click();
        assert.equal(await page.locator('#session-list').isVisible(), true);
        await page.getByRole('button', { name: /收起对话列表/ }).click();
      }
      await page.screenshot({
        path: `test-results/layout-after/chat-${width}x${height}.png`,
      });
      console.log(
        `PASS viewport ${width}x${height}: input, send, history, width`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await go('study&course=c1&session=s1');
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true,
        value: 450,
      });
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const keyboardSend = await page
      .getByRole('button', { name: '发送', exact: true })
      .boundingBox();
    assert.ok(keyboardSend.y + keyboardSend.height <= 450);
    console.log(
      'PASS simulated visual viewport shrink with unchanged layout viewport',
    );
    await page.setViewportSize({ width: 1366, height: 900 });
    await go('materials&course=c1&file=f1');
    await page.getByRole('button', { name: '并排记笔记', exact: true }).click();
    assert.equal(
      await page.locator('.materials-layout > .list-panel').isVisible(),
      false,
    );
    const divider = page.getByRole('separator', { name: '调整原文与笔记宽度' });
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await divider.getAttribute('aria-valuenow'), '60');
    const box = await divider.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x - 90, box.y + 20);
    await page.mouse.up();
    assert.ok(Number(await divider.getAttribute('aria-valuenow')) < 60);
    await page.getByRole('button', { name: /切换资料/ }).click();
    assert.equal(
      await page.locator('.materials-layout > .list-panel').isVisible(),
      true,
    );
    const del = await page
      .getByRole('button', { name: '删除课程', exact: true })
      .boundingBox();
    const notes = await page
      .getByRole('button', { name: /课程笔记/ })
      .boundingBox();
    assert.ok(del.x < notes.x);
    console.log(
      'PASS reading list toggle, draggable/keyboard divider, left delete',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await go('knowledge&note=n1');
    assert.equal(
      await page
        .getByRole('tab', { name: '正文', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );
    assert.ok(
      await page.getByText('矩阵秩的定义', { exact: true }).isVisible(),
    );
    assert.equal(
      await page.locator('.suggested-links').getAttribute('open'),
      null,
    );
    await go('review');
    const start = await page
      .getByRole('button', { name: '开始复习', exact: true })
      .boundingBox();
    const tasks = await page
      .getByRole('heading', { name: '我的学习任务' })
      .boundingBox();
    assert.ok(start.y < tasks.y && start.y + start.height < 844);
    await page.getByRole('button', { name: '开始复习', exact: true }).click();
    assert.equal(
      await page.getByRole('heading', { name: '我的学习任务' }).count(),
      0,
    );
    await page
      .getByRole('button', { name: '退出本轮复习', exact: true })
      .click();
    assert.ok(
      await page.getByRole('heading', { name: '我的学习任务' }).isVisible(),
    );
    await page.getByRole('button', { name: '个人设置', exact: true }).click();
    const close = page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭', exact: true });
    assert.equal(await close.getAttribute('class'), 'settings-close');
    await close.click();
    assert.deepEqual(errors, []);
    console.log(
      'PASS default body, review hierarchy and exit, secondary settings close, no runtime errors',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
