import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save, open, confirm } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { calculate } from './calculator';

type Section = 'calculator' | 'screenshot' | 'recording';
type Display = { id: number; name: string; width: number; height: number };
type Status = { active: boolean; startedAt: number; path: string; error: string | null; paused?: boolean };
type Draft = { path: string; bytes: number; modified: number };
type Preferences = { screenshotDirectory: string; recordingDirectory: string; countdown: number; fps: number; cursor: boolean };
const labels: Record<Section, string> = { calculator: '计算器', screenshot: '截图', recording: '录屏' };
const icons: Record<Section, string> = {
  calculator: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8 6h8M8 10h1m6 0h1M8 14h1m6 0h1M8 18h1m6 0h1"/>',
  screenshot: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4"/><rect x="7" y="7" width="10" height="10" rx="2"/>',
  recording: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/><circle cx="9.5" cy="12" r="2"/>',
};
const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export class Tools {
  section: Section | null = null;
  private native: boolean | null = null;
  private displays: Display[] = [];
  private displayId = 0;
  private hideHelper = true;
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
  private preferences: Preferences = { screenshotDirectory: '', recordingDirectory: '', countdown: 3, fps: 30, cursor: true };
  private drafts: Draft[] = [];
  private overlaySource = '';
  private savingDraft = false;
  private pausedTime = '';
  private lastSavedRecording = '';
  private previewDraft = '';
  constructor(private changed: () => void, private toast: (text: string) => void) {}
  get recording() { return this.status.active; }
  get backendNative() { return this.native; }

  async initialize() {
    try {
      const saved = await invoke<string | null>('get_setting', { key: 'capture_preferences' });
      if (saved) this.preferences = { ...this.preferences, ...JSON.parse(saved) };
      await this.refreshDrafts();
    } catch (error) { this.toast(`读取捕获设置失败：${message(error)}`); }
    await listen<{path: string; pinned?: boolean}>('capture-finished', event => { void this.finishScreenshot(event.payload.path, event.payload.pinned).catch(error => this.report(error)); });
    await listen<{region: {x: number; y: number; width: number; height: number}}>('capture-selected', event => { void this.recordSelected(event.payload.region).catch(error => this.report(error)); });
    await listen('capture-cancel', () => { void this.cancelOverlay().catch(error => this.report(error)); });
    await listen('capture-pause', () => { void this.pauseRecording().catch(error => this.report(error)); });
    await listen('tools-request-quit', () => {
      void this.beforeQuit().then(() => invoke('quit_app')).catch(error => this.toast(message(error)));
    });
    try {
      this.native = await invoke<boolean>('native_capture_available');
      const [displays, status] = await Promise.all([
        invoke<Display[]>('tool_displays'), invoke<Status>('screen_recording_status'),
      ]);
      this.displays = displays;
      this.displayId = displays[0]?.id ?? 0;
      this.setStatus(status);
      await listen<Status>('tools-recording', event => { if (this.native) this.setStatus(event.payload); });
      await listen('tools-stop-recording', () => { if (this.recording) void this.stopRecording(); });
    } catch (error) { this.error = message(error); }
    this.changed();
  }

  view() {
    if (!this.section) return `<div class="tools-page"><section class="tools-content"><div class="tool-launchers" aria-label="常用工具">${(['calculator', 'screenshot', 'recording'] as Section[]).map(section => `<button class="tool-launcher" data-action="tool-open" data-section="${section}"><span class="tool-launcher-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[section]}</svg>${section === 'recording' && this.recording ? '<span class="recording-dot"></span>' : ''}</span><span>${labels[section]}</span></button>`).join('')}</div>${this.recording ? `<div class="tool-recording-banner"><button data-action="tool-open" data-section="recording"><span class="recording-dot"></span>正在录屏 <time class="recording-time">${this.elapsed()}</time></button><button data-action="tool-stop-recording" ${this.busy ? 'disabled' : ''}>${this.busy ? '保存中…' : '停止并保存'}</button></div>` : ''}${this.draftView()}</section></div>`;
    return `<div class="tools-page"><div class="tool-backbar"><button data-action="tool-home" aria-label="返回工具列表">‹ 工具</button><span>${labels[this.section]}</span></div><section class="tools-content">${this.section === 'calculator' ? this.calculatorView() : this.captureView()}</section></div>`;
  }

  showHome() { this.section = null; this.error = ''; }

  settingsView() {
    return `<div class="capture-settings"><strong>截图与录屏</strong><p class="tool-hint">完成后再选择保存位置；取消保存会保留在待保存列表。</p>${(['screenshot', 'recording'] as const).map(kind => `<label class="tool-field">${kind === 'screenshot' ? '截图' : '录屏'}默认保存目录<div class="capture-directory"><input readonly aria-label="${kind === 'screenshot' ? '截图' : '录屏'}默认保存目录" value="${esc(this.preferences[`${kind}Directory`])}" placeholder="每次选择保存位置"><button data-action="tool-directory" data-kind="${kind}">选择</button><button data-action="tool-directory-clear" data-kind="${kind}" title="恢复系统默认目录">清除</button></div></label>`).join('')}<div class="capture-settings-row"><label class="tool-field">录屏倒计时<select id="capture-countdown">${[0,3,5,10].map(n => `<option value="${n}" ${this.preferences.countdown === n ? 'selected' : ''}>${n === 0 ? '关闭' : `${n} 秒`}</option>`).join('')}</select></label><label class="tool-field">录屏帧率<select id="capture-fps">${[15,30,60].map(n => `<option value="${n}" ${this.preferences.fps === n ? 'selected' : ''}>${n} FPS</option>`).join('')}</select></label></div><label class="tool-checkbox"><input type="checkbox" id="capture-cursor" ${this.preferences.cursor ? 'checked' : ''}>录屏显示鼠标指针（Windows）</label></div>`;
  }

  private report(error: unknown) { this.error = message(error); this.toast(this.error); this.changed(); }
  private async refreshDrafts() { this.drafts = await invoke<Draft[]>('list_capture_drafts'); this.changed(); }
  private draftView() {
    const items = this.drafts.filter(d => d.path !== this.overlaySource && !(this.recording && d.path === this.status.path));
    const preview = this.previewDraft && items.some(d => d.path === this.previewDraft) ? `<div class="capture-result">${this.previewDraft.endsWith('.png') ? `<img src="${convertFileSrc(this.previewDraft)}" alt="待保存截图">` : `<video controls preload="metadata" src="${convertFileSrc(this.previewDraft)}" aria-label="录屏预览"></video>`}</div>` : '';
    return items.length ? `<div class="capture-drafts"><strong>待保存 · ${items.length}</strong><p class="tool-hint">先预览，再另存。未保存的结果下次打开仍可找回。</p>${preview}${items.map(d => `<div class="capture-draft"><div><span>${d.path.endsWith('.png') ? '截图' : '录屏'} · ${new Date(d.modified * 1000).toLocaleString()}</span><small>${(d.bytes / 1024 / 1024).toFixed(1)} MB</small></div><button data-action="tool-preview-draft" data-path="${esc(d.path)}">预览</button><button data-action="tool-save-draft" data-path="${esc(d.path)}" ${this.savingDraft ? 'disabled' : ''}>另存</button><button data-action="tool-delete-draft" data-path="${esc(d.path)}" ${this.savingDraft ? 'disabled' : ''}>删除</button></div>`).join('')}</div>` : '';
  }

  private calculatorView() {
    const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='];
    return `<div class="calculator"><label class="calculator-display"><span>输入算式</span><input id="calculator-expression" aria-label="计算算式" maxlength="256" autocomplete="off" inputmode="decimal" value="${esc(this.expression)}" placeholder="0" /><output aria-live="polite">${esc(this.result)}</output></label>${this.calculationError ? `<p class="tool-error" role="alert">${esc(this.calculationError)}</p>` : ''}<div class="calculator-keys">${keys.map(key => `<button data-action="tool-calc" data-key="${key}" class="${key === '=' ? 'equals' : ['÷', '×', '−', '+', '%'].includes(key) ? 'operator' : ''}" aria-label="${key === '⌫' ? '退格' : key === 'C' ? '清空' : key === '±' ? '切换正负' : key}">${key}</button>`).join('')}</div><p class="tool-hint">支持括号、百分比；按 Enter 计算，Esc 清空。</p>${this.history.length ? `<div class="calculator-history" aria-label="计算历史">${this.history.map((item, index) => `<button data-action="tool-history" data-index="${index}"><span>${esc(item.expression)}</span><strong>= ${esc(item.result)}</strong></button>`).join('')}</div>` : ''}</div>`;
  }

  private captureView() {
    const screenshot = this.section === 'screenshot';
    const disabled = this.busy || this.native === null || this.recording;
    const saved = screenshot ? this.screenshotPath : this.lastSavedRecording;
    return `<div class="capture-panel"><p class="tool-description">${screenshot ? '桌面框选 → 标注 → 完成后保存' : '选择区域 → 倒计时 → 录制 → 完成后保存'}</p>${this.native ? `<label class="tool-field">显示器<select id="tool-display" ${disabled ? 'disabled' : ''}>${this.displays.map(d => `<option value="${d.id}" ${this.displayId === d.id ? 'selected' : ''}>${esc(d.name)} · ${d.width} × ${d.height}</option>`).join('')}</select></label>` : `<p class="tool-hint">${this.native === null ? '正在读取屏幕信息…' : '当前平台通过系统选择屏幕或窗口。区域录屏和桌面悬浮控制条暂限 Windows。'}</p>`}<label class="tool-checkbox"><input id="tool-hide-helper" type="checkbox" ${this.hideHelper ? 'checked' : ''} ${disabled ? 'disabled' : ''}>捕获时暂时最小化小助手</label>${!screenshot && this.recording ? `<div class="recording-status"><span class="recording-dot"></span><strong>${this.status.paused ? '已暂停' : '正在录屏'}</strong><time class="recording-time">${this.elapsed()}</time></div><div class="capture-settings-row"><button data-action="tool-pause-recording" ${this.busy ? 'disabled' : ''}>${this.status.paused ? '继续录制' : '暂停录制'}</button><button class="primary" data-action="tool-stop-recording" ${this.busy ? 'disabled' : ''}>结束录制</button></div>` : `<button class="primary capture-start" data-action="${screenshot ? 'tool-screenshot' : 'tool-start-recording'}" ${disabled ? 'disabled' : ''}>${this.busy ? '正在捕获…' : screenshot ? '开始截图' : '选择录制区域'}</button>`}<p class="tool-hint">${screenshot ? '支持选区调整、画笔、箭头、形状、文字、马赛克、序号、撤销与复制。' : `${this.preferences.countdown} 秒倒计时 · ${this.preferences.fps} FPS · 无声录制。可通过悬浮控制条或托盘结束。`}</p>${this.error ? `<p class="tool-error" role="alert">${esc(this.error)}</p>` : ''}${screenshot && this.screenshotUrl ? `<figure class="screenshot-preview"><img src="${this.screenshotUrl}" alt="最近截图预览"></figure>` : ''}${saved ? `<div class="tool-output"><span>已保存</span><p>${esc(saved)}</p><button data-action="tool-reveal" data-kind="${screenshot ? 'screenshot' : 'recording'}">打开文件夹</button></div>` : ''}${this.draftView()}</div>`;
  }

  async action(action: string, button: HTMLElement): Promise<boolean> {
    if (!action.startsWith('tool-')) return false;
    if (action === 'tool-home') { this.showHome(); this.changed(); }
    else if (action === 'tool-open') {
      const section = button.dataset.section;
      if (section === 'calculator' || section === 'screenshot' || section === 'recording') {
        this.section = section; this.error = ''; this.changed();
      }
    } else if (action === 'tool-calc') this.press(button.dataset.key ?? '');
    else if (action === 'tool-history') {
      const item = this.history[Number(button.dataset.index)];
      if (item) { this.expression = item.result; this.result = item.result; this.calculationError = ''; this.changed(); }
    } else if (action === 'tool-screenshot') await this.screenshot();
    else if (action === 'tool-directory' || action === 'tool-directory-clear') {
      const key = button.dataset.kind === 'screenshot' ? 'screenshotDirectory' : 'recordingDirectory';
      const directory = action === 'tool-directory-clear' ? '' : await open({ directory: true, multiple: false, title: '选择默认保存目录' });
      if (typeof directory === 'string') { this.preferences[key] = directory; await this.savePreferences(); this.changed(); }
    }
    else if (action === 'tool-save-draft' && button.dataset.path) await this.saveDraft(button.dataset.path);
    else if (action === 'tool-preview-draft' && button.dataset.path) { this.previewDraft = button.dataset.path; this.changed(); }
    else if (action === 'tool-delete-draft' && button.dataset.path) {
      if (await confirm('删除这份未保存的截图或录屏？此操作无法撤销。', { title: '删除草稿', kind: 'warning' })) { await invoke('delete_capture_draft', { path: button.dataset.path }); await this.refreshDrafts(); }
    }
    else if (action === 'tool-pause-recording') await this.pauseRecording();
    else if (action === 'tool-start-recording') await this.startRecording();
    else if (action === 'tool-stop-recording') await this.stopRecording();
    else if (action === 'tool-reveal') await invoke('reveal_tool_output', { path: button.dataset.kind === 'screenshot' ? this.screenshotPath : this.lastSavedRecording });
    return true;
  }

  input(input: HTMLInputElement) {
    if (input.id.startsWith('capture-')) {
      if (input.id === 'capture-countdown') this.preferences.countdown = Number(input.value);
      if (input.id === 'capture-fps') this.preferences.fps = Number(input.value);
      if (input.id === 'capture-cursor') this.preferences.cursor = input.checked;
      void this.savePreferences().catch(error => this.report(error));
    }
    if (input.id === 'calculator-expression') { this.expression = input.value; this.calculationError = ''; document.querySelector('.calculator .tool-error')?.remove(); }
    if (input.id === 'tool-display') this.displayId = Number(input.value);
    if (input.id === 'tool-hide-helper') this.hideHelper = input.checked;
  }

  keydown(event: KeyboardEvent) {
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
    const path = await save({ title: `保存${label}`, defaultPath: directory ? await join(directory, filename) : filename, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    return path && !/\.[^\\/.]+$/.test(path) ? `${path}.${extension}` : path;
  }

  private async restoreHelper() {
    const window = getCurrentWindow();
    await window.show(); await window.unminimize(); await window.setFocus();
  }

  private savePreferences() { return invoke('set_setting', { key: 'capture_preferences', value: JSON.stringify(this.preferences) }); }
  private async saveDraft(path: string) {
    if (this.savingDraft) return;
    this.savingDraft = true; this.changed();
    try {
      const extension = path.split('.').at(-1)!;
      const destination = await this.choosePath(extension, extension === 'png' ? '截图' : '录屏');
      if (!destination) { this.toast('已保留在待保存列表'); return; }
      await invoke('save_capture_draft', { path, destination });
      if (extension === 'png') this.screenshotPath = destination; else this.lastSavedRecording = destination;
      await invoke('delete_capture_draft', { path });
      this.toast('已保存');
    } catch (error) { this.report(error); }
    finally { this.savingDraft = false; await this.refreshDrafts(); }
  }
  private async clearOverlay() {
    await invoke('close_capture_overlay');
    if (this.overlaySource) {
      const path = this.overlaySource; this.overlaySource = '';
      await invoke('delete_capture_draft', { path });
    }
  }
  private async cancelOverlay() {
    if (this.recording) { await this.stopRecording(); return; }
    await this.clearOverlay(); this.busy = false; await this.restoreHelper(); this.changed();
  }
  private async finishScreenshot(path: string, pinned = false) {
    await this.clearOverlay();
    this.busy = false;
    const bytes = await invoke<ArrayBuffer>('read_capture_draft', { path });
    this.showScreenshot(new Blob([bytes], { type: 'image/png' }), '');
    await this.refreshDrafts();
    if (pinned) { this.toast('截图已固定到桌面，可拖动、另存或关闭'); }
    else { await this.restoreHelper(); await this.saveDraft(path); }
  }
  private async openSelection(mode: 'screenshot' | 'recording') {
    const path = await invoke<string>('new_capture_draft', { extension: 'png' });
    this.overlaySource = path;
    try {
      if (this.hideHelper) { await getCurrentWindow().minimize(); await delay(300); }
      await invoke('capture_screenshot', { displayId: this.displayId, path });
      await invoke('open_capture_overlay', { displayId: this.displayId, path, mode, countdown: this.preferences.countdown });
    } catch (error) { await this.clearOverlay(); await this.restoreHelper(); throw error; }
  }
  private async recordSelected(region: {x: number; y: number; width: number; height: number}) {
    try {
      await invoke('show_recording_border', { region });
      const path = await invoke<string>('new_capture_draft', { extension: 'mp4' });
      this.setStatus(await invoke<Status>('start_screen_recording', { displayId: this.displayId, path, region, fps: this.preferences.fps, cursor: this.preferences.cursor }));
      // The capture window becomes a draggable, capture-excluded control bar.
      this.busy = false; this.changed();
    } catch (error) { await this.cancelOverlay(); this.report(error); }
  }
  private async pauseRecording() {
    if (!this.recording || this.busy) return;
    if (this.native) this.setStatus(await invoke<Status>('pause_screen_recording', { paused: !this.status.paused }));
    else if (this.recorder) {
      if (this.recorder.state === 'recording') { this.recorder.pause(); this.browserPausedAt = Date.now(); this.setStatus({ ...this.status, paused: true }); }
      else if (this.recorder.state === 'paused') { this.recorder.resume(); this.setStatus({ ...this.status, paused: false, startedAt: this.status.startedAt + Date.now() - this.browserPausedAt }); }
    }
  }
  private browserPausedAt = 0;

  private async screenshot() {
    if (this.busy || this.recording || this.native === null) return;
    this.busy = true; this.error = ''; this.changed();
    let minimized = false;
    let stream: MediaStream | null = null;
    try {
      if (this.native) {
        await this.openSelection('screenshot');
        return;
      } else {
        stream = await this.displayStream();
        if (this.hideHelper) { await getCurrentWindow().minimize(); minimized = true; await delay(300); }
        const video = document.createElement('video'); video.srcObject = stream; video.muted = true;
        await video.play();
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) throw new Error('没有读取到屏幕画面');
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('截图生成失败')), 'image/png'));
        stream.getTracks().forEach(t => t.stop()); stream = null;
        if (minimized) { await this.restoreHelper(); minimized = false; }
        const path = await invoke<string>('new_capture_draft', { extension: 'png' });
        await this.exportBlob(blob, path);
        this.overlaySource = path;
        await invoke('open_capture_overlay', { displayId: 0, path, mode: 'screenshot', countdown: 0 });
      }
    } catch (error) {
      this.error = this.captureError(error);
      if (this.overlaySource) { await this.clearOverlay().catch(() => {}); await this.restoreHelper().catch(() => {}); }
    }
    finally {
      stream?.getTracks().forEach(track => track.stop());
      if (minimized) await this.restoreHelper().catch(() => {});
      this.busy = Boolean(this.overlaySource); this.changed();
    }
  }

  private showScreenshot(blob: Blob, path: string) {
    if (this.screenshotUrl) URL.revokeObjectURL(this.screenshotUrl);
    this.screenshotUrl = URL.createObjectURL(blob); this.screenshotPath = path;
  }

  private displayStream() {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('当前系统 WebView 不支持屏幕捕获，请更新系统及 WebView 后重试');
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: this.preferences.fps, max: this.preferences.fps } }, audio: false });
  }

  private captureError(error: unknown) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') return '屏幕选择已取消或权限未允许；请允许屏幕录制后重试。';
    return message(error);
  }

  private async startRecording() {
    if (this.busy || this.recording || this.native === null) return;
    this.busy = true; this.error = ''; this.changed();
    let minimized = false;
    try {
      if (this.native) {
        await this.openSelection('recording');
      } else {
        this.stream = await this.displayStream();
        if (typeof MediaRecorder === 'undefined') throw new Error('当前系统 WebView 不支持视频编码');
        const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mime) throw new Error('当前系统没有可用的视频编码器');
        const path = await invoke<string>('new_capture_draft', { extension: mime.includes('mp4') ? 'mp4' : 'webm' });
        for (let n = this.preferences.countdown; n > 0; n--) { this.toast(`${n} 秒后开始录制`); await delay(1000); }
        await this.beginBrowserRecording(path, mime);
        if (this.hideHelper) { await getCurrentWindow().minimize(); minimized = true; }
      }
    } catch (error) {
      this.error = this.captureError(error);
      if (!this.recording) { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
      if (minimized) await this.restoreHelper().catch(() => {});
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
        if (pendingBytes > 32 * 1024 * 1024) { failed = '磁盘写入速度过慢，录制已停止'; recorder.stop(); }
      };
      recorder.onerror = () => { failed = '录屏编码失败'; if (recorder.state !== 'inactive') recorder.stop(); };
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
    if (this.busy || !this.recording) return;
    this.busy = true; this.changed();
    try {
      if (this.native) this.setStatus(await invoke<Status>('stop_screen_recording'));
      else { if (this.recorder?.state !== 'inactive') this.recorder?.stop(); await this.stopPromise; }
      await this.clearOverlay();
      await this.restoreHelper();
      await this.refreshDrafts();
      if (!this.status.error && this.status.path) { this.previewDraft = this.status.path; this.section = 'recording'; this.toast('录制完成，可预览后另存'); }
    } catch (error) {
      this.error = message(error);
      if (!this.recording) { await this.clearOverlay().catch(() => {}); await this.restoreHelper(); await this.refreshDrafts(); }
    }
    finally { this.busy = false; this.changed(); }
  }

  async beforeQuit() {
    if (this.recording) {
      await this.stopRecording();
      if (this.recording) throw new Error('请等待录屏保存完成后再退出');
      if (this.status.error) throw new Error(`录屏保存失败：${this.status.error}`);
    }
    if (this.overlaySource) await this.cancelOverlay();
    if (this.savingDraft) throw new Error('请先完成当前保存操作');
  }
}
