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
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('BROWSER ERROR', m.text());
    });
    fs.mkdirSync('test-results', { recursive: true });
    const images = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1400;
      c.height = 500;
      const x = c.getContext('2d');
      x.fillStyle = 'white';
      x.fillRect(0, 0, 1400, 500);
      x.fillStyle = 'black';
      x.font = '48px "Microsoft YaHei"';
      x.fillText('矩阵的秩是线性无关列的最大数量。', 60, 120);
      x.fillText('Matrix rank equals 3.', 60, 220);
      return [
        c.toDataURL('image/png').split(',')[1],
        c.toDataURL('image/jpeg').split(',')[1],
      ];
    });
    fs.writeFileSync(
      'test-results/ocr-fixture.png',
      Buffer.from(images[0], 'base64'),
    );
    const jpeg = Buffer.from(images[1], 'base64');
    const stream = Buffer.from('q 700 0 0 250 0 0 cm /Im0 Do Q');
    const objects = [
      Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
      Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      Buffer.from(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 250] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
      ),
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width 1400 /Height 500 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
        ),
        jpeg,
        Buffer.from('\nendstream'),
      ]),
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
        stream,
        Buffer.from('\nendstream'),
      ]),
    ];
    let pdf = Buffer.from('%PDF-1.4\n');
    const offsets = [0];
    objects.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf = Buffer.concat([
        pdf,
        Buffer.from(`${i + 1} 0 obj\n`),
        o,
        Buffer.from('\nendobj\n'),
      ]);
    });
    const xref = pdf.length;
    pdf = Buffer.concat([
      pdf,
      Buffer.from(
        'xref\n0 6\n0000000000 65535 f \n' +
          offsets
            .slice(1)
            .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
            .join('') +
          `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
      ),
    ]);
    fs.writeFileSync('test-results/ocr-fixture.pdf', pdf);

    let state = {
        courses: [
          {
            id: 'c1',
            name: '识别测试课程',
            code: '',
            graphFocus: '',
            materials: [],
            sessions: [],
          },
        ],
        notes: [],
        tasks: [],
        activeView: 'materials',
        courseId: 'c1',
      },
      revision = 1,
      activeFile = '',
      fileIndex = 0;
    const files = new Map(),
      external = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== 'localhost')
        external.push(r.url());
    });
    await page.route('**/api/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/workspace') {
        if (r.request().method() === 'PUT') {
          state = r.request().postDataJSON().state;
          revision++;
        }
        return r.fulfill({ json: { state, revision } });
      }
      if (u.pathname === '/api/files') {
        if (r.request().method() === 'POST') {
          const id = 'f' + ++fileIndex;
          files.set(id, fs.readFileSync(activeFile));
          return r.fulfill({ json: { id } });
        }
        return r.fulfill({
          body: files.get(u.searchParams.get('id')),
          contentType: 'application/pdf',
        });
      }
      return r.fulfill({ json: { history: [] } });
    });
    await page.goto(
      (process.env.COURSE_KB_TEST_URL || 'http://localhost:3015') +
        '/#view=materials&course=c1',
      { waitUntil: 'networkidle' },
    );
    for (const ext of ['png', 'pdf']) {
      activeFile = 'test-results/ocr-fixture.' + ext;
      console.log('Starting', ext);
      await page.locator('input[type=file]').first().setInputFiles(activeFile);
      await page
        .getByRole('heading', { name: 'ocr-fixture.' + ext, exact: true })
        .waitFor();
      await page.waitForFunction(
        () => !document.querySelector('output.notice'),
      );
      if (ext === 'pdf') {
        await page
          .getByRole('button', { name: '识别扫描文字', exact: true })
          .click();
        await page.waitForFunction(
          () => !document.querySelector('output.notice'),
        );
      }
      await page.waitForTimeout(750);
      console.log('Read complete', ext);
      const material = state.courses[0].materials[0];
      const text = material.passages.map((p) => p.text).join(' ');
      assert.match(text, /矩阵/);
      assert.match(text, /rank/i);
      assert.equal(material.coverage.readPages, 1);
      assert.equal(material.coverage.emptyPages, 0);
      await page.getByText('校正识别正文', { exact: true }).click();
      await page
        .getByLabel('校正正文', { exact: true })
        .fill('人工核对后的矩阵秩定义');
      await page.getByRole('button', { name: '保存校正', exact: true }).click();
      await page.waitForTimeout(750);
      assert.equal(
        state.courses[0].materials[0].passages[0].text,
        '人工核对后的矩阵秩定义',
      );
      await page.screenshot({
        path: 'test-results/ocr-' + ext + '.png',
        fullPage: true,
      });
      console.log('PASS real local OCR and correction: ' + ext);
    }
    assert.deepEqual(external, []);
    console.log('PASS OCR makes no external network requests');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
