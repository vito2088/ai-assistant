// Bundle OCR runtime and language data locally; capture never falls back to a CDN.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('public/ocr/', root);
await mkdir(output, { recursive: true });
const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/LICENSE.md', 'TESSERACT-LICENSE.txt'],
  ['tesseract.js-core/LICENSE', 'CORE-LICENSE.txt'],
  ...['', '-simd', '-relaxedsimd'].map(mode => [`tesseract.js-core/tesseract-core${mode}-lstm.wasm.js`, `tesseract-core${mode}-lstm.wasm.js`]),
  ...['eng', 'chi_sim'].map(lang => [`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${lang}.traineddata.gz`]),
];
await Promise.all(files.map(([source, name]) => copyFile(new URL(`node_modules/${source}`, root), new URL(name, output))));
await writeFile(new URL('NOTICE.txt', output), 'Local OCR: Tesseract.js and Tesseract.js-core (Apache-2.0).\nEnglish and Simplified Chinese tessdata (Apache-2.0): https://github.com/tesseract-ocr/tessdata\n');
console.log('Prepared offline OCR runtime and English / Simplified Chinese data.');
