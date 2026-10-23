import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './capture-overlay.css';
import { captureIcon } from './capture-icons';

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
let completing = false, counting = false, countdownToken = 0, toolbar = false;
let image: ImageBitmap;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
const border = document.createElement('div'); border.className = 'selection';
const bar = document.createElement('div'); bar.className = 'capture-actions';
const hint = document.createElement('div'); hint.className = 'capture-hint';
const textInput = document.createElement('textarea'); textInput.className = 'annotation-text'; textInput.placeholder = '输入文字，Ctrl+Enter 确认'; textInput.hidden = true;
let textPoint: Point | null = null;
root.append(canvas, border, bar, hint, textInput);
const names: [Kind, string, string][] = [['select', '选区 (V)', '⌖'], ['pen', '画笔 (P)', '✎'], ['arrow', '箭头 (A)', '↗'], ['rectangle', '矩形 (R)', '□'], ['ellipse', '椭圆 (O)', '○'], ['text', '文字 (T)', 'T'], ['mosaic', '马赛克 (M)', '▦'], ['step', '序号 (N)', '①']];
function button(action: string, label: string, text = label, extra = '') {
  const attrs = extra.includes('class="') ? extra.replace('class="', 'class="capture-icon-button ') : `class="capture-icon-button" ${extra}`;
  const icon = action === 'done' && recording ? 'play' : action === 'pause' && text === '继续' ? 'play' : action;
  return `<button type="button" data-do="${action}" title="${label}" aria-label="${label}" ${names.some(([kind]) => kind === action) ? `aria-pressed="${tool === action}"` : ''} ${attrs}>${captureIcon(icon)}</button>`;
}
function renderBar() {
  if (toolbar) return;
  bar.innerHTML = `${button('full', '全屏', '全屏')}${button('last', '上次选区', '上次')}${recording ? '' : names.map(([kind, label, icon]) => button(kind, label, icon, `class="${tool === kind ? 'active' : ''}"`)).join('')}${recording ? '' : '<span class="separator"></span><input id="color" type="color" aria-label="标注颜色" value="' + color + '"><select id="width" aria-label="线条粗细"><option value="2">细</option><option value="4">中</option><option value="8">粗</option></select>' + button('undo', '撤销 Ctrl+Z', '↶', marks.length ? '' : 'disabled') + button('redo', '重做 Ctrl+Shift+Z', '↷', redo.length ? '' : 'disabled') + button('pin', '固定到桌面', '固定', region ? '' : 'disabled') + button('copy', '复制图片 Ctrl+C', '复制')}${button('cancel', '取消 Esc', '取消')}${button('done', recording ? '倒计时后开始录制' : '完成标注并保存 Enter', recording ? '开始录制' : '完成', `class="primary" ${region ? '' : 'disabled'}`)}`;
  const width = bar.querySelector<HTMLSelectElement>('#width'); if (width) width.value = String(thickness);
  positionBar();
}
function scale() { return { x: canvas.width / innerWidth, y: canvas.height / innerHeight }; }
function point(e: PointerEvent): Point { const s = scale(); return { x: Math.max(0, Math.min(canvas.width, e.clientX * s.x)), y: Math.max(0, Math.min(canvas.height, e.clientY * s.y)) }; }
function rect(a: Point, b: Point): Rect { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; }
function inside(p: Point, r: Rect) { return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height; }
function positionBar() {
  const s = scale();
  const left = region ? region.x / s.x : (innerWidth - bar.offsetWidth) / 2;
  const bottom = region ? (region.y + region.height) / s.y : 70;
  bar.style.left = `${Math.max(8, Math.min(innerWidth - bar.offsetWidth - 8, left))}px`;
  bar.style.top = `${Math.max(8, bottom + bar.offsetHeight + 16 < innerHeight ? bottom + 10 : (region ? region.y / s.y - bar.offsetHeight - 10 : 70))}px`;
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
  hint.textContent = recording ? '框选录制区域 · 拖动内部移动，边缘调整 · Enter 开始 · Esc 取消' : '拖动框选 · V 调整选区 · Ctrl+Z 撤销 · Enter 完成 · Esc 取消';
  positionBar();
}
function commitText() {
  if (textPoint && textInput.value.trim()) { marks.push({ kind: 'text', points: [textPoint], color, width: thickness, text: textInput.value }); redo = []; }
  textInput.hidden = true; textInput.value = ''; textPoint = null;
}
root.addEventListener('pointerdown', e => {
  if (!image || toolbar || counting || completing || (e.target as HTMLElement).closest('.capture-actions,.annotation-text,.capture-hint')) return;
  if (e.button !== 0) return;
  commitText(); const p = point(e); const target = e.target as HTMLElement;
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
function release() {
  drag = null; if (draft) { marks.push(draft); redo = []; draft = null; }
  if (region && (region.width < 2 || region.height < 2)) region = null;
  renderBar(); paint();
}
root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);
async function png(): Promise<Blob> {
  commitText(); if (!region) throw new Error('请先框选区域'); paint(true);
  const output = document.createElement('canvas'); output.width = Math.round(region.width); output.height = Math.round(region.height);
  output.getContext('2d')!.drawImage(canvas, Math.round(region.x), Math.round(region.y), output.width, output.height, 0, 0, output.width, output.height); paint();
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('生成图片失败')), 'image/png'));
}
async function done(pin = false) {
  if (!region || completing || counting) return;
  commitText();
  localStorage.setItem(`capture-region-${canvas.width}x${canvas.height}`, JSON.stringify(region));
  if (recording) {
    counting = true; const token = ++countdownToken; bar.hidden = true; border.hidden = true;
    const counter = document.createElement('div'); counter.className = 'countdown'; root.append(counter);
    for (let n = Number(query.get('countdown') ?? 3); n > 0; n--) {
      counter.textContent = `${n}`; hint.textContent = '准备录制 · Esc 返回选区'; await new Promise(r => setTimeout(r, 1000));
      if (token !== countdownToken) { counter.remove(); return; }
    }
    counter.remove(); completing = true;
    await getCurrentWindow().hide();
    await emit('capture-selected', { region: { x: Math.floor(region.x), y: Math.floor(region.y), width: Math.floor(region.width) & ~1, height: Math.floor(region.height) & ~1 } });
  } else {
    completing = true;
    hint.textContent = '正在生成截图…';
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
  if (a === 'cancel') { await emit('capture-cancel'); return; }
  if (a === 'done') { await done(); return; }
  if (a === 'pin' && !recording) { await done(true); return; }
  if (a === 'copy') { const blob = await png(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); hint.textContent = '图片已复制，可以继续编辑或完成保存'; return; }
  if (a === 'stop') { await emit('tools-stop-recording'); return; }
  if (a === 'pause') { await emit('capture-pause'); return; }
  if (a === 'full') region = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (a === 'last') { const saved = localStorage.getItem(`capture-region-${canvas.width}x${canvas.height}`); if (saved) region = JSON.parse(saved); }
  if (a === 'undo' && marks.length) redo.push(marks.pop()!);
  if (a === 'redo' && redo.length) marks.push(redo.pop()!);
  if (names.some(([k]) => k === a)) tool = a as Kind;
  renderBar(); paint();
}
root.addEventListener('click', e => { const a = (e.target as HTMLElement).closest<HTMLElement>('[data-do]')?.dataset.do; if (a) void action(a).catch(error => { hint.textContent = String(error); }); });
bar.addEventListener('change', e => { const el = e.target as HTMLInputElement; if (el.id === 'color') color = el.value; if (el.id === 'width') thickness = Number(el.value); });
document.addEventListener('keydown', e => {
  if (toolbar) { if (e.key === 'Escape') void emit('tools-stop-recording'); return; }
  if (e.target === textInput) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitText(); renderBar(); paint(); } return; }
  let a = '';
  if (e.key === 'Escape') {
    if (counting && !completing) { ++countdownToken; counting = false; bar.hidden = false; paint(); return; }
    a = 'cancel';
  }
  if (e.key === 'Enter') a = 'done';
  if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') a = e.shiftKey ? 'redo' : 'undo'; if (e.key.toLowerCase() === 'c') a = 'copy'; if (e.key.toLowerCase() === 'y') a = 'redo'; }
  else if (!recording) a = ({v:'select',p:'pen',a:'arrow',r:'rectangle',o:'ellipse',t:'text',m:'mosaic',n:'step'} as Record<string,string>)[e.key.toLowerCase()] ?? a;
  if (a) { e.preventDefault(); void action(a).catch(error => { hint.textContent = String(error); }); }
});
window.addEventListener('resize', () => { if (!toolbar && image) paint(); });
let startedAt = 0, paused = false, frozen = '00:00';
void listen<{active: boolean; paused: boolean; startedAt: number}>('tools-recording', async ({payload}) => {
  if (!recording || !payload.active) return;
  startedAt = payload.startedAt; paused = payload.paused;
  if (!toolbar) { toolbar = true; document.body.classList.add('recording-mode'); image.close(); canvas.remove(); border.remove(); textInput.remove(); hint.remove(); root.className = 'record-toolbar'; bar.className = 'record-controls'; bar.hidden = false; bar.removeAttribute('style'); await invoke('capture_toolbar'); }
  bar.innerHTML = `<span data-tauri-drag-region class="record-drag" title="拖动控制条">${captureIcon('drag')}</span><span class="red-dot ${paused ? 'paused' : ''}"></span><time id="record-clock" aria-label="录制时长">${frozen}</time><span class="separator"></span>${button('pause', paused ? '继续录制' : '暂停录制', paused ? '继续' : '暂停')}${button('stop', '结束录制并预览', '结束', 'class="primary"')}`;
});
setInterval(() => {
  if (!toolbar || paused) return; const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000)); frozen = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  const clock = document.querySelector('#record-clock'); if (clock) clock.textContent = frozen;
}, 500);
async function initialize() {
  hint.textContent = '正在准备屏幕画面…';
  const bytes = await invoke<ArrayBuffer>('read_capture_draft', {path}); image = await createImageBitmap(new Blob([bytes], {type:'image/png'}));
  canvas.width = image.width; canvas.height = image.height; renderBar(); paint();
}
void initialize().catch(error => { hint.textContent = `打开截图失败：${error}，按 Esc 取消`; });
