import { mkdir, copyFile, readdir } from 'node:fs/promises';
const out = 'public/ocr';
await mkdir(out, { recursive: true });
await copyFile(
  'node_modules/tesseract.js/dist/worker.min.js',
  out + '/worker.min.js',
);
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js') || file === 'LICENSE')
    await copyFile('node_modules/tesseract.js-core/' + file, out + '/' + file);
}
for (const lang of ['chi_sim', 'eng'])
  await copyFile(
    `node_modules/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`,
    `${out}/${lang}.traineddata.gz`,
  );
console.log('Prepared local OCR runtime and Chinese/English language data');
