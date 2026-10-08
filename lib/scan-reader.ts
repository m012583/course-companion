import { splitPassages, type Coverage, type Passage } from './knowledge';
export async function readScan(
  file: File,
  progress: (text: string) => void,
  signal: AbortSignal,
): Promise<{ passages: Passage[]; coverage: Coverage }> {
  progress('加载本机识别组件…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('chi_sim+eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    logger: (event) => {
      if (event.status === 'recognizing text')
        progress(`当前页识别 ${Math.round(event.progress * 100)}%`);
    },
  });
  const abort = () => {
    void worker.terminate();
  };
  signal.addEventListener('abort', abort, { once: true });
  let cleanup: (() => Promise<void>) | undefined;
  const passages: Passage[] = [];
  let characters = 0,
    emptyPages = 0,
    readPages = 0,
    totalPages = 1;
  async function recognize(image: HTMLCanvasElement | File, page: number) {
    if (signal.aborted) throw new Error('已停止识别，原资料保留。');
    progress(`正在识别第 ${page} 页…`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        worker.recognize(image),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('单页识别超时，请拆分资料后重试。')),
            90000,
          );
        }),
      ]);
      const text = result.data.text
        .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '')
        .slice(0, 400000 - characters);
      characters += text.length;
      readPages++;
      if (!text.trim()) emptyPages++;
      passages.push(...splitPassages(text, page));
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    if (signal.aborted) throw new Error('已停止识别。');
    if (/\.pdf$/i.test(file.name)) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const loading = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      cleanup = () => loading.destroy();
      const pdf = await loading.promise;
      totalPages = pdf.numPages;
      for (
        let i = 1;
        i <= Math.min(pdf.numPages, 20) && characters < 400000;
        i++
      ) {
        if (signal.aborted) throw new Error('已停止识别，原资料保留。');
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const scaled = page.getViewport({
          scale: Math.min(2, 2400 / Math.max(viewport.width, viewport.height)),
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        try {
          await page.render({ canvas, viewport: scaled }).promise;
          await recognize(canvas, i);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
        }
      }
    } else if (/\.(png|jpe?g|webp)$/i.test(file.name)) await recognize(file, 1);
    else throw new Error('请选择 PDF、PNG、JPEG 或 WebP。');
    if (signal.aborted) throw new Error('已停止识别，原资料保留。');
    return {
      passages,
      coverage: {
        characters,
        totalPages,
        readPages,
        emptyPages,
        truncated: readPages < totalPages || characters >= 400000,
      },
    };
  } finally {
    signal.removeEventListener('abort', abort);
    await cleanup?.();
    await worker.terminate();
  }
}
