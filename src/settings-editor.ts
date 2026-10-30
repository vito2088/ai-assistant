import { invoke } from '@tauri-apps/api/core';
import { t, h } from './i18n';
import { confirm } from './app-dialog';

export type SettingsDocument = { path: string; content: string; defaults: string; error: string | null };

export async function openSettingsEditor(onSaved: () => Promise<void>) {
  if (document.querySelector('.json-settings-dialog')) return;
  const file = await invoke<SettingsDocument>('read_settings_file');
  if (document.querySelector('.json-settings-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'json-settings-dialog';
  dialog.setAttribute('aria-labelledby', 'json-settings-title');
  dialog.innerHTML = `<header><strong id="json-settings-title">settings.json</strong><button type="button" data-json-close>${h('关闭')}</button></header><p class="json-path"></p><p>${h('保存前校验 JSON 语法、字段类型和配置值。')}</p><textarea spellcheck="false" aria-label="${h('JSON 设置内容')}"></textarea><p class="json-validation" role="status" aria-live="polite"></p><details><summary>${h('查看默认配置')}</summary><pre></pre></details><footer><button type="button" data-json-format>${h('格式化')}</button><button type="button" data-json-save class="primary" disabled>${h('校验并保存')}</button></footer>`;
  dialog.querySelector('.json-path')!.textContent = file.path;
  dialog.querySelector('pre')!.textContent = file.defaults;
  const input = dialog.querySelector('textarea')!;
  const status = dialog.querySelector<HTMLElement>('.json-validation')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-json-save]')!;
  input.value = file.content;
  let expected = file.content, revision = 0, valid = false, saving = false, closing = false, timer: number | undefined;
  function report(error: unknown) { status.textContent = String(error); status.classList.add('invalid'); }
  async function validate() {
    const version = ++revision;
    valid = false; save.disabled = true;
    status.textContent = t('正在校验…'); status.classList.remove('invalid');
    try {
      await invoke('validate_settings_json', { content: input.value });
      if (version !== revision || !dialog.isConnected) return;
      valid = true; save.disabled = saving;
      status.textContent = t('配置格式正确，可以保存');
    } catch (error) { if (version === revision) report(error); }
  }
  input.addEventListener('input', () => {
    ++revision; valid = false; save.disabled = true; clearTimeout(timer);
    timer = window.setTimeout(() => { void validate(); }, 250);
  });
  async function close() {
    if (saving || closing) return;
    closing = true;
    try {
      if (input.value !== expected && !await confirm(t('JSON 修改尚未保存，确定关闭吗？'), { kind: 'warning', okLabel: t('放弃修改'), destructive: true })) return;
      ++revision; clearTimeout(timer); dialog.close(); dialog.remove();
    } finally { closing = false; }
  }
  dialog.querySelector('[data-json-close]')!.addEventListener('click', () => { void close(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  dialog.querySelector('[data-json-format]')!.addEventListener('click', () => {
    if (saving) return;
    try { input.value = JSON.stringify(JSON.parse(input.value), null, 2) + '\n'; void validate(); } catch (error) { valid = false; save.disabled = true; report(error); }
  });
  async function persist() {
    if (!valid || saving) return;
    saving = true; input.readOnly = true; save.disabled = true;
    try {
      expected = await invoke<string>('save_settings_json', { content: input.value, expected });
      input.value = expected;
      status.classList.remove('invalid'); status.textContent = t('JSON 设置已保存');
      await onSaved();
    } catch (error) { report(error); }
    finally { saving = false; input.readOnly = false; save.disabled = !valid; }
  }
  save.addEventListener('click', () => { void persist(); });
  dialog.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void persist(); } });
  document.body.append(dialog); dialog.showModal(); input.focus(); void validate();
}
