import { t, h, setLocale } from './i18n';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import './capture-overlay.css';
import { captureIcon } from './capture-icons';
import { translateCaptureText } from './capture-translation';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type Kind = 'select' | 'pen' | 'arrow' | 'rectangle' | 'ellipse' | 'text' | 'mosaic' | 'step';
type Mark = { kind: Kind; points: Point[]; color: string; width: number; text?: string };
const query = new URLSearchParams(location.search);
const recording = query.get('mode') === 'recording';
const path = query.get('path')!;
const root = document.querySelector<HTMLDivElement>('#capture-root')!;
let region: Rect | null = null;
let tool: Kind = 'select';
let marks: Mark[] = [], redo: Mark[] = [];
let draft: Mark | null = null;
let color = '#ff4d5a', thickness = 4;
let drag: { start: Point; original: Rect | null; operation: string } | null = null;
let activePointerId: number | null = null;
let completing = false, counting = false, countdownToken = 0, toolbar = false;
let image: ImageBitmap;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
const border = document.createElement('div'); border.className = 'selection';
const bar = document.createElement('div'); bar.className = 'capture-actions';
const dock = document.createElement('div'); dock.className = 'capture-dock';
const ocrPanel = document.createElement('section'); ocrPanel.className = 'capture-ocr'; ocrPanel.hidden = true;
let ocrText = '', ocrError = '', ocrLoading = false, ocrRunning = false, ocrQueued = false, ocrRevision = 0;
let autoOcr = false, ocrOpen = false, ocrDismissed = false, sourceVisible = false;
let aiEnabled = true, autoTranslate = false, translateRequested = false;
let translatedText = '', translationError = '', translating = false;
let translationController: AbortController | undefined;
ocrPanel.id = 'capture-ocr-result';
let ocrTimer: number | undefined;
let ocrModule: typeof import('./capture-ocr') | undefined;
const hint = document.createElement('div'); hint.className = 'capture-hint';
const textInput = document.createElement('textarea'); textInput.className = 'annotation-text'; textInput.placeholder = t("输入文字，Ctrl+Enter 确认"); textInput.hidden = true;
let textPoint: Point | null = null;
if (!recording) dock.append(bar, ocrPanel);
root.append(canvas, border, recording ? bar : dock, hint, textInput);
const names: [Kind, string, string][] = [['select', '选区 (V)', '⌖'], ['pen', '画笔 (P)', '✎'], ['arrow', '箭头 (A)', '↗'], ['rectangle', '矩形 (R)', '□'], ['ellipse', '椭圆 (O)', '○'], ['text', '文字 (T)', 'T'], ['mosaic', '马赛克 (M)', '▦'], ['step', '序号 (N)', '①']];
function button(action: string, label: string, text = label, extra = '') {
  const attrs = extra.includes('class="') ? extra.replace('class="', 'class="capture-icon-button ') : `class="capture-icon-button" ${extra}`;
  const icon = action === 'done' && recording ? 'play' : action === 'pause' && text === t("继续") ? 'play' : action;
  return `<button type="button" data-do="${action}" title="${h(label)}" aria-label="${h(label)}" ${names.some(([kind]) => kind === action) ? `aria-pressed="${tool === action}"` : ''} ${attrs}>${captureIcon(icon)}</button>`;
}
function renderBar() {
  if (toolbar) return;
  bar.innerHTML = `${button('full', t("全屏"), t("全屏"))}${button('last', t("上次选区"), t("上次"))}${recording ? '' : names.map(([kind, label, icon]) => button(kind, label, icon, `class="${tool === kind ? 'active' : ''}"`)).join('')}${recording ? '' : `<span class="separator"></span><input id="color" type="color" aria-label="${h("标注颜色")}" value="` + color + `"><select id="width" aria-label="${h("线条粗细")}"><option value="2">${h("细")}</option><option value="4">${h("中")}</option><option value="8">${h("粗")}</option></select>` + button('undo', t("撤销 Ctrl+Z"), '↶', marks.length ? '' : 'disabled') + button('redo', t("重做 Ctrl+Shift+Z"), '↷', redo.length ? '' : 'disabled') + button('pin', t("固定到桌面"), t("固定"), region ? '' : 'disabled') + button('copy', t("复制图片 Ctrl+C"), t("复制"))}${button('cancel', t("取消 Esc"), t("取消"))}${button('done', recording ? t("倒计时后开始录制") : t("完成标注并保存 Enter"), recording ? t("开始录制") : t("完成"), `class="primary" ${region ? '' : 'disabled'}`)}`;
  if (!recording) bar.querySelector('[data-do="cancel"]')!.insertAdjacentHTML('beforebegin', button('save', t('另存为本地图片 Ctrl+S'), '', region ? '' : 'disabled'));
  if (!recording) bar.querySelector('[data-do="save"]')!.insertAdjacentHTML('beforebegin', button('ocr', t('识别文字'), '', `aria-controls="capture-ocr-result" aria-expanded="${ocrOpen && sourceVisible}" class="${ocrOpen && sourceVisible ? 'active' : ''}" ${region ? '' : 'disabled'}`));
  if (!recording) bar.querySelector('[data-do="save"]')!.insertAdjacentHTML('beforebegin', button('translate', t('翻译文字（AI）'), '', `aria-controls="capture-ocr-result" aria-expanded="${ocrOpen && translateRequested}" class="capture-translate-button ${ocrOpen && translateRequested ? 'active' : ''}" ${region && aiEnabled ? '' : 'disabled'}`));
  bar.querySelector('[data-do="translate"]')?.insertAdjacentHTML('beforeend', '<span class="capture-ai-badge">AI</span>');
  const width = bar.querySelector<HTMLSelectElement>('#width'); if (width) width.value = String(thickness);
  positionBar();
}
function scale() { return { x: canvas.width / innerWidth, y: canvas.height / innerHeight }; }
function point(e: PointerEvent): Point { const s = scale(); return { x: Math.max(0, Math.min(canvas.width, e.clientX * s.x)), y: Math.max(0, Math.min(canvas.height, e.clientY * s.y)) }; }
function rect(a: Point, b: Point): Rect { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; }
function inside(p: Point, r: Rect) { return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height; }
function positionBar() {
  const container = recording ? bar : dock;
  const s = scale();
  const left = region ? region.x / s.x : (innerWidth - container.offsetWidth) / 2;
  const bottom = region ? (region.y + region.height) / s.y : 70;
  container.style.left = `${Math.max(8, Math.min(innerWidth - container.offsetWidth - 8, left))}px`;
  const top = bottom + container.offsetHeight + 16 < innerHeight ? bottom + 10 : (region ? region.y / s.y - container.offsetHeight - 10 : 70);
  container.style.top = `${Math.max(8, Math.min(innerHeight - container.offsetHeight - 8, top))}px`;
}
function renderOcr() {
  ocrPanel.hidden = recording || !ocrOpen;
  const toggle = bar.querySelector('[data-do="ocr"]');
  toggle?.setAttribute('aria-expanded', String(ocrOpen && sourceVisible)); toggle?.classList.toggle('active', ocrOpen && sourceVisible);
  const translateToggle = bar.querySelector('[data-do="translate"]');
  translateToggle?.setAttribute('aria-expanded', String(ocrOpen && translateRequested)); translateToggle?.classList.toggle('active', ocrOpen && translateRequested);
  if (ocrPanel.hidden) { positionBar(); return; }
  const closeButton = `<button type="button" class="ocr-close" data-do="close-ocr" title="${h('关闭结果')}" aria-label="${h('关闭结果')}">${captureIcon('cancel')}</button>`;
  const loading = ocrLoading ? `<p role="status">${sourceVisible ? h('正在本地识别文字…') : h('正在读取截图文字…')}</p>` : ocrError ? `<p role="alert"></p>` : !ocrText ? `<p role="status">${h('未识别到文字，可调整选区后重新识别')}</p>` : '';
  ocrPanel.innerHTML = sourceVisible
    ? `<header><strong>${h('识别文字（本地）')}</strong><div class="ocr-panel-actions">${ocrText ? `<button type="button" data-do="translate-result" ${!aiEnabled || translating ? 'disabled' : ''}>${h('翻译')} <span class="settings-ai-badge">AI</span></button><button type="button" data-do="copy-text">${h('复制文字')}</button>` : ocrError ? `<button type="button" data-do="retry-ocr">${h('重新识别')}</button>` : ''}${closeButton}</div></header>${loading}${ocrText ? `<textarea readonly aria-label="${h('截图中的文字')}" spellcheck="false"></textarea>` : ''}`
    : '';
  const result = ocrPanel.querySelector('textarea'); if (result) result.value = ocrText;
  const error = ocrPanel.querySelector('[role=alert]'); if (error) error.textContent = ocrError;
  if (translateRequested) {
    const section = document.createElement('div'); section.className = 'capture-translation';
    section.innerHTML = `<header><strong>${h('译文')} <span class="settings-ai-badge">AI</span></strong><div class="ocr-panel-actions">${translatedText ? `<button type="button" data-do="copy-translation">${h('复制译文')}</button>` : translationError ? `<button type="button" data-do="translate-result">${h('重试翻译')}</button>` : ocrError && !sourceVisible ? `<button type="button" data-do="retry-ocr">${h('重新识别')}</button>` : ''}${sourceVisible ? '' : closeButton}</div></header>${!sourceVisible && (ocrLoading || ocrError || !ocrText) ? loading : translating ? `<p role="status">${h('正在翻译…')}</p>` : translationError ? '<p role="alert"></p>' : translatedText ? `<textarea readonly aria-label="${h('译文')}" spellcheck="false"></textarea>` : ''}`;
    const output = section.querySelector('textarea'); if (output) output.value = translatedText;
    const failure = section.querySelector('[role=alert]'); if (failure) failure.textContent = ocrError || translationError;
    ocrPanel.append(section);
  }
  positionBar();
}
function invalidateOcr() {
  translationController?.abort(); translationController = undefined;
  translatedText = ''; translationError = ''; translating = false;
  ++ocrRevision; clearTimeout(ocrTimer); ocrQueued = false; ocrText = ''; ocrError = ''; ocrLoading = false;
  ocrPanel.hidden = true;
}
function scheduleOcr(manual = false) {
  if (recording) return;
  if (manual) { ocrOpen = true; ocrDismissed = false; }
  if (!manual && !ocrDismissed) { sourceVisible ||= autoOcr; translateRequested ||= autoTranslate; }
  const wanted = sourceVisible || translateRequested;
  invalidateOcr();
  if (!wanted || !region || region.width < 2 || region.height < 2) { ocrOpen = false; renderOcr(); return; }
  ocrOpen = true; ocrLoading = true; renderOcr();
  ocrTimer = window.setTimeout(() => { ocrQueued = true; void runOcr(); }, manual ? 0 : 450);
}
async function runOcr() {
  if (ocrRunning || !ocrQueued || !region || activePointerId !== null || completing) return;
  ocrQueued = false; ocrRunning = true; const revision = ocrRevision;
  try {
    const blob = await png();
    ocrModule ??= await import('./capture-ocr');
    const text = await ocrModule.recognizeLocal(blob);
    if (revision === ocrRevision) ocrText = text;
  } catch (error) {
    if (revision === ocrRevision) ocrError = t('本地文字识别失败：{0}', [String(error)]);
  } finally {
    ocrRunning = false;
    if (revision === ocrRevision) {
      ocrLoading = false; renderOcr();
      if (ocrText && aiEnabled && translateRequested) void runTranslation(ocrText, revision);
    }
    if (ocrQueued) void runOcr();
  }
}
async function runTranslation(text: string, revision: number) {
  const controller = new AbortController(); translationController = controller;
  translating = true; translationError = ''; translatedText = ''; renderOcr();
  try {
    const result = await translateCaptureText(text, controller.signal);
    if (!controller.signal.aborted && revision === ocrRevision) translatedText = result;
  } catch (error) {
    if (!controller.signal.aborted && revision === ocrRevision) translationError = t('翻译失败：{0}', [String(error)]);
  } finally {
    if (!controller.signal.aborted && revision === ocrRevision) { translating = false; translationController = undefined; renderOcr(); }
  }
}
function drawMark(context: CanvasRenderingContext2D, mark: Mark) {
  const a = mark.points[0], b = mark.points.at(-1)!;
  context.save(); context.strokeStyle = context.fillStyle = mark.color; context.lineWidth = mark.width; context.lineCap = 'round'; context.lineJoin = 'round';
  const r = rect(a, b);
  if (mark.kind === 'mosaic') {
    if (r.width >= 1 && r.height >= 1) {
      const pixel = document.createElement('canvas'); pixel.width = Math.max(1, Math.ceil(r.width / 18)); pixel.height = Math.max(1, Math.ceil(r.height / 18));
      pixel.getContext('2d')!.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, pixel.width, pixel.height);
      context.imageSmoothingEnabled = false; context.drawImage(pixel, r.x, r.y, r.width, r.height);
    }
  } else if (mark.kind === 'text') {
    context.font = `600 ${mark.width * 5 + 16}px "Microsoft YaHei", sans-serif`; context.textBaseline = 'top';
    mark.text?.split('\n').forEach((line, i) => context.fillText(line, a.x, a.y + i * (mark.width * 5 + 22)));
  } else if (mark.kind === 'step') {
    const radius = mark.width * 2 + 14; context.beginPath(); context.arc(a.x, a.y, radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff'; context.font = `bold ${radius}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(mark.text ?? '1', a.x, a.y);
  } else {
    context.beginPath();
    if (mark.kind === 'rectangle') context.rect(r.x, r.y, r.width, r.height);
    else if (mark.kind === 'ellipse') context.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, 2 * Math.PI);
    else {
      context.moveTo(a.x, a.y); mark.points.slice(1).forEach(p => context.lineTo(p.x, p.y));
      if (mark.kind === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x), length = mark.width * 4 + 12;
        context.moveTo(b.x - length * Math.cos(angle - .45), b.y - length * Math.sin(angle - .45)); context.lineTo(b.x, b.y); context.lineTo(b.x - length * Math.cos(angle + .45), b.y - length * Math.sin(angle + .45));
      }
    }
    context.stroke();
  }
  context.restore();
}
function paint(output = false) {
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
  ctx.save();
  if (region) { ctx.beginPath(); ctx.rect(region.x, region.y, region.width, region.height); ctx.clip(); }
  marks.forEach(m => drawMark(ctx, m)); if (draft) drawMark(ctx, draft); ctx.restore();
  if (output) return;
  ctx.fillStyle = '#09132188';
  if (region) {
    const r = region; ctx.fillRect(0, 0, canvas.width, r.y); ctx.fillRect(0, r.y + r.height, canvas.width, canvas.height - r.y - r.height); ctx.fillRect(0, r.y, r.x, r.height); ctx.fillRect(r.x + r.width, r.y, canvas.width - r.x - r.width, r.height);
    const s = scale(); border.hidden = false; Object.assign(border.style, { left: `${r.x / s.x}px`, top: `${r.y / s.y}px`, width: `${r.width / s.x}px`, height: `${r.height / s.y}px` });
    border.innerHTML = `<span class="selection-size">${Math.round(r.width)} × ${Math.round(r.height)}</span>${['nw','n','ne','e','se','s','sw','w'].map(h => `<i class="handle ${h}" data-handle="${h}"></i>`).join('')}`;
    border.classList.toggle('editable', tool === 'select');
  } else border.hidden = true;
  hint.textContent = recording ? t("框选录制区域 · 拖动内部移动，边缘调整 · Enter 开始 · Esc 取消") : t("拖动框选 · V 调整选区 · Ctrl+Z 撤销 · Enter 完成 · Esc 取消");
  positionBar();
}
function commitText() {
  if (textPoint && textInput.value.trim()) { marks.push({ kind: 'text', points: [textPoint], color, width: thickness, text: textInput.value }); redo = []; }
  textInput.hidden = true; textInput.value = ''; textPoint = null;
}
root.addEventListener('pointerdown', e => {
  if (!image || toolbar || counting || completing || (e.target as HTMLElement).closest('.capture-actions,.capture-ocr,.annotation-text,.capture-hint')) return;
  if (e.button !== 0) return;
  commitText(); invalidateOcr(); const p = point(e); const target = e.target as HTMLElement;
  if (tool === 'select' || !region) {
    drag = { start: p, original: region ? { ...region } : null, operation: target.dataset.handle ?? (region && inside(p, region) ? 'move' : 'new') };
    if (drag.operation === 'new') region = { ...p, width: 0, height: 0 };
  } else if (inside(p, region)) {
    if (tool === 'text') {
      e.preventDefault();
      textPoint = p; textInput.hidden = false; textInput.style.left = `${Math.min(e.clientX, innerWidth - 300)}px`; textInput.style.top = `${Math.min(e.clientY, innerHeight - 100)}px`; textInput.style.color = color; textInput.focus(); return;
    }
    draft = { kind: tool, points: [p], color, width: thickness };
    if (tool === 'step') { draft.text = String(marks.filter(m => m.kind === 'step').length + 1); marks.push(draft); draft = null; redo = []; }
  }
  activePointerId = e.pointerId;
  root.setPointerCapture(e.pointerId); paint();
});
root.addEventListener('pointermove', e => {
  if (!drag && !draft) return;
  const p = point(e);
  if (drag) {
    const r = drag.original, op = drag.operation;
    if (op === 'new' || !r) region = rect(drag.start, p);
    else if (op === 'move') region = { ...r, x: Math.max(0, Math.min(canvas.width - r.width, r.x + p.x - drag.start.x)), y: Math.max(0, Math.min(canvas.height - r.height, r.y + p.y - drag.start.y)) };
    else { const a = { x: r.x, y: r.y }, b = { x: r.x + r.width, y: r.y + r.height }; if (op.includes('w')) a.x = p.x; if (op.includes('e')) b.x = p.x; if (op.includes('n')) a.y = p.y; if (op.includes('s')) b.y = p.y; region = rect(a, b); }
  } else if (draft) { if (draft.kind === 'pen') draft.points.push(p); else draft.points = [draft.points[0], p]; }
  paint();
});
function release(e: PointerEvent) {
  // Toolbar pointerup events must preserve their buttons until click fires.
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;
  if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
  drag = null; if (draft) { marks.push(draft); redo = []; draft = null; }
  if (region && (region.width < 2 || region.height < 2)) region = null;
  renderBar(); paint(); scheduleOcr();
}
root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);
async function png(): Promise<Blob> {
  commitText(); if (!region) throw new Error(t("请先框选区域")); paint(true);
  const output = document.createElement('canvas'); output.width = Math.round(region.width); output.height = Math.round(region.height);
  output.getContext('2d')!.drawImage(canvas, Math.round(region.x), Math.round(region.y), output.width, output.height, 0, 0, output.width, output.height); paint();
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("生成图片失败"))), 'image/png'));
}
async function saveAs() {
  if (!region || recording || completing || counting) return;
  completing = true;
  bar.setAttribute('aria-busy', 'true');
  try {
    const blob = await png();
    const saved = await invoke<string | null>('get_setting', { key: 'capture_preferences' });
    let directory = '';
    try { const preferences = JSON.parse(saved ?? '{}'); if (typeof preferences?.screenshotDirectory === 'string') directory = preferences.screenshotDirectory; } catch { /* Use the system default folder for invalid preferences. */ }
    const name = t('截图-{0}.png', [new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')]);
    let destination = await save({ title: t('另存截图'), defaultPath: directory ? await join(directory, name) : name, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!destination) return;
    if (!/\.[^\\/.]+$/.test(destination)) destination += '.png';
    if (!/\.png$/i.test(destination)) throw new Error(t('请使用 .png 文件扩展名'));
    const id = await invoke<string>('begin_tool_export', { path: destination });
    try {
      for (let start = 0; start < blob.size; start += 1024 * 1024) await invoke('append_tool_export', new Uint8Array(await blob.slice(start, start + 1024 * 1024).arrayBuffer()), { headers: { 'x-export-id': id } });
      await invoke('finish_tool_export', { id, discard: false });
    } catch (error) { await invoke('finish_tool_export', { id, discard: true }).catch(() => {}); throw error; }
    hint.textContent = t('图片已保存到：{0}', [destination]);
  } catch (error) {
    hint.textContent = t('截图保存失败：{0}', [String(error)]);
  } finally {
    completing = false;
    bar.removeAttribute('aria-busy');
    if (ocrQueued) void runOcr();
  }
}
async function done(pin = false) {
  if (!region || completing || counting) return;
  invalidateOcr();
  commitText();
  localStorage.setItem(`capture-region-${canvas.width}x${canvas.height}`, JSON.stringify(region));
  if (recording) {
    counting = true; const token = ++countdownToken; bar.hidden = true; border.hidden = true;
    const counter = document.createElement('div'); counter.className = 'countdown'; root.append(counter);
    for (let n = Number(query.get('countdown') ?? 3); n > 0; n--) {
      counter.textContent = `${n}`; hint.textContent = t("准备录制 · Esc 返回选区"); await new Promise(r => setTimeout(r, 1000));
      if (token !== countdownToken) { counter.remove(); return; }
    }
    counter.remove(); completing = true;
    try {
      prepareRecordingToolbar();
      await invoke('capture_toolbar');
      // Paint the small control bar before starting the encoder.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await emit('capture-selected', { region: { x: Math.floor(region.x), y: Math.floor(region.y), width: Math.floor(region.width) & ~1, height: Math.floor(region.height) & ~1 } });
    } catch (error) { await emit('capture-cancel'); throw error; }
  } else {
    completing = true;
    hint.textContent = t("正在生成截图…");
    try {
      const blob = await png(); const output = await invoke<string>('new_capture_draft', { extension: 'png' });
      const id = await invoke<string>('begin_tool_export', { path: output });
      try {
        for (let start = 0; start < blob.size; start += 1024 * 1024) await invoke('append_tool_export', new Uint8Array(await blob.slice(start, start + 1024 * 1024).arrayBuffer()), { headers: { 'x-export-id': id } });
        await invoke('finish_tool_export', { id, discard: false });
      } catch (e) { await invoke('finish_tool_export', { id, discard: true }).catch(() => {}); throw e; }
      if (pin) {
        await invoke('pin_capture', { path: output, bounds: { x: region.x / canvas.width, y: region.y / canvas.height, width: region.width / canvas.width, height: region.height / canvas.height } });
      }
      await getCurrentWindow().hide(); await emit('capture-finished', { path: output, pinned: pin });
    } finally { completing = false; }
  }
}
async function action(a: string) {
  if (completing && !toolbar) return;
  if (!image && a !== 'cancel') return;
  commitText();
  if (a === 'cancel') { invalidateOcr(); await emit('capture-cancel'); return; }
  if (a === 'copy-text') { await navigator.clipboard.writeText(ocrText); hint.textContent = t('文字已复制'); return; }
  if (a === 'copy-translation') { await navigator.clipboard.writeText(translatedText); hint.textContent = t('文字已复制'); return; }
  if (a === 'translate' && aiEnabled) { sourceVisible = false; translateRequested = true; scheduleOcr(true); return; }
  if (a === 'translate-result' && aiEnabled && ocrText && !translating) { translateRequested = true; void runTranslation(ocrText, ocrRevision); return; }
  if (a === 'ocr' || a === 'retry-ocr') { if (a === 'ocr') { sourceVisible = true; translateRequested = false; } scheduleOcr(true); return; }
  if (a === 'close-ocr') { ocrOpen = false; sourceVisible = false; ocrDismissed = true; translateRequested = false; invalidateOcr(); renderOcr(); return; }
  if (a === 'done') { await done(); return; }
  if (a === 'pin' && !recording) { await done(true); return; }
  if (a === 'save' && !recording) { await saveAs(); return; }
  if (a === 'copy') { const blob = await png(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); hint.textContent = t("图片已复制，可以继续编辑或完成保存"); return; }
  if (a === 'stop') { await emit('tools-stop-recording'); return; }
  if (a === 'pause') { await emit('capture-pause'); return; }
  if (a === 'full') region = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (a === 'last') { const saved = localStorage.getItem(`capture-region-${canvas.width}x${canvas.height}`); if (saved) region = JSON.parse(saved); }
  if (a === 'undo' && marks.length) redo.push(marks.pop()!);
  if (a === 'redo' && redo.length) marks.push(redo.pop()!);
  if (names.some(([k]) => k === a)) tool = a as Kind;
  renderBar(); paint();
  if (['full', 'last', 'undo', 'redo'].includes(a)) scheduleOcr();
}
root.addEventListener('click', e => { const a = (e.target as HTMLElement).closest<HTMLElement>('[data-do]')?.dataset.do; if (a) void action(a).catch(error => { hint.textContent = String(error); }); });
bar.addEventListener('change', e => { const el = e.target as HTMLInputElement; if (el.id === 'color') color = el.value; if (el.id === 'width') thickness = Number(el.value); });
document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).closest('.capture-ocr') && e.key !== 'Escape') return;
  if (toolbar) { if (e.key === 'Escape') void emit('tools-stop-recording'); return; }
  if (e.target === textInput) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitText(); renderBar(); paint(); scheduleOcr(); } return; }
  let a = '';
  if (e.key === 'Escape') {
    if (counting && !completing) { ++countdownToken; counting = false; bar.hidden = false; paint(); return; }
    a = 'cancel';
  }
  if (e.key === 'Enter') a = 'done';
  if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') a = e.shiftKey ? 'redo' : 'undo'; if (e.key.toLowerCase() === 'c') a = 'copy'; if (e.key.toLowerCase() === 'y') a = 'redo'; }
  else if (!recording) a = ({v:'select',p:'pen',a:'arrow',r:'rectangle',o:'ellipse',t:'text',m:'mosaic',n:'step'} as Record<string,string>)[e.key.toLowerCase()] ?? a;
  if (!recording && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') a = 'save';
  if (a) { e.preventDefault(); void action(a).catch(error => { hint.textContent = String(error); }); }
});
window.addEventListener('resize', () => { if (!toolbar && image) paint(); });
let startedAt = 0, paused = false, frozen = '00:00';
function prepareRecordingToolbar() {
  if (toolbar) return;
  toolbar = true; document.body.classList.add('recording-mode'); image.close(); canvas.remove(); border.remove(); textInput.remove(); hint.remove();
  root.className = 'record-toolbar'; bar.className = 'record-controls'; bar.hidden = false; bar.removeAttribute('style');
  bar.innerHTML = `<span class="red-dot"></span><span>${h('正在准备录制…')}</span>`;
}
void listen<{active: boolean; paused: boolean; startedAt: number}>('tools-recording', async ({payload}) => {
  if (!recording || !payload.active) return;
  startedAt = payload.startedAt; paused = payload.paused;
  prepareRecordingToolbar();
  bar.innerHTML = `<span data-tauri-drag-region class="record-drag" title="${h("拖动控制条")}">${captureIcon('drag')}</span><span class="red-dot ${paused ? 'paused' : ''}"></span><time id="record-clock" aria-label="${h("录制时长")}">${frozen}</time><span class="separator"></span>${button('pause', paused ? t("继续录制") : t("暂停录制"), paused ? t("继续") : t("暂停"))}${button('stop', t("结束录制并预览"), t("结束"), 'class="primary"')}`;
});
setInterval(() => {
  if (!toolbar || paused) return; const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)); frozen = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  const clock = document.querySelector('#record-clock'); if (clock) clock.textContent = frozen;
}, 500);
async function initialize() {
  setLocale(await invoke<string | null>('get_setting', { key: 'ui_language' }));
  if (!recording) {
    try {
      const saved = await invoke<string | null>('get_setting', { key: 'capture_preferences' });
      const preferences = JSON.parse(saved ?? '{}');
      autoOcr = preferences?.autoOcr === true;
      const features = await invoke<string | null>('get_setting', { key: 'feature_visibility' });
      aiEnabled = JSON.parse(features ?? '{}')?.aiChat !== false;
      autoTranslate = preferences?.autoTranslate === true && aiEnabled;
    } catch { autoOcr = false; }
  }
  textInput.placeholder = t('输入文字，Ctrl+Enter 确认');
  hint.textContent = t("正在准备屏幕画面…");
  const bytes = await invoke<ArrayBuffer>('read_capture_draft', {path}); image = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
  canvas.width = image.width; canvas.height = image.height; renderBar(); paint();
}
void initialize().catch(error => { hint.textContent = t("打开截图失败：{0}，按 Esc 取消", [error]); });
window.addEventListener('beforeunload', () => { invalidateOcr(); ocrModule?.disposeOcr(); });
window.addEventListener('storage', event => {
  if (event.key !== 'ui_language') return;
  setLocale(event.newValue);
  textInput.placeholder = t('输入文字，Ctrl+Enter 确认');
  if (!toolbar && image && !counting && !completing) { renderBar(); paint(); }
  if (!recording) renderOcr();
});
