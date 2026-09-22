/* oxlint-disable typescript/no-require-imports -- Standalone CommonJS capture tool. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const output = path.join(__dirname, '..', 'test-results', 'demo');
fs.mkdirSync(output, { recursive: true });
const now = new Date().toISOString();
const note = (id, title, text) => ({ id, title, text, courseId: 'demo-math', course: '线性代数 · 演示', createdAt: now, chapter: '矩阵与线性变换', tags: ['演示数据'], reviewAt: '2026-09-01' });
let state = {
  courses: [{ id: 'demo-math', name: '线性代数 · 演示', code: 'DEMO-01', chapters: ['矩阵与线性变换'], graphFocus: '',
    materials: [{ fileId: 'demo-file', name: '矩阵入门.md', type: 'MD', size: '1 KB', status: '已解析', chapter: '矩阵与线性变换', content: '# 矩阵与线性变换\n\n矩阵可以表示线性变换。对于二维向量，单位矩阵保持向量不变；对角矩阵可以表示沿坐标轴的缩放。\n\n## 学习目标\n- 理解矩阵乘法的几何意义\n- 用具体例子验证变换\n- 将问题整理为知识笔记', coverage: { characters: 110, truncated: false } }],
    sessions: [{ id: 'demo-session', title: '演示对话：理解线性变换', updatedAt: now, messages: [{ role: 'user', text: '如何直观理解矩阵表示的线性变换？' }, { role: 'assistant', text: '【演示文案，非本次真实 AI 调用】可以把向量看作平面上的箭头。矩阵作用在向量上，会将箭头映射到新的位置。单位矩阵保持箭头不变，对角矩阵可以沿坐标轴缩放。请结合教材例题核对。', evidence: [{ id: 'e1', name: '矩阵入门.md', section: '段落 1', quote: '矩阵可以表示线性变换。', fileId: 'demo-file' }] }] }],
  }],
  notes: [
    { ...note('demo-n1', '矩阵表示线性变换', '矩阵可以表示线性变换。理解一个变换，可以先观察它怎样作用于基向量，再用线性组合解释其他向量。'), relatedIds: ['demo-n2'], relatedLabels: { 'demo-n2': '先修知识' }, conceptGraph: { nodes: [{ id: 'root', label: '线性变换', description: '保持向量加法与数乘。' }, { id: 'basis', label: '基向量', description: '观察变换对基向量的作用。' }, { id: 'matrix', label: '矩阵表示', description: '把变换的结果按列组织。' }], edges: [{ id: 'e1', from: 'root', to: 'basis', label: '观察' }, { id: 'e2', from: 'root', to: 'matrix', label: '表示' }], generatedAt: now, sourceFingerprint: 'demo', edited: true } },
    note('demo-n2', '向量的线性组合', '向量可以通过数乘和相加形成线性组合。'),
  ],
  tasks: [{ id: 'demo-task', title: '整理矩阵的几何意义', kind: 'learn', courseId: 'demo-math', content: '阅读资料，记录疑问，再将自己的理解保存成笔记。', status: 'todo', date: '2026-09-22', createdAt: now }],
  courseId: 'demo-math', activeView: 'home', preferences: { brandName: '课伴', userName: '演示用户', semester: '演示工作区 · 非真实数据' },
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.route('**/api/workspace', (route) => {
      if (route.request().method() === 'PUT') state = route.request().postDataJSON().state;
      return route.fulfill({ json: { state, revision: 1 } });
    });
    const page = await context.newPage();
    const routes = ['view=home', 'view=course&course=demo-math', 'view=materials&course=demo-math', 'view=study&course=demo-math&session=demo-session', 'view=knowledge&note=demo-n1', 'view=graph', 'view=review', 'view=home'];
    for (let index = 0; index < routes.length; index++) {
      await page.goto(`${process.env.COURSE_KB_TEST_URL || 'http://localhost:3010'}/#${routes[index]}`);
      await page.getByRole('button', { name: '个人设置', exact: true }).waitFor();
      await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(output, `${index + 1}.png`) });
    }
    console.log(output);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
