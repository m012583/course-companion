import { createWorker } from 'tesseract.js';
// Assets are served locally; document pixels are not sent to an OCR provider.
export async function createOCR(progress: (message: string) => void) {
  progress('正在加载本机文字识别组件…');
  const worker = await createWorker('chi_sim+eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    logger: (event) => {
      if (event.status === 'recognizing text')
        progress(`文字识别 ${Math.round(event.progress * 100)}%`);
    },
  });
  return {
    async read(image: HTMLCanvasElement | Blob) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          worker.recognize(image),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('文字识别超时，请分成较小文件重试')),
              90000,
            );
          }),
        ]);
        return result.data.text.replace(
          /(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g,
          '',
        );
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => worker.terminate(),
  };
}
