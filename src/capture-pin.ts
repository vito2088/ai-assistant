import { t, setLocale } from './i18n';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import './capture-pin.css';
import { captureIcon } from './capture-icons';

const windowRef = getCurrentWindow();
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const picture = document.querySelector<HTMLImageElement>('#image')!;
const pinButton = document.querySelector<HTMLButtonElement>('#pin')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
let blob: Blob | null = null, url = '', pinned = true, busy = false;
pinButton.innerHTML = captureIcon('pin');
saveButton.innerHTML = captureIcon('save');
document.querySelector('#close')!.innerHTML = captureIcon('cancel');
document.querySelectorAll('nav button').forEach(button => button.classList.add('capture-icon-button'));
function updatePinLabel() { const label = pinned ? t("取消置顶") : t("固定置顶"); pinButton.title = label; pinButton.setAttribute('aria-label', label); }
updatePinLabel();
function report(error: unknown) { status.hidden = false; status.textContent = String(error); }
async function close() { if (!busy) await invoke('close_pinned_capture'); }
document.querySelector('#close')!.addEventListener('click', () => { void close().catch(report); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') void close().catch(report); });
picture.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); void windowRef.startDragging().catch(report); } });
picture.addEventListener('contextmenu', e => e.preventDefault());
pinButton.addEventListener('click', () => {
  void (async () => {
    pinButton.disabled = true;
    try { await windowRef.setAlwaysOnTop(!pinned); pinned = !pinned; updatePinLabel(); pinButton.setAttribute('aria-pressed', String(pinned)); }
    finally { pinButton.disabled = false; }
  })().catch(report);
});
saveButton.addEventListener('click', () => {
  if (!blob || busy) return;
  void (async () => {
    busy = true; saveButton.disabled = true;
    try {
      const saved = await invoke<string | null>('get_setting', { key: 'capture_preferences' });
      const directory = saved ? JSON.parse(saved).screenshotDirectory : '';
      const name = t("截图-{0}.png", [new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')]);
      let path = await save({ title: t("保存贴图"), defaultPath: directory ? await join(directory, name) : name, filters: [{ name: 'PNG', extensions: ['png'] }] });
      if (!path) return;
      if (!/\.[^\\/.]+$/.test(path)) path += '.png';
      const id = await invoke<string>('begin_tool_export', { path });
      try {
        for (let i = 0; i < blob!.size; i += 1024 * 1024) await invoke('append_tool_export', new Uint8Array(await blob!.slice(i, i + 1024 * 1024).arrayBuffer()), { headers: { 'x-export-id': id } });
        await invoke('finish_tool_export', { id, discard: false });
      } catch (error) { await invoke('finish_tool_export', { id, discard: true }).catch(() => {}); throw error; }
      status.hidden = false; status.textContent = t("已保存"); setTimeout(() => { status.hidden = true; }, 2500);
    } finally { busy = false; saveButton.disabled = false; }
  })().catch(report);
});
async function initialize() {
  setLocale(await invoke<string | null>('get_setting', { key: 'ui_language' }));
  localizeLabels();
  const path = new URLSearchParams(location.search).get('path');
  const bytes = await invoke<ArrayBuffer>('read_capture_draft', { path });
  blob = new Blob([bytes], { type: 'image/png' }); url = URL.createObjectURL(blob); picture.src = url;
  await picture.decode(); status.hidden = true;
}
window.addEventListener('beforeunload', () => { if (url) URL.revokeObjectURL(url); });
void initialize().catch(report);

function localizeLabels() {
  document.title = t('截图贴图');
  picture.alt = t('固定到桌面的截图');
  document.querySelector('nav')!.setAttribute('aria-label', t('贴图操作'));
  for (const [selector, key] of [['#save', '另存截图'], ['#close', '关闭贴图 Esc']]) {
    const button = document.querySelector<HTMLButtonElement>(selector)!;
    button.title = t(key); button.setAttribute('aria-label', t(key));
  }
  if (!blob) status.textContent = t('正在加载截图…');
  updatePinLabel();
}
window.addEventListener('storage', event => {
  if (event.key === 'ui_language') { setLocale(event.newValue); localizeLabels(); }
});
