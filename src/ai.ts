import { t, h } from './i18n';
import { Channel, invoke } from '@tauri-apps/api/core';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { modelMessages, parseTasks, taskPrompt, type Attachment, type AiMessage, type Session } from './ai-model';
import './ai.css';
import { providerPresets } from './ai-presets';

type Mapping = { name: string; model: string };
type Config = { id: string; name: string; provider: string; baseUrl: string; model: string; vision: boolean; language: string; hasKey: boolean; modelMappings?: Mapping[] };
type Catalog = { profiles: Config[]; activeId: string };
type Note = { id: number; content: string };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const errorText = (e: unknown) => t(e instanceof Error ? e.message : String(e));
const uid = () => crypto.randomUUID();
const translationLanguages = [ ['中文', '简体中文'], ['英语', 'English'], ['西班牙语', 'Español'], ['日语', '日本語'], ['韩语', '한국어'], ['法语', 'Français'], ['德语', 'Deutsch'], ['俄语', 'Русский'], ['葡萄牙语', 'Português'], ['阿拉伯语', 'العربية'] ];
const modelLabel = (config: Config) => {
  const alias = config.modelMappings?.find(row => row.model === config.model)?.name;
  return alias && alias !== config.model ? `${alias} · ${config.model}` : config.model;
};

export class Ai {
  private config: Config = this.blankConfig();
  private savedConfig: Config = { ...this.config };
  private catalog: Catalog = { profiles: [], activeId: '' };
  private key = '';
  private sessions: Session[] = [];
  private current = '';
  private history = false;
  private pickingNotes = false;
  private ready = false;
  private configBusy = false;
  private configError = '';
  private editorOpen = false;
  private editorBaseline = '';
  private configNotice = '';
  private remoteModels: string[] | null = null;
  private modelPickerIndex = -1;
  private modelFilter = '';
  private modelListError = '';
  private fetchingModels = false;
  private requests = new Map<string, string>();
  private operations = new Set<string>();
  private saves = new Map<string, Promise<unknown>>();
  private draftTimers = new Map<string, number>();
  private cancelled = new Set<string>();
  private started = new Set<string>();
  private historyBusy = false;
  constructor(private changed: () => void, private toast: (s: string) => void, private navigate: () => void, private notes: () => Note[], private refresh: () => Promise<void>) {}
  private blankConfig(): Config { return { id: uid(), name: '', provider: 'custom', baseUrl: '', model: '', vision: false, language: '中文', hasKey: false }; }
  private openEditor(config: Config) {
    this.config = structuredClone(config); this.editorBaseline = JSON.stringify(this.config);
    this.key = ''; this.configError = ''; this.configNotice = ''; this.resetModelList(); this.editorOpen = true;
  }
  async closeEditor() {
    if (!this.editorOpen || this.configBusy) return;
    if ((this.key || JSON.stringify(this.config) !== this.editorBaseline) && !await confirm(t('模型修改尚未保存，确定放弃修改吗？'), { title: t('关闭模型配置'), kind: 'warning' })) return;
    this.editorOpen = false; this.key = ''; this.config = structuredClone(this.savedConfig); this.configError = ''; this.configNotice = ''; this.resetModelList(); this.changed();
  }
  restoreEditor() {
    const dialog = document.querySelector<HTMLDialogElement>('.ai-profile-dialog');
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.addEventListener('cancel', event => { event.preventDefault(); void this.closeEditor(); });
    }
  }
  private mappings() { return this.config.modelMappings ?? (this.config.model ? [{ name: this.config.model, model: this.config.model }] : []); }
  private resetModelList() {
    this.remoteModels = null; this.modelPickerIndex = -1; this.modelFilter = ''; this.modelListError = '';
    document.querySelector('.ai-model-picker')?.remove();
    document.querySelectorAll<HTMLButtonElement>('[data-action="ai-open-models"]').forEach(button => { button.disabled = true; });
    document.querySelector('.ai-model-list-status')?.remove();
  }
  private addMappings(models: Mapping[]) {
    const rows = this.mappings().map(row => ({ ...row }));
    for (const row of models) if (!rows.some(m => m.model === row.model) && rows.length < 50) rows.push({ ...row });
    this.config.modelMappings = rows;
    this.config.model ||= rows[0]?.model ?? '';
  }
  private applyCatalog(catalog: Catalog) {
    this.catalog = catalog;
    this.savedConfig = { ...(catalog.profiles.find(p => p.id === catalog.activeId) ?? this.blankConfig()) };
  }
  hasActiveModel() {
    const profile = this.catalog.profiles.find(p => p.id === this.catalog.activeId);
    return !!profile?.baseUrl.trim() && !!profile.model.trim();
  }
  private configAvailable() {
    if (this.configBusy || this.requests.size) throw new Error(t("请等待生成或配置操作结束后再修改模型"));
  }

  async initialize() {
    try {
      this.sessions = await invoke<Session[]>('ai_sessions');
      for (const s of this.sessions) for (const m of s.messages) if (m.status === 'generating') { m.status = 'error'; m.error = t("上次生成已中断，可重试"); }
      this.current = this.sessions[0]?.id ?? '';
      this.ready = true;
      try { this.applyCatalog(await invoke<Catalog>('ai_settings')); this.config = { ...this.savedConfig }; }
      catch (e) { this.configError = errorText(e); }
      this.changed();
    } catch (e) { this.toast(t("读取 AI 数据失败：{0}", [errorText(e)])); }
  }
  async reloadSettings() {
    if (!this.ready || this.configBusy || this.requests.size) return false;
    const editing = this.key !== '' || JSON.stringify(this.config) !== JSON.stringify(this.savedConfig);
    this.applyCatalog(await invoke<Catalog>('ai_settings'));
    if (!editing) this.config = { ...this.savedConfig };
    this.configError = '';
    return true;
  }
  private session() { return this.sessions.find(s => s.id === this.current); }
  private create(title = '新对话', source?: Session['source']) {
    const s: Session = { id: uid(), title, updatedAt: Date.now(), messages: [], source, attachments: [] };
    this.sessions.unshift(s); this.current = s.id; return s;
  }
  private persist(s: Session) {
    clearTimeout(this.draftTimers.get(s.id));
    this.draftTimers.delete(s.id);
    s.updatedAt = Date.now();
    const session = JSON.parse(JSON.stringify(s));
    const pending = (this.saves.get(s.id) ?? Promise.resolve()).catch(() => {}).then(() => invoke('ai_save_session', { session }));
    this.saves.set(s.id, pending);
    return pending;
  }
  private source(key: string) { return this.sessions.find(s => s.source?.key === key); }
  private latest(s: Session) { return [...s.messages].reverse().find(m => m.role === 'assistant'); }
  private button(action: string, label: string, s?: Session, extra = '', disabled = false) {
    return `<button type="button" data-action="ai-${action}" ${s ? `data-session="${s.id}"` : ''} ${extra} ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  private attachmentView(a: Attachment, removable = false) {
    return `<span class="ai-attachment">${a.image ? `<img src="${esc(a.image)}" alt="${esc(a.name)}">` : '▤ '}${esc(a.name)}${removable ? this.button('remove-attachment', '×', undefined, `data-attachment="${a.id}" aria-label="${h("移除引用")}"`) : ''}</span>`;
  }
  view() {
    if (!this.ready) return `<section class="ai-page"><p>${h("正在读取 AI 数据…")}</p></section>`;
    const s = this.session();
    return `<section class="ai-page"><div class="ai-toolbar"><strong>${esc(s?.title === '新对话' && !s.messages.length ? t('新对话') : s?.title ?? t("AI 助手"))}</strong>${this.button('new', t('新对话'))}${this.button('history', t("历史"))}</div>
      ${this.history ? `<div class="ai-history">${this.sessions.length ? this.sessions.map(item => `<div>${this.button('select', esc(item.title === '新对话' && !item.messages.length ? t('新对话') : item.title), item)}${this.button('delete', t("删除"), item, '', this.requests.has(item.id))}</div>`).join('') : `<p>${h("还没有会话")}</p>`}</div>` : ''}
      <div class="ai-messages scroll-area" data-scroll-key="ai-chat-${s?.id ?? 'empty'}">${s?.messages.length ? s.messages.map(m => `<article class="ai-message ${m.role}"><strong>${m.role === 'user' ? t("你") : esc(m.modelLabel ?? 'AI')}</strong>${(m.attachments ?? []).map(a => this.attachmentView(a)).join('')}<div class="ai-text" data-ai-message="${m.id}">${esc(m.text || (m.status === 'generating' ? t("正在思考…") : ''))}</div>${m.error ? `<p class="tool-error">${esc(m.error)}</p>` : ''}${m.role === 'assistant' && m.text && m.status === 'done' ? `<div class="ai-actions">${this.button('copy', t("复制"), s, `data-message="${m.id}"`)}${this.button('save-note', t("另存速记"), s, `data-message="${m.id}"`)}${this.button('extract', t("提取待办"), s, `data-message="${m.id}"`, this.requests.has(s.id))}</div>` : ''}</article>`).join('') : `<div class="ai-empty"><strong>${h("今天需要什么帮助？")}</strong><p>${h("整理速记、解释截图，或者直接聊聊。")}</p><p>${h("在下方引用速记或添加图片，只有选中的内容会随会话发送。")}</p></div>`}${s ? this.taskView(s) : ''}${s && this.latest(s)?.status === 'error' ? this.button('retry', t("重试上次请求"), s, '', this.requests.has(s.id)) : ''}</div>
      ${this.pickingNotes ? `<div class="ai-note-picker"><strong>${h("选择要引用的速记")}</strong>${this.notes().length ? this.notes().map(n => this.button('attach-note', esc(n.content.slice(0, 65)), undefined, `data-note="${n.id}"`)).join('') : `<p>${h("还没有速记")}</p>`}</div>` : ''}
      <form id="ai-chat-form" class="ai-composer"><div class="ai-attachments">${(s?.attachments ?? []).map(a => this.attachmentView(a, true)).join('')}</div><textarea id="ai-input" maxlength="16000" placeholder="${h("输入问题…")}" aria-label="${h("AI 消息")}">${esc(s?.draft ?? '')}</textarea><div class="ai-actions">${this.button('pick-note', t("引用速记"))}${this.button('attach-image', t("添加图片"), undefined, '', !this.savedConfig.vision)}<span></span>${s && this.requests.has(s.id) ? this.button('stop', t("停止生成"), s) : `<button class="primary small" type="submit">${h("发送")}</button>`}</div><small>${h("发送至已配置服务 ·")} ${esc(modelLabel(this.savedConfig) || t("请先在设置中配置 AI"))} ${h("· 不自动读取其他资料")}</small></form></section>`;
  }
  settingsView() {
    const preset = providerPresets.find(p => p.id === this.config.provider) ?? providerPresets[0];
    const saved = this.catalog.profiles.find(p => p.id === this.config.id);
    const sameEndpoint = saved?.baseUrl === this.config.baseUrl.trim().replace(/\/+$/, '');
    const busy = this.configBusy || this.requests.size > 0 || !this.ready;
    return `<section class="capture-settings ai-settings"><div class="ai-toolbar"><strong>${h("AI 模型")}</strong>${this.button('add-model', t("＋ 添加模型"), undefined, '', busy || this.catalog.profiles.length >= 50)}</div><p class="tool-hint">${h("可保存多个模型，点击「使用」选中一个。聊天、速记和截图使用当前选中的模型。")}</p>
      <div class="ai-profile-list">${this.catalog.profiles.length ? this.catalog.profiles.map(p => `<div class="ai-profile ${p.id === this.catalog.activeId ? 'active' : ''}"><div><strong>${esc(p.name)}${p.id === this.catalog.activeId ? `<small>${h("当前")}</small>` : ''}</strong><span>${esc(modelLabel(p))}${p.vision ? t(" · 支持图片") : ''}</span></div><div class="ai-actions">${this.button('use-model', t("使用"), undefined, `data-profile="${esc(p.id)}"`, busy || p.id === this.catalog.activeId)}${this.button('edit-model', t("编辑"), undefined, `data-profile="${esc(p.id)}"`, busy)}${this.button('delete-model', t("删除"), undefined, `data-profile="${esc(p.id)}"`, busy)}</div></div>`).join('') : `<p class="tool-hint">${h("还没有模型，点击「添加模型」开始配置。")}</p>`}</div>
      ${this.editorOpen ? `<dialog class="ai-profile-dialog ai-settings" aria-labelledby="ai-profile-title"><header><strong id="ai-profile-title">${saved ? t("编辑模型") : t("添加模型")}</strong>${this.button('close-editor', '×', undefined, `class="ai-editor-close" aria-label="${h('关闭')}"`, busy)}</header><form id="ai-settings-form" class="ai-profile-editor"><fieldset class="ai-profile-fields scroll-area" data-scroll-key="ai-profile-${esc(this.config.id)}" ${busy ? 'disabled' : ''}>
      <label class="tool-field">${h("服务预设")}<select id="ai-provider" ${busy ? 'disabled' : ''}>${['自定义', '国内', '国外', '本机'].map(group => `<optgroup label="${h(group === '本机' ? '本机模型' : group)}">${providerPresets.filter(p => p.group === group).map(p => `<option value="${p.id}" ${p.id === preset.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></label><p class="tool-hint">${h(preset.hint)}</p>
      <label class="tool-field">${h("配置名称")}<input id="ai-config-name" maxlength="80" value="${esc(this.config.name)}" placeholder="${h("例如：日常问答、截图识别")}" required></label>
      <label class="tool-field">${h("服务地址")}<input id="ai-base-url" value="${esc(this.config.baseUrl)}" placeholder="${h("https://服务地址/v1")}" required></label>
      <label class="tool-field">${h("API 密钥")}<input id="ai-api-key" type="password" autocomplete="new-password" value="${esc(this.key)}" placeholder="${sameEndpoint && saved?.hasKey ? t("已保存在系统凭据库；留空保留") : t("填写此配置的密钥；本地免密服务可留空")}"></label>
      <label class="tool-checkbox"><input id="ai-vision" type="checkbox" ${this.config.vision ? 'checked' : ''}>${h("所选模型支持图片")}</label>
      <label class="tool-field">${h("默认翻译语言")}<select id="ai-language">${!translationLanguages.some(([value]) => value === this.config.language) ? `<option value="${esc(this.config.language)}" selected>${esc(this.config.language)}</option>` : ''}${translationLanguages.map(([value, label]) => `<option value="${esc(value)}" ${value === this.config.language ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <section class="ai-model-mappings"><div class="ai-toolbar"><strong>${h('模型映射')}</strong></div><p class="tool-hint">${h('显示名称便于辨认，实际模型用于请求。选择一条作为此配置的当前模型，保存后生效。')}</p><div class="ai-actions">${this.button('add-mapping', t('添加映射'), undefined, '', busy || this.mappings().length >= 50)}${this.button('preset-mappings', t('一键设置'), undefined, '', busy || !preset.models.length)}${this.button('fetch-models', this.fetchingModels ? t('正在获取…') : t('获取模型列表'), undefined, '', busy)}</div><p class="tool-hint">${h('一键设置会补入当前服务的常用模型，保留已有映射。')}</p>
      ${this.mappings().map((row, i) => `<div class="ai-mapping-row"><div class="ai-toolbar"><label class="tool-checkbox"><input type="radio" name="ai-mapping-active" data-mapping-active="${i}" ${this.config.model === row.model ? 'checked' : ''}>${h('使用此模型')}</label>${this.button('remove-mapping', t('删除'), undefined, `data-index="${i}"`, busy)}</div><label class="tool-field">${h('显示名称')}<input data-mapping-name="${i}" maxlength="80" value="${esc(row.name)}" required></label><div class="tool-field"><label for="ai-mapping-model-${i}">${h('实际模型')}</label><div class="ai-model-input"><input id="ai-mapping-model-${i}" data-mapping-model="${i}" maxlength="200" value="${esc(row.model)}" placeholder="${h('填写服务提供的模型 ID，可自定义')}" required>${this.button('open-models', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>', undefined, `class="ai-model-dropdown" data-index="${i}" aria-haspopup="dialog" aria-controls="ai-model-picker" aria-label="${h('选择模型')}" title="${h(this.remoteModels === null ? '请先获取模型列表' : '选择模型')}"`, busy || this.remoteModels === null)}</div></div></div>`).join('')}
      ${this.modelListError ? `<p class="tool-error" role="alert">${esc(this.modelListError)}</p>` : ''}
      ${this.remoteModels !== null ? `<p class="tool-hint ai-model-list-status" role="status">${h('已获取 {0} 个模型，点击输入框右侧箭头选择。', [this.remoteModels.length])}</p><div id="ai-model-picker" class="ai-model-picker" popover="auto" role="dialog" aria-label="${h('选择模型')}"><div class="ai-toolbar"><strong>${h('选择模型')}</strong>${this.button('close-models', t('关闭'))}</div><input id="ai-model-filter" value="${esc(this.modelFilter)}" placeholder="${h('搜索模型')}" aria-label="${h('搜索模型')}"><div class="ai-model-options">${this.modelOptions()}</div></div>` : ''}</section>
      <div class="ai-actions">${this.button('clear-key', t("移除已保存密钥"), undefined, '', busy || !sameEndpoint || !saved?.hasKey)}</div>
      <p class="tool-hint">${h("预设可修改；可用模型与图片能力以服务账号为准。更换地址后请重新填写密钥。新增模型需分别设置密钥。")}</p></fieldset><footer>${this.configError ? `<p class="tool-error" role="alert">${esc(this.configError)}</p>` : this.configNotice ? `<p class="ai-config-notice" role="status">${esc(this.configNotice)}</p>` : ''}<div class="ai-save-actions"><button class="ai-save-primary" type="submit" ${busy ? 'disabled' : ''}>${h("保存配置")}</button>${this.button('test', t("保存并测试"), undefined, 'class="ai-save-test"', busy)}</div></footer></form></dialog>` : ''}
      <p class="tool-hint">${h("密钥保存在系统凭据库。聊天及附件保存在本机；切换服务后发送消息，会将当前会话上下文和引用资料发送给所选服务。连接测试只发送一条测试消息。")}</p>${this.button('clear-history', t("清空聊天记录和附件"), undefined, '', this.requests.size > 0 || !this.ready)}</section>`;
  }
  private modelOptions() {
    const matches = (this.remoteModels ?? []).filter(id => id.toLowerCase().includes(this.modelFilter.toLowerCase()));
    return matches.length ? matches.map(id => this.button('choose-model', esc(id), undefined, `data-model="${esc(id)}" class="ai-model-option ${this.mappings()[this.modelPickerIndex]?.model === id ? 'selected' : ''}"`, this.mappings().some((row, i) => i !== this.modelPickerIndex && row.model === id))).join('') : `<p class="tool-hint">${h('没有匹配的模型，可手动添加映射。')}</p>`;
  }
  noteView(note: Note) {
    const key = `note:${note.id}`;
    return `<div class="ai-inline" data-ai-source="${key}"><div class="ai-actions">${[t("整理内容"), t("提炼摘要"), t("提取待办"), t("继续聊")].map((label, i) => this.button('note', label, undefined, `data-note="${note.id}" data-kind="${i}"`, !this.ready || this.operations.has(key) || !!this.requests.get(this.source(key)?.id ?? ''))).join('')}</div>${this.inlineResult(key)}</div>`;
  }
  screenshotView(path: string) {
    return `<div class="ai-inline"><div class="ai-actions">${[t("解释截图"), t("翻译文字"), t("提取文字"), t("继续聊")].map((label, i) => this.button('screenshot', label, undefined, `data-path="${esc(path)}" data-kind="${i}"`, !this.ready || !this.savedConfig.vision || this.operations.has(path) || !!this.requests.get(this.source(`image:${path}`)?.id ?? ''))).join('')}</div>${!this.savedConfig.vision ? `<p class="tool-hint">${h("请在设置中配置并启用支持图片的 AI 模型。")}</p>` : ''}${this.inlineResult(`image:${path}`)}</div>`;
  }
  private inlineResult(key: string) {
    const s = this.source(key); if (!s) return '';
    const m = this.latest(s); if (!m) return '';
    return `<div class="ai-inline-result"><strong>${h("AI 结果")}</strong><div class="ai-text" data-ai-message="${m.id}">${esc(m.text || (m.status === 'generating' ? t("正在思考…") : ''))}</div>${m.error ? `<p class="tool-error">${esc(m.error)}</p>` : ''}${this.taskView(s)}<div class="ai-actions">${this.requests.has(s.id) ? this.button('stop', t("停止生成"), s) : m.status === 'error' ? this.button('retry', t("重试"), s) : `${this.button('copy', t("复制"), s)}${this.button('save-note', t("另存速记"), s)}${s.source?.noteId && !s.tasks ? this.button('replace', t("替换原文"), s) : ''}`}${s.undo ? this.button('undo', t("撤销替换"), s) : ''}${this.button('continue', t("继续聊"), s)}</div></div>`;
  }
  private taskView(s: Session) {
    if (!s.tasks) return '';
    return `<div class="ai-tasks"><strong>${h("待办候选")}</strong>${s.tasks.length ? s.tasks.map((t, i) => `<label><input type="checkbox" data-ai-task="${i}" data-session="${s.id}" ${t.checked ? 'checked' : ''} ${t.added ? 'disabled' : ''}><input aria-label="${h("待办候选")} ${i + 1}" maxlength="200" data-ai-task-text="${i}" data-session="${s.id}" value="${esc(t.text)}" ${t.added ? 'disabled' : ''}>${t.added ? `<small>${h("已添加")}</small>` : ''}</label>`).join('') : `<p>${h("没有提取到明确待办。")}</p>`}${s.tasks.some(t => !t.added) ? this.button('add-todos', t("添加勾选项"), s, '', this.operations.has(s.id)) : ''}</div>`;
  }
  input(input: HTMLInputElement | HTMLTextAreaElement) {
    if (input.id === 'ai-model-filter') {
      if (this.modelFilter === input.value) return;
      this.modelFilter = input.value;
      const list = document.querySelector('.ai-model-options'); if (list) list.innerHTML = this.modelOptions();
      return;
    }
    if (input.dataset.mappingName !== undefined || input.dataset.mappingModel !== undefined || input.dataset.mappingActive !== undefined) {
      if (this.configBusy) return;
      const rows = this.mappings().map(row => ({ ...row }));
      const i = Number(input.dataset.mappingName ?? input.dataset.mappingModel ?? input.dataset.mappingActive);
      const row = rows[i]; if (!row) return;
      if (input.dataset.mappingActive !== undefined) this.config.model = row.model;
      else if (input.dataset.mappingName !== undefined) row.name = input.value;
      else { if (this.config.model === row.model) this.config.model = input.value; row.model = input.value; }
      this.config.modelMappings = rows; return;
    }
    const configFields: Record<string, keyof Config> = { 'ai-config-name': 'name', 'ai-base-url': 'baseUrl', 'ai-language': 'language' };
    const field = configFields[input.id];
    if (field) {
      if (field === 'baseUrl' && this.config.baseUrl !== input.value) {
        this.resetModelList();
        this.key = '';
        const keyInput = document.querySelector<HTMLInputElement>('#ai-api-key');
        if (keyInput) { keyInput.value = ''; keyInput.placeholder = t("地址已变更，请填写此服务的密钥"); }
      }
      (this.config[field] as string) = input.value; return;
    }
    if (input.id === 'ai-api-key') { this.key = input.value; this.resetModelList(); return; }
    if (input.id === 'ai-vision') { this.config.vision = (input as HTMLInputElement).checked; return; }
    let s = this.session();
    if (input.id === 'ai-input') { s ??= this.create(); s.draft = input.value; }
    else if (input.dataset.session) {
      s = this.sessions.find(s => s.id === input.dataset.session);
      if (s?.tasks && input.dataset.aiTask !== undefined) s.tasks[Number(input.dataset.aiTask)].checked = (input as HTMLInputElement).checked;
      if (s?.tasks && input.dataset.aiTaskText !== undefined) s.tasks[Number(input.dataset.aiTaskText)].text = input.value;
    } else return;
    if (s && !this.historyBusy) {
      const target = s;
      clearTimeout(this.draftTimers.get(s.id));
      this.draftTimers.set(s.id, window.setTimeout(() => { void this.persist(target).catch(e => this.toast(errorText(e))); }, 300));
    }
  }
  async change(input: HTMLInputElement | HTMLSelectElement) {
    if (input.id === 'ai-provider') {
      this.configAvailable();
      const preset = providerPresets.find(p => p.id === input.value);
      if (preset) {
        const model = preset.models[0];
        this.config = { ...this.config, provider: preset.id, name: preset.id === 'custom' ? '' : preset.name, baseUrl: preset.baseUrl, model: model?.id ?? '', vision: model?.vision ?? false, hasKey: false, modelMappings: model ? [{ name: model.id, model: model.id }] : [] };
        this.resetModelList();
        this.key = ''; this.configError = ''; this.changed();
      }
      return true;
    }
    return false;
  }
  private async selectModel(id: string) {
    this.configAvailable();
    this.configBusy = true; this.changed();
    try { this.applyCatalog(await invoke<Catalog>('ai_select_model', { id })); }
    finally { this.configBusy = false; this.changed(); }
  }
  private async fetchModels() {
    this.configAvailable();
    this.configBusy = true; this.fetchingModels = true; this.resetModelList(); this.changed();
    try {
      this.remoteModels = await invoke<string[]>('ai_list_models', { profileId: this.config.id, baseUrl: this.config.baseUrl, apiKey: this.key || null });
      if (!this.mappings().length) this.config.modelMappings = [{ name: '', model: '' }];
    }
    catch (error) { this.modelListError = errorText(error); }
    finally { this.configBusy = false; this.fetchingModels = false; this.changed(); }
  }
  async submit(form: HTMLFormElement) {
    if (form.id === 'ai-settings-form') { if (this.configBusy) return true; await this.saveConfig(); this.editorOpen = false; this.resetModelList(); this.changed(); return true; }
    if (form.id !== 'ai-chat-form') return false;
    if (!this.ready || this.historyBusy) throw new Error(t("AI 数据正在加载或清理，请稍候"));
    this.requireConfig();
    const s = this.session() ?? this.create();
    if (this.requests.has(s.id)) return true;
    const text = (s.draft ?? '').trim();
    if (!text && !s.attachments?.length) { this.toast(t("请输入问题或添加资料")); return true; }
    const attachments = [...(s.attachments ?? [])];
    s.draft = ''; s.attachments = [];
    await this.send(s, text || '请解释这份资料。', attachments);
    return true;
  }
  private async saveConfig(clearKey = false) {
    if (this.configBusy) return;
    if (this.requests.size) throw new Error(t("请等待生成结束或停止后再修改模型配置"));
    this.configBusy = true; this.configError = ''; this.configNotice = ''; this.changed();
    try {
      const id = this.config.id;
      this.applyCatalog(await invoke<Catalog>('ai_save_settings', { settings: this.config, apiKey: this.key || null, clearKey }));
      this.config = structuredClone(this.catalog.profiles.find(p => p.id === id)!); this.editorBaseline = JSON.stringify(this.config); this.key = ''; this.configNotice = t('AI 配置已保存'); this.toast(this.configNotice);
    } catch (e) {
      this.configError = t('保存模型「{0}」失败：{1}', [this.config.name.trim() || t('未命名模型'), errorText(e)]);
      throw new Error(this.configError);
    }
    finally { this.configBusy = false; this.changed(); }
  }
  private requireConfig() {
    if (this.configBusy) throw new Error(t("正在保存或测试 AI 配置，请稍候"));
    if (!this.savedConfig.model) throw new Error(t("请先在设置中配置 AI 服务"));
  }
  private async send(s: Session, text?: string, attachments?: Attachment[], tasks = false) {
    if (this.requests.has(s.id)) return;
    this.requireConfig();
    if (text !== undefined) {
      if (!s.messages.length && s.title === '新对话') s.title = text.slice(0, 24) || t("图片对话");
      s.messages.push({ id: uid(), role: 'user', text, attachments });
    }
    const profileId = this.savedConfig.id;
    const response: AiMessage = { id: uid(), role: 'assistant', text: '', status: 'generating', modelLabel: `${this.savedConfig.name} · ${modelLabel(this.savedConfig)}` };
    const payload = modelMessages(s.messages);
    s.messages.push(response);
    if (tasks) s.taskMessage = response.id;
    const requestId = uid(); this.requests.set(s.id, requestId); this.changed();
    let timer: number | undefined;
    const onDelta = new Channel<string>();
    onDelta.onmessage = delta => {
      response.text += delta;
      if (!timer) timer = window.setTimeout(() => {
        timer = undefined;
        document.querySelectorAll<HTMLElement>(`[data-ai-message="${response.id}"]`).forEach(el => {
          const scroll = el.closest('.ai-messages'); const atBottom = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70 : false;
          el.textContent = response.text;
          if (scroll && atBottom) scroll.scrollTop = scroll.scrollHeight;
        });
      }, 40);
    };
    try {
      await this.persist(s);
      if (this.cancelled.has(requestId)) throw new Error(t("已停止生成"));
      this.started.add(requestId);
      response.text = await invoke<string>('ai_generate', { requestId, profileId, messages: payload, onDelta });
      response.status = 'done';
      if (s.taskMessage === response.id) { s.tasks = parseTasks(response.text); }
    } catch (e) { response.status = 'error'; response.error = errorText(e); }
    finally {
      clearTimeout(timer);
      this.started.delete(requestId);
      try { await this.persist(s); } catch (e) { this.toast(t("保存会话失败：{0}", [errorText(e)])); }
      this.requests.delete(s.id);
      this.cancelled.delete(requestId);
      this.changed();
    }
  }
  private async image(path: string): Promise<Attachment> { return { id: uid(), name: path.split(/[\\/]/).pop() ?? t("截图"), image: await invoke<string>('ai_image', { path }) }; }
  async action(action: string, button: HTMLElement) {
    if (!action.startsWith('ai-')) return false;
    if (!this.ready) throw new Error(t("AI 数据尚未加载完成"));
    if (this.historyBusy) throw new Error(t("正在清理聊天记录，请稍候"));
    const s = this.sessions.find(s => s.id === button.dataset.session) ?? this.session();
    const m = s && (button.dataset.message ? s.messages.find(m => m.id === button.dataset.message) : this.latest(s));
    if (action === 'ai-fetch-models') { await this.fetchModels(); return true; }
    if (action === 'ai-close-editor') { await this.closeEditor(); return true; }
    if (action === 'ai-add-mapping') {
      this.configAvailable(); if (this.mappings().length < 50) this.config.modelMappings = [...this.mappings(), { name: '', model: '' }];
    }
    else if (action === 'ai-remove-mapping') {
      this.configAvailable(); const rows = this.mappings().filter((_, i) => i !== Number(button.dataset.index));
      this.config.modelMappings = rows;
      if (!rows.some(row => row.model === this.config.model)) this.config.model = rows[0]?.model ?? '';
    }
    else if (action === 'ai-preset-mappings') {
      this.configAvailable();
      this.addMappings((providerPresets.find(p => p.id === this.config.provider)?.models ?? []).map(m => ({ name: m.id, model: m.id })));
    }
    else if (action === 'ai-open-models') {
      this.configAvailable();
      const index = Number(button.dataset.index);
      if (this.remoteModels === null || !this.mappings()[index]) return true;
      this.modelPickerIndex = index; this.modelFilter = ''; this.changed();
      const popup = document.querySelector<HTMLElement>('#ai-model-picker');
      const anchor = document.querySelector<HTMLElement>(`[data-mapping-model="${index}"]`)?.closest('.ai-model-input');
      if (popup && anchor) {
        const rect = anchor.getBoundingClientRect();
        popup.style.width = `${Math.min(Math.max(rect.width, 260), window.innerWidth - 24)}px`;
        popup.showPopover();
        popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 12))}px`;
        popup.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 12))}px`;
        popup.addEventListener('keydown', event => {
          if ((event.target as HTMLElement).id === 'ai-model-filter' && (event.key === 'Enter' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const first = popup.querySelector<HTMLButtonElement>('.ai-model-option:not(:disabled)');
            if (event.key === 'Enter') first?.click(); else first?.focus();
          }
        });
        popup.querySelector<HTMLInputElement>('input')?.focus();
      }
      return true;
    }
    else if (action === 'ai-choose-model') {
      this.configAvailable();
      const model = button.dataset.model;
      const rows = this.mappings().map(row => ({ ...row })); const row = rows[this.modelPickerIndex];
      if (!row || !model || !this.remoteModels?.includes(model) || rows.some((r, i) => i !== this.modelPickerIndex && r.model === model)) return true;
      if (this.config.model === row.model) this.config.model = model;
      if (!row.name.trim() || row.name === row.model) row.name = model;
      row.model = model; this.config.modelMappings = rows;
      const index = this.modelPickerIndex; this.modelPickerIndex = -1; this.changed();
      document.querySelector<HTMLInputElement>(`[data-mapping-model="${index}"]`)?.focus();
      return true;
    }
    else if (action === 'ai-close-models') { document.querySelector<HTMLElement>('#ai-model-picker')?.hidePopover(); return true; }
    else if (action === 'ai-add-model') { this.configAvailable(); this.openEditor(this.blankConfig()); }
    else if (action === 'ai-edit-model') {
      this.configAvailable();
      const profile = this.catalog.profiles.find(p => p.id === button.dataset.profile);
      if (profile) this.openEditor(profile);
    }
    else if (action === 'ai-use-model') { await this.selectModel(button.dataset.profile ?? ''); }
    else if (action === 'ai-delete-model') {
      this.configAvailable();
      const profile = this.catalog.profiles.find(p => p.id === button.dataset.profile);
      if (!profile) return true;
      this.configBusy = true; this.changed();
      try {
        if (await confirm(t("删除模型配置「{0}」及其当前地址的密钥？聊天记录会保留。", [profile.name]), { title: t("删除模型配置"), kind: 'warning' })) {
          this.applyCatalog(await invoke<Catalog>('ai_delete_model', { id: profile.id }));
          if (this.config.id === profile.id) { this.config = { ...this.savedConfig }; this.key = ''; this.configError = ''; }
        }
      } finally { this.configBusy = false; this.changed(); }
    }
    else if (action === 'ai-new') { const fresh = this.create(); this.history = false; await this.persist(fresh); }
    else if (action === 'ai-history') this.history = !this.history;
    else if (action === 'ai-select' && s) { this.current = s.id; this.history = false; }
    else if (action === 'ai-continue' && s) { this.current = s.id; this.navigate(); }
    else if (action === 'ai-stop' && s) {
      const requestId = this.requests.get(s.id);
      if (requestId) {
        this.cancelled.add(requestId);
        if (this.started.has(requestId)) await invoke('ai_cancel', { requestId });
      }
    }
    else if (action === 'ai-retry' && s && !this.requests.has(s.id)) {
      const last = this.latest(s); const tasks = last?.id === s.taskMessage;
      if (last?.status === 'error') s.messages.splice(s.messages.indexOf(last), 1);
      await this.send(s, undefined, undefined, tasks);
    }
    else if (action === 'ai-delete' && s && !this.requests.has(s.id)) {
      if (this.operations.size) throw new Error(t("请等待当前操作完成"));
      this.historyBusy = true;
      try {
      if (await confirm(t("删除此会话及其附件？"), { title: t("删除 AI 会话"), kind: 'warning' })) {
        clearTimeout(this.draftTimers.get(s.id)); this.draftTimers.delete(s.id);
        await this.saves.get(s.id)?.catch(() => {});
        await invoke('ai_delete_session', { id: s.id }); this.sessions = this.sessions.filter(item => item.id !== s.id);
        this.saves.delete(s.id);
        if (this.current === s.id) this.current = this.sessions[0]?.id ?? '';
      }
      } finally { this.historyBusy = false; }
    }
    else if (action === 'ai-clear-history' && !this.requests.size) {
      if (this.operations.size) throw new Error(t("请等待当前操作完成"));
      this.historyBusy = true;
      try {
      if (await confirm(t("清空全部 AI 聊天记录与附件？已保存的速记和待办会保留。"), { title: t("清空 AI 历史"), kind: 'warning' })) {
        this.draftTimers.forEach(timer => clearTimeout(timer)); this.draftTimers.clear();
        await Promise.allSettled([...this.saves.values()]);
        await invoke('ai_delete_session', { id: null }); this.sessions = []; this.current = '';
        this.saves.clear();
      }
      } finally { this.historyBusy = false; }
    }
    else if (action === 'ai-test') {
      if (this.configBusy) return true;
      await this.saveConfig(); this.configBusy = true; this.changed();
      try { await invoke('ai_generate', { requestId: uid(), profileId: this.config.id, messages: [{ role: 'user', content: '请仅回复：连接成功' }], onDelta: new Channel<string>() }); this.configNotice = t("连接测试成功（图片能力需用实际截图验证）"); this.toast(this.configNotice); }
      catch (e) { this.configError = errorText(e); }
      finally { this.configBusy = false; }
    }
    else if (action === 'ai-clear-key') {
      this.configAvailable();
      const saved = this.catalog.profiles.find(p => p.id === this.config.id);
      if (saved) { this.config = { ...saved }; this.key = ''; await this.saveConfig(true); }
    }
    else if (action === 'ai-pick-note') this.pickingNotes = !this.pickingNotes;
    else if (action === 'ai-attach-note') {
      const note = this.notes().find(n => n.id === Number(button.dataset.note));
      if (note) { const target = s ?? this.create(); this.attach(target, { id: uid(), name: t("速记：{0}", [note.content.slice(0, 15)]), text: note.content }); await this.persist(target); this.pickingNotes = false; }
    }
    else if (action === 'ai-attach-image') {
      if (!this.savedConfig.vision) throw new Error(t("请配置支持图片的模型"));
      await this.withOperation('attach-image', async () => {
      const path = await open({ multiple: false, filters: [{ name: t("图片"), extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (typeof path === 'string') { const target = s ?? this.create(); this.attach(target, await this.image(path)); await this.persist(target); }
      });
    }
    else if (action === 'ai-remove-attachment' && s) { s.attachments = s.attachments?.filter(a => a.id !== button.dataset.attachment); await this.persist(s); }
    else if (action === 'ai-note') {
      const note = this.notes().find(n => n.id === Number(button.dataset.note)); if (!note) throw new Error(t("速记已删除"));
      const key = `note:${note.id}`; if (this.operations.has(key)) return true;
      this.operations.add(key);
      try {
        let target = this.source(key);
        if (!target || target.source?.original !== note.content) target = this.create(t("速记 · {0}", [note.content.slice(0, 14)]), { key, noteId: note.id, original: note.content });
        const attachment = { id: uid(), name: t("速记原文"), text: note.content };
        if (button.dataset.kind === '3') { this.current = target.id; if (!target.messages.length) this.attach(target, attachment); await this.persist(target); this.navigate(); }
        else { target.tasks = undefined; await this.send(target, [ '整理这段速记，改善结构、保留原意，不虚构信息，结果不超过 2000 字。', '提炼这段速记的摘要与重点，结果不超过 2000 字。', taskPrompt ][Number(button.dataset.kind)], [attachment], button.dataset.kind === '2'); }
      } finally { this.operations.delete(key); this.changed(); }
    }
    else if (action === 'ai-screenshot' && button.dataset.path) {
      const path = button.dataset.path; if (this.operations.has(path)) return true;
      this.operations.add(path); this.changed();
      try {
        let target = this.source(`image:${path}`);
        if (!target) target = this.create(t("截图分析"), { key: `image:${path}` });
        const attachment = target.messages.flatMap(m => m.attachments ?? []).find(a => a.image) ?? await this.image(path);
        if (button.dataset.kind === '3') { this.current = target.id; if (!target.messages.length) this.attach(target, attachment); await this.persist(target); this.navigate(); }
        else await this.send(target, ['请解释这张截图。若包含报错，说明可能原因与排查步骤；不确定的地方请说明。', `请把截图中的文字翻译成${this.savedConfig.language}，尽量保留段落和对应关系。辨认不清处请标注。`, '请提取截图中的文字，保留段落和换行。无法辨认的位置用 [无法辨认] 标注，不要编造。'][Number(button.dataset.kind)], [attachment]);
      } finally { this.operations.delete(path); this.changed(); }
    }
    else if (action === 'ai-copy' && m) { await navigator.clipboard.writeText(m.text); this.toast(t("已复制")); }
    else if (action === 'ai-save-note' && m) await this.withOperation(`save:${m.id}`, async () => {
      await invoke('save_note', { id: null, content: m.text }); await this.refresh(); this.toast(t("已另存为速记"));
    });
    else if (action === 'ai-extract' && s && m) { s.tasks = undefined; await this.send(s, taskPrompt, [{ id: uid(), name: t("待提取内容"), text: m.text }], true); }
    else if (action === 'ai-add-todos' && s) await this.withOperation(s.id, async () => {
      const selected = s.tasks?.filter(t => t.checked && !t.added) ?? [];
      if (!selected.length) throw new Error(t("请先勾选待办"));
      await invoke('ai_add_todos', { texts: selected.map(t => t.text) });
      selected.forEach(t => { t.added = true; t.checked = false; }); await this.persist(s); await this.refresh(); this.toast(t("已添加 {0} 项待办", [selected.length]));
    });
    else if (action === 'ai-replace' && s?.source?.noteId && m) await this.withOperation(s.id, async () => {
      const original = s.source!.original!;
      await invoke('ai_replace_note', { id: s.source!.noteId, expected: original, content: m.text });
      s.undo = { id: s.source!.noteId!, original, replacement: m.text }; s.source!.original = m.text;
      await this.persist(s); await this.refresh(); this.toast(t("已替换原文，可在结果下方撤销"));
    });
    else if (action === 'ai-undo' && s?.undo) await this.withOperation(s.id, async () => {
      await invoke('ai_replace_note', { id: s.undo!.id, expected: s.undo!.replacement, content: s.undo!.original });
      s.source!.original = s.undo!.original; s.undo = undefined; await this.persist(s); await this.refresh(); this.toast(t("已恢复原文"));
    });
    this.changed(); return true;
  }
  private attach(s: Session, attachment: Attachment) {
    if ((s.attachments?.length ?? 0) >= 4) throw new Error(t("每次最多引用 4 份资料"));
    (s.attachments ??= []).push(attachment);
  }
  private async withOperation(key: string, action: () => Promise<void>) {
    if (this.operations.has(key)) return;
    this.operations.add(key); this.changed();
    try { await action(); } finally { this.operations.delete(key); this.changed(); }
  }
}
