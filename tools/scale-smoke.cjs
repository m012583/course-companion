/* oxlint-disable typescript/no-require-imports -- Standalone browser test. */
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || 'playwright-core',
);
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({
    executablePath:
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
    });
    let state = {
      courses: Array.from({ length: 10 }, (_, i) => ({
        id: 'c' + i,
        name: '性能课程' + i,
        code: '',
        graphFocus: '',
        sessions: [],
        materials: Array.from({ length: 4 }, (_, j) => ({
          name: '教材' + j,
          type: 'TXT',
          size: '20 KB',
          status: '可检索',
          passages: Array.from({ length: 100 }, (_, k) => ({
            section: '段落' + k,
            text: '课程基础知识与学习方法。'.repeat(20),
          })),
        })),
      })),
      notes: Array.from({ length: 1000 }, (_, i) => ({
        id: 'n' + i,
        title: '性能定位' + i,
        courseId: 'c' + (i % 10),
        course: '性能课程' + (i % 10),
        text: '这是用于容量测试的自编笔记。'.repeat(40),
        createdAt: '2026-09-24',
      })),
      tasks: [],
      courseId: 'c0',
      activeView: 'knowledge',
    };
    let revision = 1;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (r) => {
      if (new URL(r.request().url()).pathname === '/api/workspace') {
        if (r.request().method() === 'PUT') {
          await new Promise((resolve) => setTimeout(resolve, 600));
          state = r.request().postDataJSON().state;
          revision++;
        }
        return r.fulfill({ json: { state, revision } });
      }
      return r.fulfill({ json: { history: [] } });
    });
    const start = performance.now();
    await page.goto(
      (process.env.COURSE_KB_TEST_URL || 'http://localhost:3015') +
        '/#view=knowledge',
      { waitUntil: 'networkidle' },
    );
    await page.getByText('性能定位999', { exact: true }).waitFor();
    const loadMs = Math.round(performance.now() - start);
    await page.keyboard.press('Control+k');
    const query = page.getByPlaceholder('搜索课程、笔记、资料、任务或对话');
    const searchStart = performance.now();
    await query.fill('性能定位999');
    await page
      .getByRole('dialog')
      .getByText('性能定位999', { exact: true })
      .waitFor();
    const searchMs = Math.round(performance.now() - searchStart);
    assert.deepEqual(errors, []);
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/scale-search.png' });
    const report = {
      date: new Date().toISOString(),
      notes: 1000,
      materials: 40,
      passages: 4000,
      bytes: Buffer.byteLength(JSON.stringify(state)),
      loadMs,
      searchMs,
      apiWriteDelayMs: 600,
      scope: '单次本机 Edge 开发服务、模拟 API；不是生产并发或容量上限',
    };
    fs.writeFileSync(
      'evaluation/scale-report.json',
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
