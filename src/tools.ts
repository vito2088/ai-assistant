import { t, h, getLocale } from './i18n';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open } from '@tauri-apps/plugin-dialog';
import { confirm } from './app-dialog';
import { join } from '@tauri-apps/api/path';
import { calculate } from './calculator';
import { TimeTools } from './time-tools';
import { captureIcon } from './capture-icons';
import { register, unregister, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { CaptureShortcuts, captureKinds, shortcutFromEvent, shortcutLabel, type CaptureKind } from './capture-shortcuts';
import './capture-controls.css';
import './capture-ui.css';
import { NativeCaptureBridge, type NativeFinished } from './native-capture-bridge';

type Section = 'calculator' | 'screenshot' | 'recording' | 'reminder';
type Display = { id: number; name: string; width: number; height: number };
type Status = { active: boolean; startedAt: number; path: string; error: string | null; paused?: boolean };
type Draft = { path: string; bytes: number; modified: number };
type Preferences = { screenshotDirectory: string; recordingDirectory: string; countdown: number; fps: number; cursor: boolean; autoOcr: boolean; autoTranslate: boolean };
const labels: Record<Section, string> = { calculator: '计算器', screenshot: '截图', recording: '录屏', reminder: '提醒' };
const icons: Record<Section, string> = {
  reminder: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  calculator: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8 6h8M8 10h1m6 0h1M8 14h1m6 0h1M8 18h1m6 0h1"/>',
  screenshot: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4"/><rect x="7" y="7" width="10" height="10" rx="2"/>',
  recording: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/><circle cx="9.5" cy="12" r="2"/>',
};
const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const message = (error: unknown) => t(error instanceof Error ? error.message : String(error));
const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export class Tools {
  section: Section | null = null;
  private visibleSections: Section[] = ['screenshot', 'recording', 'calculator', 'reminder'];
  private timeTools = new TimeTools(() => this.changed(), text => this.toast(t(text)));

  setVisibleSections(sections: readonly string[]) {
    this.visibleSections = sections.filter((section): section is Section => Object.hasOwn(icons, section));
    if (this.section && !this.visibleSections.includes(this.section)) this.showHome();
  }
  private native: boolean | null = null;
  private nativeSessionId: string | null = null;
  private nativeStop: Promise<void> | null = null;
  private finishNativeStop: (() => void) | null = null;
  private nativeBridge = new NativeCaptureBridge({
    started: event => { this.nativeSessionId = event.id; this.busy = !this.recording; this.error = ''; this.changed(); },
    finished: event => { void this.nativeFinished(event).catch(error => this.report(error)); },
    error: text => this.report(text),
    shortcut: (kind, key) => {
      const input = document.activeElement as HTMLInputElement | null;
      if (input?.matches('[data-shortcut-input]') && input.dataset.shortcutInput === kind) this.setShortcutInput(input, key);
    },
  });
  private displays: Display[] = [];
  private displayId = 0;
  private hideHelper = true;
  private helperBeforeCapture: {visible:boolean;minimized:boolean;focused:boolean} | null = null;
  private busy = false;
  private error = '';
  private expression = '';
  private result = '0';
  private calculationError = '';
  private history: { expression: string; result: string }[] = [];
  private screenshotUrl = '';
  private screenshotPath = '';
  private status: Status = { active: false, startedAt: 0, path: '', error: null };
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private stopPromise: Promise<void> | null = null;
  private timer: number | undefined;
  private nativePollBusy = false;
  private preferences: Preferences = { screenshotDirectory: '', recordingDirectory: '', countdown: 3, fps: 30, cursor: true, autoOcr: false, autoTranslate: false };
  private drafts: Draft[] = [];
  private overlaySource = '';
  private savingDraft = false;
  private pausedTime = '';
  private lastSavedRecording = '';
  private previewDraft = '';
  private shortcutsReady = false;
  private shortcuts = new CaptureShortcuts({
    reset: () => this.native ? invoke('sync_native_capture_shortcuts') : unregisterAll(),
    register: (key, handler, kind) => this.native ? invoke('register_native_capture_shortcut', {kind, key}) : register(key, event => { if (event.state === 'Released') handler(); }),
    unregister: key => this.native ? invoke('unregister_native_capture_shortcut', {key}) : unregister(key),
    save: values => invoke('set_setting', { key: 'capture_shortcuts', value: JSON.stringify(values) }),
  }, (kind, key) => {
    // A registered combination may be intercepted by the OS while editing.
    const editor = document.activeElement as HTMLInputElement | null;
    if (editor?.matches('[data-shortcut-input]')) { this.setShortcutInput(editor, key); return; }
    void this.runShortcut(kind).catch(error => this.report(error));
  });
  constructor(private changed: () => void, private toast: (text: string) => void, private aiScreenshot: (path: string) => string = () => '') {}
  get recording() { return this.status.active; }
  get backendNative() { return this.native; }

  async reloadSettings() {
    if (this.busy || this.recording || this.savingDraft || this.shortcuts.busy) return false;
    const [preferences, shortcuts] = await Promise.all([
      invoke<string | null>('get_setting', { key: 'capture_preferences' }),
      invoke<string | null>('get_setting', { key: 'capture_shortcuts' }),
    ]);
    this.preferences = { screenshotDirectory: '', recordingDirectory: '', countdown: 3, fps: 30, cursor: true, autoOcr: false, autoTranslate: false, ...JSON.parse(preferences ?? '{}') };
    await this.shortcuts.initialize(shortcuts);
    this.shortcutsReady = true;
    return true;
  }

  async initialize() {
    try { await this.timeTools.initialize(); } catch (error) { this.toast(message(error)); }
    try {
      const saved = await invoke<string | null>('get_setting', { key: 'capture_preferences' });
      if (saved) this.preferences = { ...this.preferences, ...JSON.parse(saved) };
      await this.refreshDrafts();
    } catch (error) { this.toast(t("读取捕获设置失败：{0}", [message(error)])); }
    await listen<{path: string; pinned?: boolean}>('capture-finished', event => { void this.finishScreenshot(event.payload.path, event.payload.pinned).catch(error => this.report(error)); });
    await listen('capture-copied', () => { void this.completeCopiedCapture().catch(error=>this.report(error)); });
    await listen('capture-cancel', () => { void this.cancelOverlay().catch(error => this.report(error)); });
    await listen('capture-pause', () => { void this.pauseRecording().catch(error => this.report(error)); });
    await listen('tools-request-quit', () => {
      void this.beforeQuit().then(() => invoke('quit_app')).catch(error => this.toast(message(error)));
    });
    try {
      this.native = await invoke<boolean>('native_capture_available');
      if (this.native) await this.nativeBridge.initialize();
      const [displays, status] = await Promise.all([
        invoke<Display[]>('tool_displays'), invoke<Status>('screen_recording_status'),
      ]);
      this.displays = displays;
      this.displayId = displays[0]?.id ?? 0;
      this.setStatus(status);
      if (this.native) {
        const runtime = await invoke<{displayId: number; hideHelper: boolean}>('native_capture_runtime');
        if (displays.some(display => display.id === runtime.displayId)) this.displayId = runtime.displayId;
        this.hideHelper = runtime.hideHelper;
        const active = await invoke<{active: boolean; id?: string}>('native_capture_status');
        this.nativeSessionId = active.id ?? null; await this.nativeBridge.adopt(this.nativeSessionId);
        this.busy = active.active && !this.recording;
      }
      await listen<Status>('tools-recording', event => { if (this.native) this.setStatus(event.payload); });
      await listen('tools-stop-recording', () => { if (this.recording) void this.stopRecording(); });
    } catch (error) { this.error = message(error); }
    try {
      await this.shortcuts.initialize(await invoke<string | null>('get_setting', { key: 'capture_shortcuts' }));
      this.shortcutsReady = true;
      if (Object.keys(this.shortcuts.errors).length) this.toast(t("部分捕获快捷键未生效，请到设置中查看具体原因"));
    } catch (error) { this.toast(t("初始化快捷键失败：{0}", [message(error)])); }
    this.changed();
  }

  private async runShortcut(kind: CaptureKind) {
    if (this.busy || this.savingDraft || !this.shortcutsReady) return;
    if (kind === 'recording' && this.recording) { await this.stopRecording(); return; }
    if (!this.visibleSections.includes(kind)) { this.toast(t("请先在设置中显示此功能")); return; }
    if (kind === 'screenshot') await this.screenshot();
    else await this.startRecording();
    if (this.error) this.toast(this.error);
  }

  shortcutSettingsView() {
    return `<div class="capture-settings"><strong>${h("截图与录屏快捷键")}</strong><p class="tool-hint">${h("应用运行时全局生效。录屏快捷键再次按下可停止录制。点击输入框并按组合键，再保存；Esc 撤销修改。")}</p>${captureKinds.map(kind => `<label class="tool-field">${h("{0}快捷键", [t(labels[kind])])}<div class="capture-directory"><input readonly data-shortcut-input="${kind}" data-shortcut="${esc(this.shortcuts.values[kind])}" aria-label="${h("{0}快捷键", [t(labels[kind])])}" value="${esc(shortcutLabel(this.shortcuts.values[kind]))}" placeholder="${h("未启用，点击后按组合键")}" ${!this.shortcutsReady || this.shortcuts.busy ? 'disabled' : ''}><button type="button" class="capture-icon-button" data-action="tool-shortcut-save" data-kind="${kind}" title="${h("保存快捷键")}" aria-label="${h("保存{0}快捷键", [t(labels[kind])])}" ${!this.shortcutsReady || this.shortcuts.busy ? 'disabled' : ''}>${captureIcon('save')}</button><button type="button" class="capture-icon-button" data-action="tool-shortcut-disable" data-kind="${kind}" title="${h("停用快捷键")}" aria-label="${h("停用{0}快捷键", [t(labels[kind])])}" ${!this.shortcutsReady || this.shortcuts.busy || !this.shortcuts.values[kind] ? 'disabled' : ''}>${captureIcon('clear')}</button></div>${this.shortcuts.errors[kind] ? `<span class="tool-error" role="alert">${esc(this.shortcuts.errors[kind]!)}</span>` : ''}</label>`).join('')}<p class="tool-hint">${h("组合键需包含 Ctrl、Alt 或 Win/⌘，可再加 Shift。支持字母、数字、F1–F24、方向键等。")}</p></div>`;
  }

  private setShortcutInput(input: HTMLInputElement, key: string) {
    input.dataset.shortcut = key;
    input.value = shortcutLabel(key);
  }

  view() {
    if (!this.section) return `<div class="tools-page"><section class="tools-content"><div class="tool-launchers" aria-label="${h("常用工具")}">${this.visibleSections.map(section => `<button class="tool-launcher" data-action="tool-open" data-section="${section}"><span class="tool-launcher-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[section]}</svg>${section === 'recording' && this.recording ? '<span class="recording-dot"></span>' : ''}</span><span>${h(labels[section])}</span></button>`).join('')}</div>${this.recording ? `<div class="tool-recording-banner"><span><span class="recording-dot"></span>${h("正在录屏")} <time class="recording-time">${this.elapsed()}</time></span><button data-action="tool-stop-recording" ${this.busy ? 'disabled' : ''}>${this.busy ? t("保存中…") : t("停止并保存")}</button></div>` : ''}</section></div>`;
    return `<div class="tools-page"><div class="tool-backbar"><button data-action="tool-home" aria-label="${h("返回工具列表")}">${h("‹ 工具")}</button><span>${h(labels[this.section])}</span></div><section class="tools-content">${this.section === 'reminder' ? this.timeTools.view() : this.section === 'calculator' ? this.calculatorView() : this.captureView()}</section></div>`;
  }

  afterRender() { this.timeTools.afterRender(); }

  showHome() { this.timeTools.close(); this.section = null; this.error = ''; }

  settingsView(kind?: CaptureKind) {
    const translateSetting = `<div class="capture-auto-ocr"><div><strong>${h('截图后自动显示译文')} <span class="settings-ai-badge" title="${h('需要 AI 模型')}">AI</span></strong><p class="tool-hint">${h('开启后自动翻译并显示译文，不会连带打开识别原文；关闭后可点击工具栏的「翻译」。仅发送识别文字，中文译英文、英文译中文，需启用 AI 并选中模型。')}</p></div><label class="switch"><input type="checkbox" id="capture-auto-translate" aria-label="${h('截图后自动显示译文')}" ${this.preferences.autoTranslate ? 'checked' : ''}><span></span></label></div>`;
    const ocrSetting = `<div class="capture-auto-ocr"><div><strong>${h('截图后自动显示识别文字')}</strong><p class="tool-hint">${h('开启后自动显示识别原文，可在面板内点击「翻译」。关闭后，通过工具栏的「识别文字」手动打开。')}</p></div><label class="switch"><input type="checkbox" id="capture-auto-ocr" aria-label="${h('截图后自动显示识别文字')}" ${this.preferences.autoOcr ? 'checked' : ''}><span></span></label></div>`;
    const directory = (kind: CaptureKind) => `<label class="tool-field">${h("{0}默认保存目录", [kind === 'screenshot' ? t("截图") : t("录屏")])}<div class="capture-directory"><input readonly aria-label="${h("{0}默认保存目录", [kind === 'screenshot' ? t("截图") : t("录屏")])}" value="${esc(this.preferences[`${kind}Directory`])}" title="${esc(this.preferences[`${kind}Directory`] || t("每次选择保存位置"))}" placeholder="${h("每次选择保存位置")}"><button class="capture-icon-button directory-browse" data-action="tool-directory" data-kind="${kind}" title="${h("选择保存目录")}" aria-label="${h("选择保存目录")}">${captureIcon('folder')}</button><button class="capture-icon-button" data-action="tool-directory-clear" data-kind="${kind}" title="${h("恢复系统默认目录")}" aria-label="${h("恢复系统默认目录")}" ${this.preferences[`${kind}Directory`] ? '' : 'disabled'}>${captureIcon('clear')}</button></div></label>`;
    const screenshot = `<section class="capture-settings" id="capture-settings-screenshot" tabindex="-1" aria-labelledby="screenshot-settings-title"><strong id="screenshot-settings-title">${h("截图设置")}</strong><p class="tool-hint">${h("完成后再选择保存位置；取消保存会保留在待保存列表。")}</p>${directory('screenshot')}${ocrSetting}${translateSetting}</section>`;
    const recording = `<section class="capture-settings" id="capture-settings-recording" tabindex="-1" aria-labelledby="recording-settings-title"><strong id="recording-settings-title">${h("录屏设置")}</strong><p class="tool-hint">${h("完成后再选择保存位置；取消保存会保留在待保存列表。")}</p>${directory('recording')}<div class="capture-settings-row"><label class="tool-field">${h("录屏倒计时")}<select id="capture-countdown">${[0,3,5,10].map(n => `<option value="${n}" ${this.preferences.countdown === n ? 'selected' : ''}>${n === 0 ? t("关闭") : t("{0} 秒", [n])}</option>`).join('')}</select></label><label class="tool-field">${h("录屏帧率")}<select id="capture-fps">${[15,30,60].map(n => `<option value="${n}" ${this.preferences.fps === n ? 'selected' : ''}>${n} FPS</option>`).join('')}</select></label></div><label class="tool-checkbox"><input type="checkbox" id="capture-cursor" ${this.preferences.cursor ? 'checked' : ''}>${h("录屏显示鼠标指针（Windows）")}</label></section>`;
    return kind === 'screenshot' ? screenshot : kind === 'recording' ? recording : screenshot + recording;
  }

  private report(error: unknown) { this.error = message(error); this.toast(this.error); this.changed(); }
  private async refreshDrafts() { this.drafts = await invoke<Draft[]>('list_capture_drafts'); this.changed(); }
  private draftView(kind: CaptureKind) {
    const items = this.drafts.filter(d => (d.path.endsWith('.png') ? 'screenshot' : 'recording') === kind && d.path !== this.overlaySource && !(this.recording && d.path === this.status.path));
    return items.length ? `<div class="capture-drafts"><strong>${h("待保存 ·")} ${items.length}</strong><p class="tool-hint">${h("先预览，再另存。未保存的结果下次打开仍可找回。")}</p>${items.map((d, index) => {
      const expanded = this.previewDraft === d.path;
      const previewId = `capture-draft-preview-${index}`;
      const preview = expanded ? `<div class="capture-result" id="${previewId}">${d.path.endsWith('.png') ? `<img src="${convertFileSrc(d.path)}" alt="${h("待保存截图")}">` : `<video controls preload="metadata" src="${convertFileSrc(d.path)}" aria-label="${h("录屏预览")}"></video>`}</div>${d.path.endsWith('.png') ? this.aiScreenshot(d.path) : ''}` : '';
      return `<div class="capture-draft-item"><div class="capture-draft"><div><span>${d.path.endsWith('.png') ? t("截图") : t("录屏")} · ${new Date(d.modified * 1000).toLocaleString(getLocale())}</span><small>${(d.bytes / 1024 / 1024).toFixed(1)} MB</small></div><button class="capture-icon-button" title="${expanded ? t("收起详情") : t("查看详情")}" aria-label="${expanded ? t("收起详情") : t("查看详情")}" aria-expanded="${expanded}" ${expanded ? `aria-controls="${previewId}"` : ''} data-action="tool-preview-draft" data-path="${esc(d.path)}">${captureIcon('preview')}</button><button class="capture-icon-button" title="${h("另存")}" aria-label="${h("另存")}" data-action="tool-save-draft" data-path="${esc(d.path)}" ${this.savingDraft ? 'disabled' : ''}>${captureIcon('save')}</button><button class="capture-icon-button danger" title="${h("删除草稿")}" aria-label="${h("删除草稿")}" data-action="tool-delete-draft" data-path="${esc(d.path)}" ${this.savingDraft ? 'disabled' : ''}>${captureIcon('delete')}</button></div>${preview}</div>`;
    }).join('')}</div>` : '';
  }

  private calculatorView() {
    const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='];
    return `<div class="calculator"><label class="calculator-display"><span>${h("输入算式")}</span><input id="calculator-expression" aria-label="${h("计算算式")}" maxlength="256" autocomplete="off" inputmode="decimal" value="${esc(this.expression)}" placeholder="0" /><output aria-live="polite">${esc(this.result)}</output></label>${this.calculationError ? `<p class="tool-error" role="alert">${esc(this.calculationError)}</p>` : ''}<div class="calculator-keys">${keys.map(key => `<button data-action="tool-calc" data-key="${key}" class="${key === '=' ? 'equals' : ['÷', '×', '−', '+', '%'].includes(key) ? 'operator' : ''}" aria-label="${key === '⌫' ? t("退格") : key === 'C' ? t("清空") : key === '±' ? t("切换正负") : key}">${key}</button>`).join('')}</div><p class="tool-hint">${h("支持括号、百分比；按 Enter 计算，Esc 清空。")}</p>${this.history.length ? `<div class="calculator-history" aria-label="${h("计算历史")}">${this.history.map((item, index) => `<button data-action="tool-history" data-index="${index}"><span>${esc(item.expression)}</span><strong>= ${esc(item.result)}</strong></button>`).join('')}</div>` : ''}</div>`;
  }

  private captureView() {
    const screenshot = this.section === 'screenshot';
    const disabled = this.busy || this.native === null || this.recording;
    const saved = screenshot ? this.screenshotPath : this.lastSavedRecording;
    const key = this.shortcuts.values[screenshot ? 'screenshot' : 'recording'];
    const select = this.native ? `<label class="tool-field">${h("显示器")}<select id="tool-display" ${disabled ? 'disabled' : ''}>${this.displays.map(d => `<option value="${d.id}" ${this.displayId === d.id ? 'selected' : ''}>${esc(d.name)} · ${d.width} × ${d.height}</option>`).join('')}</select></label>` : `<p class="tool-hint">${this.native === null ? t("正在读取屏幕信息…") : t("当前平台通过系统选择屏幕或窗口。区域录屏和桌面悬浮控制条暂限 Windows。")}</p>`;
    const launchLabel = this.busy ? t("正在捕获…") : screenshot ? t("开始截图") : t("选择录制区域");
    const settingsButton = `<button type="button" class="capture-icon-button capture-settings-button" data-action="capture-settings" data-kind="${screenshot ? 'screenshot' : 'recording'}" title="${screenshot ? h('截图设置') : h('录屏设置')}" aria-label="${screenshot ? h('截图设置') : h('录屏设置')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 3-.6 2.4-1.8 1-2.4-.6-2 3.4 1.8 1.8v2l-1.8 1.8 2 3.4 2.4-.6 1.8 1L10 21h4l.6-2.4 1.8-1 2.4.6 2-3.4-1.8-1.8v-2l1.8-1.8-2-3.4-2.4.6-1.8-1L14 3Z"/><circle cx="12" cy="12" r="3"/></svg></button>`;
    const setup = `<section class="capture-setup"><p class="tool-description">${screenshot ? t("桌面框选 → 标注 → 完成后保存") : t("选择区域 → 倒计时 → 录制 → 完成后保存")}</p>${select}<label class="tool-checkbox"><input id="tool-hide-helper" type="checkbox" ${this.hideHelper ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${h("捕获时暂时隐藏小助手")}</label>${!screenshot ? `<div class="capture-meta"><span>${captureIcon('last')}${h("{0} 秒倒计时", [this.preferences.countdown])}</span><span>${this.preferences.fps} FPS</span><span>${h("无声录制")}</span></div>` : ''}<div class="capture-launch-row"><div class="capture-launch-controls"><button type="button" class="capture-launch" data-action="${screenshot ? 'tool-screenshot' : 'tool-start-recording'}" ${disabled ? 'disabled' : ''}>${captureIcon(screenshot ? 'full' : 'play')}<span>${launchLabel}</span></button>${settingsButton}</div>${key ? `<kbd>${esc(shortcutLabel(key))}</kbd>` : ''}</div></section>`;
    const live = `<section class="capture-live ${this.status.paused ? 'is-paused' : ''}" aria-label="${h('正在录屏')}"><div class="capture-live-summary"><span class="capture-live-icon">${captureIcon(this.status.paused ? 'pause' : 'stop')}</span><div><span class="capture-live-state"><i class="recording-dot"></i>${this.status.paused ? t("已暂停") : t("正在录屏")}</span><time class="recording-time">${this.elapsed()}</time></div></div><div class="capture-live-actions"><button type="button" class="capture-secondary" data-action="tool-pause-recording" ${this.busy ? 'disabled' : ''}>${captureIcon(this.status.paused ? 'play' : 'pause')}<span>${this.status.paused ? t("继续录制") : t("暂停录制")}</span></button><button type="button" class="capture-danger" data-action="tool-stop-recording" title="${h('结束录制并预览')}" ${this.busy ? 'disabled' : ''}>${captureIcon('stop')}<span>${h('停止录制')}</span></button></div></section>`;
    return `<div class="capture-panel">${!screenshot && this.recording ? live : setup}<p class="tool-hint">${screenshot ? t("支持选区调整、画笔、箭头、形状、文字、马赛克、序号、撤销与复制。") : t("{0} 秒倒计时 · {1} FPS · 无声录制。可通过悬浮控制条或托盘结束。", [this.preferences.countdown, this.preferences.fps])}</p>${this.error ? `<p class="tool-error" role="alert">${esc(this.error)}</p>` : ''}${screenshot && this.screenshotUrl ? `<figure class="screenshot-preview"><img src="${this.screenshotUrl}" alt="${h("最近截图预览")}"></figure>` : ''}${saved ? `<div class="tool-output"><span>${h("已保存")}</span><p>${esc(saved)}</p><button class="capture-icon-button" title="${h("打开文件夹")}" aria-label="${h("打开文件夹")}" data-action="tool-reveal" data-kind="${screenshot ? 'screenshot' : 'recording'}">${captureIcon('folder')}</button></div>` : ''}${this.draftView(screenshot ? 'screenshot' : 'recording')}</div>`;
  }

  async action(action: string, button: HTMLElement): Promise<boolean> {
    if (await this.timeTools.action(action, button)) return true;
    if (!action.startsWith('tool-')) return false;
    if (action === 'tool-shortcut-save' || action === 'tool-shortcut-disable') {
      const kind = button.dataset.kind as CaptureKind;
      if (!captureKinds.includes(kind) || !this.shortcutsReady || this.shortcuts.busy) return true;
      const input = document.querySelector<HTMLInputElement>(`[data-shortcut-input="${kind}"]`);
      const key = action === 'tool-shortcut-disable' ? '' : input?.dataset.shortcut ?? this.shortcuts.values[kind];
      try {
        const pending = this.shortcuts.update(kind, key);
        this.changed();
        await pending;
        this.toast(key ? t("快捷键已保存并生效") : t("快捷键已停用"));
      } catch (error) { this.toast(message(error)); }
      finally { this.changed(); }
      return true;
    }
    if (action === 'tool-home') { this.showHome(); this.changed(); }
    else if (action === 'tool-open') {
      const section = button.dataset.section;
      if (section === 'calculator' || section === 'screenshot' || section === 'recording' || section === 'reminder') {
        if (!this.visibleSections.includes(section)) return true;
        this.section = section; this.error = ''; this.changed();
      }
    } else if (action === 'tool-calc') this.press(button.dataset.key ?? '');
    else if (action === 'tool-history') {
      const item = this.history[Number(button.dataset.index)];
      if (item) { this.expression = item.result; this.result = item.result; this.calculationError = ''; this.changed(); }
    } else if (action === 'tool-screenshot') await this.screenshot();
    else if (action === 'tool-directory' || action === 'tool-directory-clear') {
      const key = button.dataset.kind === 'screenshot' ? 'screenshotDirectory' : 'recordingDirectory';
      const directory = action === 'tool-directory-clear' ? '' : await open({ directory: true, multiple: false, title: t("选择默认保存目录") });
      if (typeof directory === 'string') { this.preferences[key] = directory; await this.savePreferences(); this.changed(); }
    }
    else if (action === 'tool-save-draft' && button.dataset.path) await this.saveDraft(button.dataset.path);
    else if (action === 'tool-preview-draft' && button.dataset.path) { this.previewDraft = this.previewDraft === button.dataset.path ? '' : button.dataset.path; this.changed(); }
    else if (action === 'tool-delete-draft' && button.dataset.path) {
      if (await confirm(t("删除这份未保存的截图或录屏？此操作无法撤销。"), { title: t("删除草稿"), kind: 'warning', okLabel: t('删除'), destructive: true })) { await invoke('delete_capture_draft', { path: button.dataset.path }); await this.refreshDrafts(); }
    }
    else if (action === 'tool-pause-recording') await this.pauseRecording();
    else if (action === 'tool-start-recording') await this.startRecording();
    else if (action === 'tool-stop-recording') await this.stopRecording();
    else if (action === 'tool-reveal') await invoke('reveal_tool_output', { path: button.dataset.kind === 'screenshot' ? this.screenshotPath : this.lastSavedRecording });
    return true;
  }

  input(input: HTMLInputElement) {
    this.timeTools.input(input);
    if (input.id === 'capture-auto-ocr' || input.id === 'capture-auto-translate') {
      if (input.disabled) return;
      const key = input.id === 'capture-auto-ocr' ? 'autoOcr' : 'autoTranslate';
      const previous = this.preferences[key];
      this.preferences[key] = input.checked; input.disabled = true;
      void this.savePreferences().catch(error => { this.preferences[key] = previous; this.report(error); })
        .finally(() => { input.disabled = false; this.changed(); });
      return;
    }
    if (input.id.startsWith('capture-')) {
      if (input.id === 'capture-countdown') this.preferences.countdown = Number(input.value);
      if (input.id === 'capture-fps') this.preferences.fps = Number(input.value);
      if (input.id === 'capture-cursor') this.preferences.cursor = input.checked;
      void this.savePreferences().catch(error => this.report(error));
    }
    if (input.id === 'calculator-expression') { this.expression = input.value; this.calculationError = ''; document.querySelector('.calculator .tool-error')?.remove(); }
    if (input.id === 'tool-display') this.displayId = Number(input.value);
    if (input.id === 'tool-hide-helper') this.hideHelper = input.checked;
    if (this.native && ['tool-display', 'tool-hide-helper'].includes(input.id)) {
      void invoke('configure_native_capture', {displayId: this.displayId, hideHelper: this.hideHelper}).catch(error => this.report(error));
    }
  }

  keydown(event: KeyboardEvent) {
    const input = event.target as HTMLInputElement;
    if (input.matches('[data-shortcut-input]')) {
      if (event.key === 'Tab') return;
      event.preventDefault();
      if (event.repeat || event.isComposing || this.shortcuts.busy) return;
      if (event.key === 'Escape') { this.setShortcutInput(input, this.shortcuts.values[input.dataset.shortcutInput as CaptureKind]); input.blur(); return; }
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      const key = shortcutFromEvent(event);
      if (key) this.setShortcutInput(input, key);
      else this.toast(t("请按 Ctrl、Alt 或 Win/⌘ 加字母、数字等组合键"));
      return;
    }
    if ((event.target as HTMLElement).id !== 'calculator-expression') return;
    if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); this.press('='); }
    if (event.key === 'Escape') { event.preventDefault(); this.press('C'); }
  }

  private press(key: string) {
    this.calculationError = '';
    if (key === 'C') { this.expression = ''; this.result = '0'; }
    else if (key === '⌫') this.expression = this.expression.slice(0, -1);
    else if (key === '±') this.expression = this.expression.startsWith('-(') && this.expression.endsWith(')') ? this.expression.slice(2, -1) : this.expression ? `-(${this.expression})` : '-';
    else if (key === '=') {
      try {
        this.result = String(calculate(this.expression));
        this.history = [{ expression: this.expression, result: this.result }, ...this.history].slice(0, 8);
        this.expression = this.result;
      } catch (error) { this.calculationError = message(error); }
    } else if (this.expression.length < 256) this.expression += key;
    this.changed();
    const input = document.querySelector<HTMLInputElement>('#calculator-expression');
    input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
  }

  private elapsed() {
    if (this.status.paused && this.pausedTime) return this.pausedTime;
    const seconds = Math.max(0, Math.floor((Date.now() - this.status.startedAt) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  private setStatus(status: Status) {
    if (this.native === false && status.active !== this.status.active) {
      void invoke('set_tray_recording', { active: status.active }).catch(error => this.report(error));
    }
    if (status.paused && !this.status.paused) this.pausedTime = this.elapsed();
    this.status = status;
    if (this.native && status.active) this.busy = false;
    clearInterval(this.timer);
    if (status.active) this.timer = window.setInterval(() => {
      document.querySelectorAll('.recording-time').forEach(el => { el.textContent = this.elapsed(); });
      if (this.native && !this.nativePollBusy && !this.busy) {
        this.nativePollBusy = true;
        void invoke<Status>('screen_recording_status').then(next => {
          if (next.error && next.active) void this.stopRecording();
          else if (next.active !== this.status.active) this.setStatus(next);
        }).catch(error => { this.error = message(error); }).finally(() => { this.nativePollBusy = false; });
      }
    }, 1000);
    if (status.error) this.error = status.error;
    this.changed();
  }

  private async choosePath(extension: string, label: string) {
    const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
    const directory = extension === 'png' ? this.preferences.screenshotDirectory : this.preferences.recordingDirectory;
    const filename = `${label}-${stamp}.${extension}`;
    const path = await save({ title: t("保存{0}", [label]), defaultPath: directory ? await join(directory, filename) : filename, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    return path && !/\.[^\\/.]+$/.test(path) ? `${path}.${extension}` : path;
  }

  private async prepareHelper() {
    const window=getCurrentWindow();
    if (!this.helperBeforeCapture) {
      const [visible,minimized,focused]=await Promise.all([window.isVisible(),window.isMinimized(),window.isFocused()]);
      this.helperBeforeCapture={visible,minimized,focused};
    }
    if(this.hideHelper && this.helperBeforeCapture.visible && !this.helperBeforeCapture.minimized) {
      await window.hide();
      // Windows waits for the compositor in the native snapshot. Hidden
      // WebView timers can turn an 80 ms delay into a much longer pause.
      if (!this.native) await delay(80);
    }
  }
  private async restoreHelper(force = true) {
    const window=getCurrentWindow(), before=this.helperBeforeCapture;
    this.helperBeforeCapture=null;
    if(!force && (!before || !before.visible || before.minimized)) return;
    await window.show();
    if(force || !before?.minimized) await window.unminimize();
    if(force || before?.focused) await window.setFocus();
  }
  private async completeCopiedCapture() {
    await this.clearOverlay(); this.busy=false;
    await this.restoreHelper(false);
    this.toast(t('图片已复制')); this.changed();
  }

  private savePreferences() { return invoke('set_setting', { key: 'capture_preferences', value: JSON.stringify(this.preferences) }); }
  private async saveDraft(path: string) {
    if (this.savingDraft) return;
    this.savingDraft = true; this.changed();
    try {
      const extension = path.split('.').at(-1)!;
      const destination = await this.choosePath(extension, extension === 'png' ? t("截图") : t("录屏"));
      if (!destination) { this.toast(t("已保留在待保存列表")); return; }
      await invoke('save_capture_draft', { path, destination });
      if (extension === 'png') this.screenshotPath = destination; else this.lastSavedRecording = destination;
      await invoke('delete_capture_draft', { path });
      this.toast(t("已保存"));
    } catch (error) { this.report(error); }
    finally { this.savingDraft = false; await this.refreshDrafts(); }
  }
  private async clearOverlay() {
    await invoke('close_system_capture_editor');
    if (this.overlaySource) {
      const path = this.overlaySource; this.overlaySource = '';
      await invoke('delete_capture_draft', { path });
    }
  }
  private async cancelOverlay() {
    if (this.recording) { await this.stopRecording(); return; }
    await this.clearOverlay(); this.busy = false; await this.restoreHelper(false); this.changed();
  }
  private async finishScreenshot(path: string, pinned = false) {
    await this.clearOverlay();
    this.busy = false;
    const bytes = await invoke<ArrayBuffer>('read_capture_draft', { path });
    this.showScreenshot(new Blob([bytes], { type: 'image/png' }), '');
    await this.refreshDrafts();
    if (pinned) { await this.restoreHelper(false); this.toast(t("截图已固定到桌面，可拖动、另存或关闭")); }
    else { await this.restoreHelper(); await this.saveDraft(path); }
  }
  private async pauseRecording() {
    if (!this.recording || this.busy) return;
    if (this.native) { await invoke('control_native_capture', {action: 'pause'}); return; }
    else if (this.recorder) {
      if (this.recorder.state === 'recording') { this.recorder.pause(); this.browserPausedAt = Date.now(); this.setStatus({ ...this.status, paused: true }); }
      else if (this.recorder.state === 'paused') { this.recorder.resume(); this.setStatus({ ...this.status, paused: false, startedAt: this.status.startedAt + Date.now() - this.browserPausedAt }); }
    }
  }
  private browserPausedAt = 0;

  shortcutFocus(input: HTMLElement | null) {
    if (!this.native) return;
    const kind = input?.matches('[data-shortcut-input]') ? input.dataset.shortcutInput : null;
    void invoke('edit_native_capture_shortcut', {kind}).catch(error => this.report(error));
  }

  private async startNative(kind: CaptureKind) {
    if (!this.native || this.busy || this.recording) return;
    this.busy = true; this.error = ''; this.changed();
    try {
      await invoke('configure_native_capture', {displayId: this.displayId, hideHelper: this.hideHelper});
      await invoke('start_native_capture', {kind});
    } catch (error) { this.busy = false; this.error = this.captureError(error); this.changed(); }
  }

  private async nativeFinished(event: NativeFinished) {
    if (this.nativeSessionId && event.id !== this.nativeSessionId) return;
    try {
    this.nativeSessionId = null; this.busy = false;
    if (event.error) this.report(event.error);
    const result = event.result;
    if (result?.action === 'copied') this.toast(t('图片已复制'));
    if (result?.action === 'pinned' && result.path) {
      const bytes = await invoke<ArrayBuffer>('read_capture_draft', {path: result.path});
      this.showScreenshot(new Blob([bytes], {type: 'image/png'}), '');
      this.toast(t('截图已固定到桌面，可拖动、另存或关闭'));
    }
    if (result?.action === 'saved' && result.path) this.screenshotPath = result.path;
    if (event.kind === 'recording') {
      this.setStatus(await invoke<Status>('screen_recording_status'));
      if (result?.path) { this.previewDraft = result.path; this.section = 'recording'; }
    }
    await this.refreshDrafts(); this.changed();
    } finally {
      this.finishNativeStop?.(); this.finishNativeStop = null; this.nativeStop = null;
    }
  }

  private async screenshot() {
    if (this.busy || this.recording || this.native === null) return;
    if (this.native) { await this.startNative('screenshot'); return; }
    this.busy = true; this.error = ''; this.changed();
    let stream: MediaStream | null = null;
    try {
      {
        stream = await this.displayStream();
        await this.prepareHelper();
        const video = document.createElement('video'); video.srcObject = stream; video.muted = true;
        await video.play();
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) throw new Error(t("没有读取到屏幕画面"));
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(t("截图生成失败"))), 'image/png'));
        stream.getTracks().forEach(t => t.stop()); stream = null;
        const path = await invoke<string>('new_capture_draft', { extension: 'png' });
        await this.exportBlob(blob, path);
        this.overlaySource = path;
        await invoke('open_system_capture_editor', { path });
      }
    } catch (error) {
      this.error = this.captureError(error);
      if (this.overlaySource) { await this.clearOverlay().catch(() => {}); await this.restoreHelper(false).catch(() => {}); }
    }
    finally {
      stream?.getTracks().forEach(track => track.stop());
      if (!this.overlaySource && this.helperBeforeCapture) await this.restoreHelper(false).catch(() => {});
      this.busy = Boolean(this.overlaySource); this.changed();
    }
  }

  private showScreenshot(blob: Blob, path: string) {
    if (this.screenshotUrl) URL.revokeObjectURL(this.screenshotUrl);
    this.screenshotUrl = URL.createObjectURL(blob); this.screenshotPath = path;
  }

  private displayStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error(t("当前系统 WebView 不支持屏幕捕获，请更新系统及 WebView 后重试"));
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: this.preferences.fps, max: this.preferences.fps } }, audio: false });
  }

  private captureError(error: unknown) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') return t("屏幕选择已取消或权限未允许；请允许屏幕录制后重试。");
    return message(error);
  }

  private async startRecording() {
    if (this.busy || this.recording || this.native === null) return;
    if (this.native) { await this.startNative('recording'); return; }
    this.busy = true; this.error = ''; this.changed();
    let minimized = false;
    try {
      {
        this.stream = await this.displayStream();
        if (typeof MediaRecorder === 'undefined') throw new Error(t("当前系统 WebView 不支持视频编码"));
        const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mime) throw new Error(t("当前系统没有可用的视频编码器"));
        const path = await invoke<string>('new_capture_draft', { extension: mime.includes('mp4') ? 'mp4' : 'webm' });
        for (let n = this.preferences.countdown; n > 0; n--) { this.toast(t("{0} 秒后开始录制", [n])); await delay(1000); }
        await this.prepareHelper(); minimized = this.hideHelper;
        await this.beginBrowserRecording(path, mime);
      }
    } catch (error) {
      this.error = this.captureError(error);
      if (!this.recording) { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (minimized || this.helperBeforeCapture) await this.restoreHelper(false).catch(() => {});
    } finally { this.busy = Boolean(this.overlaySource) && !this.recording; this.changed(); }
  }

  private async appendBlob(id: string, blob: Blob) {
    for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
      const data = await blob.slice(offset, offset + 1024 * 1024).arrayBuffer();
      await invoke('append_tool_export', new Uint8Array(data), { headers: { 'x-export-id': id } });
    }
  }

  private async exportBlob(blob: Blob, path: string) {
    const id = await invoke<string>('begin_tool_export', { path });
    try { await this.appendBlob(id, blob); await invoke('finish_tool_export', { id, discard: false }); }
    catch (error) { await invoke('finish_tool_export', { id, discard: true }).catch(() => {}); throw error; }
  }

  private async beginBrowserRecording(path: string, mimeType: string) {
    const recorder = new MediaRecorder(this.stream!, { mimeType, videoBitsPerSecond: 5_000_000 });
    const id = await invoke<string>('begin_tool_export', { path });
    let queue = Promise.resolve();
    let failed = '';
    let pendingBytes = 0;
    this.stopPromise = new Promise(resolve => {
      recorder.ondataavailable = event => {
        if (!event.data.size || failed) return;
        pendingBytes += event.data.size;
        queue = queue.then(async () => {
          if (!failed) await this.appendBlob(id, event.data);
        }).catch(error => { failed = message(error); if (recorder.state !== 'inactive') recorder.stop(); })
          .finally(() => { pendingBytes -= event.data.size; });
        if (pendingBytes > 32 * 1024 * 1024) { failed = t("磁盘写入速度过慢，录制已停止"); recorder.stop(); }
      };
      recorder.onerror = () => { failed = t("录屏编码失败"); if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.onstop = () => {
        void (async () => {
          this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
          await queue;
          try { await invoke('finish_tool_export', { id, discard: Boolean(failed) }); }
          catch (error) { failed = message(error); }
          this.recorder = null;
          this.setStatus({ ...this.status, active: false, error: failed || null });
          resolve();
          if (!this.busy && !failed) { this.previewDraft = path; this.section = 'recording'; await this.restoreHelper(); await this.refreshDrafts(); }
        })();
      };
    });
    this.recorder = recorder;
    this.stream!.getVideoTracks()[0].onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
    try { recorder.start(1000); }
    catch (error) { this.recorder = null; await invoke('finish_tool_export', { id, discard: true }); throw error; }
    this.setStatus({ active: true, startedAt: Date.now(), path, error: null });
  }

  async stopRecording() {
    if (this.nativeStop) return this.nativeStop;
    if (this.busy || !this.recording) return;
    if (this.native) {
      this.nativeStop = new Promise(resolve => { this.finishNativeStop = resolve; });
      const stopping = this.nativeStop;
      try { await invoke('control_native_capture', {action: 'stop'}); }
      catch (error) { this.finishNativeStop?.(); this.finishNativeStop = null; this.nativeStop = null; throw error; }
      return stopping;
    }
    this.busy = true; this.changed();
    try {
      if (this.recorder?.state !== 'inactive') this.recorder?.stop(); await this.stopPromise;
      await this.clearOverlay();
      await this.restoreHelper();
      await this.refreshDrafts();
      if (!this.status.error && this.status.path) { this.previewDraft = this.status.path; this.section = 'recording'; this.toast(t("录制完成，可预览后另存")); }
    } catch (error) {
      this.error = message(error);
      if (!this.recording) { await this.clearOverlay().catch(() => {}); await this.restoreHelper(); await this.refreshDrafts(); }
    }
    finally { this.busy = false; this.changed(); }
  }

  async beforeQuit() {
    if (this.recording) {
      await this.stopRecording();
      if (this.recording) throw new Error(t("请等待录屏保存完成后再退出"));
      if (this.status.error) throw new Error(t("录屏保存失败：{0}", [this.status.error]));
    }
    if (this.overlaySource) await this.cancelOverlay();
    if (this.savingDraft) throw new Error(t("请先完成当前保存操作"));
  }
}
