import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';

let pending: Promise<Worker> | undefined;
function worker() {
  if (!pending) {
    const local = new URL('./ocr/', location.href).href;
    pending = new Promise<Worker>((resolve, reject) => {
      let failed = false;
      const fail = (error: unknown) => { failed = true; clearTimeout(timeout); reject(error); };
      const timeout = window.setTimeout(() => fail(new Error('OCR initialization timed out')), 30_000);
      // Some worker initialization errors are only reported to errorHandler.
      void createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
        workerPath: `${local}worker.min.js`, corePath: local, langPath: local,
        workerBlobURL: false, gzip: true, cacheMethod: 'none', errorHandler: fail,
      }).then(async instance => {
        if (failed) { await instance.terminate(); return; }
        try {
          await instance.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
          clearTimeout(timeout); resolve(instance);
        } catch (error) { await instance.terminate(); fail(error); }
      }, fail);
    }).catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
export async function recognizeLocal(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  // Bound CPU and memory for large/high-DPI displays.
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height), Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const { data } = await (await worker()).recognize(canvas);
  const text = data.text.trim();
  return data.confidence >= 25 && /[\p{L}\p{N}]/u.test(text) ? text : '';
}
export function disposeOcr() {
  const current = pending; pending = undefined;
  if (current) void current.then(instance => instance.terminate()).catch(() => {});
}
