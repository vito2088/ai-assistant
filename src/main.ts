import { t as tr, h, languages, getLocale, setLocale } from './i18n';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import './style.css';
import { Tools } from './tools';
import { Ai } from './ai';
import { openSettingsEditor, type SettingsDocument } from './settings-editor';
import { featureGroups, parseVisibility, groupState, setFeatureVisible, visiblePages, availablePage } from './feature-visibility';

type Mode = 'expanded' | 'icon' | 'compact';
type Page = 'document' | 'workbench' | 'tools' | 'ai' | 'settings';
type DocumentSection = 'todo' | 'note';
type Kind = 'project' | 'app';
type Platform = 'windows' | 'macos' | 'linux';
type Todo = { id: number; text: string; completed: boolean; createdAt: number };
type NoteItem = { id: number; content: string; createdAt: number; updatedAt: number };
type Computer = { id: string; name: string; platform: Platform; isCurrent: boolean };
type Launcher = { id: number; computerId: string; kind: Kind; name: string; target: string; editor: string | null; lastOpenedAt: number | null };
type Draft = { id?: number; kind: Kind; name: string; target: string; editor: string };
type ComputerDraft = { id?: string; name: string; platform: Platform };

const windowRef = getCurrentWindow();
const app = document.querySelector<HTMLDivElement>('#app')!;
let visibility = parseVisibility(null);
let savingVisibility = false;
let mode: Mode = 'expanded';
let page: Page = 'document';
let documentSection: DocumentSection = 'todo';
let workbenchSection: Kind = 'project';
let computers: Computer[] = [];
let selectedComputerId = '';
let computerDraft: ComputerDraft | null = null;
let pinned = false;
let autostart = false;
let todos: Todo[] = [];
let todoRevision = 0;
let notes: NoteItem[] = [];
let noteRevision = 0;
let projects: Launcher[] = [];
let apps: Launcher[] = [];
let todoDraft = '';
let todoError = '';
let savingTodo = false;
let compactTodoOpen = false;
let noteDraft = '';
let noteError = '';
let editingNoteId: number | null = null;
let savingNote = false;
let savingEntry = false;
let savingComputer = false;
let updatingAutostart = false;
let savingLanguage = false;
let settingsFile: SettingsDocument | null = null;
let settingsRevision = '';
let reloadingSettings = false;
let settingsDeferred = false;
let draft: Draft | null = null;
let notice = '';
let noticeTimer: number | undefined;
let positionTimer: number | undefined;
let search = '';
let miniDragStart: { x: number; y: number } | null = null;
let suppressMiniExpand = false;
const tools = new Tools(() => {
  if (mode === 'expanded' && (page === 'tools' || page === 'settings')) render();
  else app.querySelectorAll<HTMLElement>('.tools-recording-dot').forEach(dot => { dot.hidden = !tools.recording; });
}, toast, path => visibility.aiChat ? ai.screenshotView(path) : '');
const ai = new Ai(() => { if (mode === 'expanded') render(); }, toast, () => { page = 'ai'; render(); void saveSetting('page', page); }, () => notes, refresh);

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const errorText = (error: unknown) => typeof error === 'string' ? error : error instanceof Error ? error.message : String(error);
const setting = (key: string) => invoke<string | null>('get_setting', { key });
const saveSetting = (key: string, value: string) => invoke('set_setting', { key, value });

function toast(message: string) {
  notice = message;
  clearTimeout(noticeTimer);
  app.querySelector('.toast')?.remove();
  app.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${esc(notice)}</div>`);
  noticeTimer = window.setTimeout(() => { notice = ''; app.querySelector('.toast')?.remove(); }, 3500);
}

function svgIcon(name: 'pin' | 'collapse' | 'minimize' | 'sparkle' | 'close' | 'more' | 'add' | 'expand' | 'list' | 'check') {
  const paths = {
    pin: '<path d="M9 3h6l-1 5 3 4v2H7v-2l3-4-1-5Z"/><path d="M12 14v7"/>',
    collapse: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    minimize: '<path d="M5 16h14"/>',
    sparkle: '<path d="M12 2.5 14.5 9.5 21.5 12 14.5 14.5 12 21.5 9.5 14.5 2.5 12 9.5 9.5Z" fill="currentColor" stroke="none"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    expand: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 16l8-8M11 8h5v5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

async function refresh() {
  const todoVersion = todoRevision;
  const noteVersion = noteRevision;
  const [todoResult, noteResult, computersResult] = await Promise.allSettled([
    invoke<Todo[]>('list_todos'),
    invoke<NoteItem[]>('list_notes'),
    invoke<Computer[]>('list_computers'),
  ]);
  if (todoResult.status === 'fulfilled' && todoVersion === todoRevision) todos = todoResult.value;
  if (noteResult.status === 'fulfilled' && noteVersion === noteRevision) notes = noteResult.value;
  if (computersResult.status === 'fulfilled') {
    computers = computersResult.value;
    if (!computers.some(c => c.id === selectedComputerId)) selectedComputerId = computers.find(c => c.isCurrent)?.id ?? computers[0]?.id ?? '';
  }
  const [projectResult, appResult] = await Promise.allSettled(selectedComputerId ? [
    invoke<Launcher[]>('list_launchers', { kind: 'project', computerId: selectedComputerId }),
    invoke<Launcher[]>('list_launchers', { kind: 'app', computerId: selectedComputerId }),
  ] : [Promise.resolve([] as Launcher[]), Promise.resolve([] as Launcher[])]);
  if (projectResult.status === 'fulfilled') projects = projectResult.value;
  if (appResult.status === 'fulfilled') apps = appResult.value;
  render();
  const failure = [todoResult, noteResult, computersResult, projectResult, appResult].find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

async function applyMode(next: Mode, persist = true) {
  if (next === 'compact' && !visibility.todo) next = 'expanded';
  if (next !== 'compact') compactTodoOpen = false;
  mode = next;
  const size = next === 'expanded' ? [430, 620] : next === 'compact' ? [360, 360] : [184, 184];
  await windowRef.setSize(new LogicalSize(size[0], size[1]));
  if (persist) await saveSetting('mode', next);
  render();
}

async function togglePin() {
  const next = !pinned;
  await windowRef.setAlwaysOnTop(next);
  pinned = next;
  render();
  await saveSetting('pinned', String(next));
  toast(next ? tr("已固定位置并置顶") : tr("已解除固定"));
}

function aiBadge() {
  return visibility.aiChat && ai.hasActiveModel() ? `<span class="brand-ai-badge" title="${h('AI 功能已启用')}" aria-label="${h('AI 功能已启用')}">AI</span>` : '';
}
function topBar() {
  return `<header class="topbar" data-drag>
    <div class="brand"><span class="brand-mark">${svgIcon('sparkle')}${aiBadge()}</span><span>${h("小助手")}</span></div>
    <div class="window-actions">
      <button class="icon-button ${pinned ? 'active' : ''}" data-action="pin" title="${pinned ? tr("解除固定与置顶") : tr("固定位置并置顶")}" aria-label="${pinned ? tr("解除固定与置顶") : tr("固定位置并置顶")}" aria-pressed="${pinned}">${svgIcon('pin')}</button>
      <button class="icon-button" data-action="icon" title="${h("收起为桌面小图标")}" aria-label="${h("收起为桌面小图标")}">${svgIcon('collapse')}</button>
      <button class="icon-button" data-action="minimize" title="${h("最小化")}" aria-label="${h("最小化")}">${svgIcon('minimize')}</button>
      <button class="icon-button close-button" data-action="quit" title="${h("退出小助手")}" aria-label="${h("退出小助手")}">${svgIcon('close')}</button>
    </div>
  </header>`;
}

function todoForm() {
  return `<form id="todo-form" class="inline-form">
    <input name="text" maxlength="200" autocomplete="off" placeholder="${h("写下要做的事…")}" aria-label="${h("待办内容")}" value="${esc(todoDraft)}" />
    <button type="submit" class="primary small" ${savingTodo ? 'disabled' : ''}>${savingTodo ? tr("添加中…") : tr("添加")}</button>
  </form>${todoError ? `<p class="form-error" role="alert">${esc(todoError)}</p>` : ''}`;
}

function todoPage() {
  return `<section class="page-body">
    ${todoForm()}
    <div class="summary"><span>${todos.filter(t => !t.completed).length} ${h("项待完成")}</span><button class="subtle-link" data-action="compact">${h("紧凑列表 ↗")}</button></div>
    <div class="list scroll-area">${todos.length ? todos.map(t => `<div class="todo-row ${t.completed ? 'done' : ''}">
      <button class="check ${t.completed ? 'checked' : ''}" data-action="toggle-todo" data-id="${t.id}" aria-label="${t.completed ? tr("标记未完成") : tr("标记完成")}">${t.completed ? svgIcon('check') : ''}</button>
      <span class="todo-text">${esc(t.text)}</span>
      <button class="row-menu" data-action="delete-todo" data-id="${t.id}" title="${h("删除")}" aria-label="${h("删除待办")}">${svgIcon('close')}</button>
    </div>`).join('') : `<div class="empty"><div class="empty-icon">✓</div><strong>${h("还没有待办")}</strong><span>${h("在上方输入框写下第一件事")}</span></div>`}</div>
  </section>`;
}

function notesPage() {
  const noteTime = (timestamp: number) => new Date(timestamp).toLocaleString(getLocale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<section class="page-body">
    <form id="note-form" class="note-composer">
      <textarea name="content" maxlength="2000" placeholder="${h("随手记下想法、线索或临时信息…")}" aria-label="${h("速记内容")}">${esc(noteDraft)}</textarea>
      <div class="note-composer-actions">${editingNoteId !== null ? `<button type="button" class="text-button" data-action="cancel-note-edit">${h("取消编辑")}</button>` : '<span></span>'}<button type="submit" class="primary small" ${savingNote ? 'disabled' : ''}>${savingNote ? tr("保存中…") : editingNoteId !== null ? tr("保存修改") : tr("保存速记")}</button></div>
    </form>
    ${noteError ? `<p class="form-error" role="alert">${esc(noteError)}</p>` : ''}
    <div class="summary"><span>${notes.length} ${h("条速记")}</span></div>
    <div class="list scroll-area note-list ${notes.length ? '' : 'is-empty'}">${notes.length ? notes.map(note => `<article class="note-row">
      <div class="note-content">${esc(note.content)}</div>
      <div class="note-meta"><time>${noteTime(note.updatedAt)}</time><div><button data-action="edit-note" data-id="${note.id}">${h("编辑")}</button><button data-action="delete-note" data-id="${note.id}">${h("删除")}</button></div></div>
      ${visibility.aiChat ? ai.noteView(note) : ''}
    </article>`).join('') : `<div class="empty"><div class="empty-icon">✎</div><strong>${h("还没有速记")}</strong><span>${h("在上方输入，随时保存一条")}</span></div>`}</div>
  </section>`;
}

function documentPage() {
  return `<div class="document-page"><nav class="document-tabs" aria-label="${h("文档子栏目")}">
    ${visibility.todo ? `<button class="document-tab ${documentSection === 'todo' ? 'selected' : ''}" data-action="document-section" data-section="todo" aria-current="${documentSection === 'todo' ? 'page' : 'false'}">${h("待办")}</button>` : ''}
    ${visibility.note ? `<button class="document-tab ${documentSection === 'note' ? 'selected' : ''}" data-action="document-section" data-section="note" aria-current="${documentSection === 'note' ? 'page' : 'false'}">${h("速记")}</button>` : ''}
  </nav>${documentSection === 'todo' ? todoPage() : notesPage()}</div>`;
}

function workbenchPage() {
  const selected = computers.find(c => c.id === selectedComputerId);
  const platformName = (platform: Platform) => ({ windows: 'Windows', macos: 'macOS', linux: 'Linux' })[platform];
  return `<div class="workbench-page ${draft ? 'editing-entry' : ''}">
    <div class="computer-switcher"><div class="computer-list" aria-label="${h("电脑列表")}">${computers.map(c => `<button class="computer-chip ${c.id === selectedComputerId ? 'selected' : ''}" data-action="select-computer" data-computer-id="${esc(c.id)}" aria-pressed="${c.id === selectedComputerId}" title="${esc(c.name)} · ${platformName(c.platform)}"><strong>${esc(c.name)}</strong><span>${c.isCurrent ? tr("本机") : tr("待绑定")}</span></button>`).join('')}</div><button class="computer-add" data-action="new-computer" title="${h("添加电脑")}" aria-label="${h("添加电脑")}">${svgIcon('add')}</button></div>
    ${computerDraft ? `<form id="computer-form" class="computer-form ${computerDraft.id ? 'is-rename' : ''}"><div class="form-title"><strong>${computerDraft.id ? tr("电脑改名") : tr("添加电脑档案")}</strong><button type="button" class="text-button" data-action="cancel-computer">${h("取消")}</button></div>
      <input id="computer-name" aria-label="${h("电脑名称")}" maxlength="80" required placeholder="${h("例如：家用电脑")}" value="${esc(computerDraft.name)}" />
      ${computerDraft.id ? '' : `<select id="computer-platform" aria-label="${h("电脑系统")}"><option value="windows" ${computerDraft.platform === 'windows' ? 'selected' : ''}>Windows</option><option value="macos" ${computerDraft.platform === 'macos' ? 'selected' : ''}>macOS</option><option value="linux" ${computerDraft.platform === 'linux' ? 'selected' : ''}>Linux</option></select>`}
      <button type="submit" class="primary small">${computerDraft.id ? tr("保存名称") : tr("添加")}</button></form>` : ''}
    ${selected ? `<div class="computer-toolbar"><span>${platformName(selected.platform)} · ${selected.isCurrent ? tr("当前电脑") : tr("待绑定到另一台电脑")}</span><div><button data-action="rename-computer" title="${h("重命名")}">${h("改名")}</button>${selected.isCurrent ? '' : `<button data-action="delete-computer" title="${h("删除电脑档案")}">${h("删除")}</button>`}</div></div>
    <nav class="document-tabs workbench-tabs" aria-label="${h("工作台子栏目")}">${visibility.project ? `<button class="document-tab ${workbenchSection === 'project' ? 'selected' : ''}" data-action="workbench-section" data-section="project">${h("项目")}</button>` : ''}${visibility.app ? `<button class="document-tab ${workbenchSection === 'app' ? 'selected' : ''}" data-action="workbench-section" data-section="app">${h("应用")}</button>` : ''}${selected.isCurrent ? `<button class="workbench-add" data-action="new-entry" data-kind="${workbenchSection}" title="${h("添加{0}", [workbenchSection === 'project' ? tr("项目") : tr("应用")])}" aria-label="${h("添加{0}", [workbenchSection === 'project' ? tr("项目") : tr("应用")])}">${h("添加{0}", [workbenchSection === 'project' ? tr("项目") : tr("应用")])}</button>` : ''}</nav>
    ${selected.isCurrent ? entryPage(workbenchSection) : `<section class="remote-computer"><strong>${h("这台电脑尚未绑定")}</strong><p>${h("项目与应用的路径属于各自的电脑。以后开启同步后，可在“{0}”上绑定此档案并添加入口。", [selected.name])}</p></section>`}` : `<div class="empty"><strong>${h("还没有电脑档案")}</strong></div>`}
  </div>`;
}

function entryPage(kind: Kind) {
  const items = (kind === 'project' ? projects : apps).filter(x => `${x.name} ${x.target}`.toLowerCase().includes(search.toLowerCase()));
  const title = kind === 'project' ? tr("项目") : tr("应用");
  return `<section class="page-body workbench-entries">
    ${draft?.kind === kind ? entryForm() : ''}
    <input class="search" id="entry-search" placeholder="${h("搜索{0}…", [title])}" value="${esc(search)}" />
    <div class="list scroll-area">${items.length ? items.map(item => `<div class="entry-item"><div class="entry-row">
      <div class="entry-icon">${kind === 'project' ? '⌘' : '◈'}</div>
      <div class="entry-meta"><strong>${esc(item.name)}</strong><span title="${esc(item.target)}">${esc(item.target)}</span></div>
      <button class="open-button" data-action="launch" data-id="${item.id}">${h("打开 ↗")}</button>
      <button class="row-menu" data-action="entry-menu" data-id="${item.id}" data-kind="${kind}" title="${h("更多操作")}" aria-label="${h("{0}的更多操作", [item.name])}" aria-haspopup="true" aria-expanded="false">${svgIcon('more')}</button>
    </div></div>`).join('') : `<div class="empty"><div class="empty-icon">${kind === 'project' ? '⌘' : '◈'}</div><strong>${search ? tr("没有找到匹配项") : tr("还没有{0}", [title])}</strong><span>${search ? tr("试试上方的添加按钮") : tr("点击上方“添加{0}”", [title])}</span></div>`}</div>
  </section>`;
}

function entryForm() {
  if (!draft) return '';
  return `<form id="entry-form" class="entry-form">
    <div class="form-title"><strong>${h(draft.id ? "编辑{0}" : "添加{0}", [draft.kind === 'project' ? tr("项目") : tr("应用")])}</strong><button type="button" class="text-button" data-action="cancel-entry">${h("取消")}</button></div>
    <label>${h("名称")}<input id="draft-name" value="${esc(draft.name)}" maxlength="100" required placeholder="${h("输入显示名称")}" /></label>
    <label>${draft.kind === 'project' ? tr("项目文件夹") : tr("应用入口")}<div class="path-field"><input id="draft-target" value="${esc(draft.target)}" required placeholder="${draft.kind === 'project' ? tr("选择项目文件夹") : tr("选择程序文件或应用")}" /><button type="button" data-action="pick-target">${h("浏览")}</button></div></label>
    ${draft.kind === 'project' ? `<label>${h("编辑器")}<div class="path-field"><input id="draft-editor" value="${esc(draft.editor)}" required placeholder="${h("选择编辑器程序")}" /><button type="button" data-action="pick-editor">${h("浏览")}</button></div></label>` : ''}
    <div class="form-actions">${draft.id ? `<button type="button" class="danger-link" data-action="delete-entry">${h("移除入口")}</button>` : '<span></span>'}<button type="submit" class="primary small">${h("保存")}</button></div>
  </form>`;
}

function featureSettings() {
  return `<div class="settings-card feature-settings"><div><strong id="feature-settings-title">${h("功能显示")}</strong><p>${h("勾选需要显示的功能，自动保存；隐藏不删除数据。")}</p></div>
    <ul class="feature-tree" aria-labelledby="feature-settings-title">${featureGroups.map(group => {
      const state = groupState(visibility, group.id);
      return `<li><label class="feature-parent"><input type="checkbox" data-feature="${group.id}" ${state.checked ? 'checked' : ''} ${savingVisibility ? 'disabled' : ''}><span>${h(group.label)}</span><small>${group.children.filter(child => visibility[child.id]).length}/${group.children.length}</small></label>
        <ul>${group.children.map(child => `<li><label><input type="checkbox" data-feature="${child.id}" ${visibility[child.id] ? 'checked' : ''} ${savingVisibility ? 'disabled' : ''}><span>${h(child.label)}</span></label></li>`).join('')}</ul></li>`;
    }).join('')}</ul><p class="feature-settings-note">${h("设置始终显示，可随时恢复隐藏的功能。")}</p>
  </div>`;
}

function settingsPage() {
  return `<section class="page-body settings-page">
    <div class="settings-card json-settings-card"><div><strong>${h('设置文件（JSON）')}</strong><p>${h('可直接编辑 settings.json，修正后重新加载即可生效。')}</p>${settingsFile ? `<p class="json-path">${esc(settingsFile.path)}</p>` : ''}</div>${settingsFile?.error ? `<div class="json-file-error" role="alert"><strong>${h('配置文件有误，当前使用默认配置')}</strong><p>${esc(settingsFile.error)}</p><p>${h('原文件已保留，修正后重新加载。')}</p></div>` : ''}${settingsDeferred ? `<p>${h('部分设置将在当前任务结束后重新加载时生效')}</p>` : ''}<div class="json-settings-actions"><button data-action="edit-settings-json">${h('编辑 JSON')}</button><button data-action="open-settings-external">${h('外部编辑器打开')}</button><button data-action="reveal-settings-json">${h('打开文件夹')}</button><button data-action="reload-settings-json" ${reloadingSettings ? 'disabled' : ''}>${h('重新加载')}</button></div></div>
    <div class="settings-card language-settings"><div><strong>${h('界面语言')}</strong><p>${h('选择后立即生效，下次启动会保留')}</p></div><select id="ui-language" aria-label="${h('界面语言')}" ${savingLanguage ? 'disabled' : ''}>${languages.map(language => `<option value="${language.id}" ${language.id === getLocale() ? 'selected' : ''}>${language.name}</option>`).join('')}</select></div>
    <div class="settings-card"><div><strong>${h("开机启动")}</strong><p>${h("登录系统后自动打开小助手")}</p></div><label class="switch"><input type="checkbox" id="autostart-toggle" ${autostart ? 'checked' : ''} ${updatingAutostart ? 'disabled' : ''} /><span></span></label></div>
    <div class="settings-card"><div><strong>${h("固定并置顶")}</strong><p>${h("锁定位置，显示在普通窗口上方")}</p></div><label class="switch"><input type="checkbox" id="pin-toggle" ${pinned ? 'checked' : ''} /><span></span></label></div>
    ${featureSettings()}
    ${tools.shortcutSettingsView()}
    ${tools.settingsView()}
    ${ai.settingsView()}
    <div class="settings-note">${h("数据保存在本机。最小化后可点击任务栏图标恢复，也可通过系统托盘显示或退出应用。")}</div>
  </section>`;
}

function expanded() {
  return `<div class="shell expanded-shell">${topBar()}<nav class="tabs" style="grid-template-columns:repeat(${visiblePages(visibility).length},minmax(0,1fr))">
    ${visiblePages(visibility).map(p => `<button class="tab ${page === p ? 'selected' : ''}" data-action="page" data-page="${p}">${({ document: tr("文档"), workbench: tr("工作台"), tools: tr("工具"), ai: 'AI', settings: tr("设置") } as Record<Page, string>)[p]}${p === 'tools' ? `<span class="tools-recording-dot recording-dot" ${tools.recording ? '' : 'hidden'} aria-label="${h("正在录屏")}"></span>` : ''}</button>`).join('')}
  </nav>${page === 'document' ? documentPage() : page === 'workbench' ? workbenchPage() : page === 'tools' ? tools.view() : page === 'ai' ? ai.view() : settingsPage()}<footer class="footer"><span>DESKTOP ASSISTANT</span><span>v0.1</span></footer></div>`;
}

function iconView() {
  return `<div class="mini-stage"><button class="mini-orb" data-action="expand" title="${h("点击展开，拖动可移动小图标")}" aria-label="${h("点击展开，拖动可移动小图标")}">${svgIcon('sparkle')}${aiBadge()}</button>
    <div class="orbit-actions">
      <button class="orbit up" data-action="expand" title="${h("展开")}">${svgIcon('expand')}<small>${h("展开")}</small></button>
      ${visibility.todo ? `<button class="orbit right" data-action="new-todo" title="${h("新增待办")}">${svgIcon('add')}<small>${h("新增")}</small></button>` : ''}
      <button class="orbit down ${pinned ? 'on' : ''}" data-action="pin" title="${pinned ? tr("解除固定") : tr("固定")}" aria-pressed="${pinned}">${svgIcon('pin')}<small>${h("固定")}</small></button>
      ${visibility.todo ? `<button class="orbit left" data-action="compact" title="${h("紧凑列表")}">${svgIcon('list')}<small>${h("紧凑")}</small></button>` : ''}
    </div>
  </div>`;
}

function compactView() {
  const remaining = todos.filter(t => !t.completed).length;
  return `<div class="shell compact-shell"><header class="compact-head" data-drag><span class="compact-brand"><span class="compact-logo">${svgIcon('sparkle')}${aiBadge()}</span><span>${h("待办")}</span><small>${remaining} ${h("项待完成")}</small></span><div class="window-actions"><button class="icon-button ${pinned ? 'active' : ''}" data-action="pin" title="${pinned ? tr("解除固定与置顶") : tr("固定位置并置顶")}" aria-label="${pinned ? tr("解除固定与置顶") : tr("固定位置并置顶")}" aria-pressed="${pinned}">${svgIcon('pin')}</button><button class="icon-button" data-action="icon" title="${h("收起为桌面小图标")}" aria-label="${h("收起为桌面小图标")}">${svgIcon('collapse')}</button><button class="icon-button close-button" data-action="quit" title="${h("退出小助手")}" aria-label="${h("退出小助手")}">${svgIcon('close')}</button></div></header>
    <div class="compact-list scroll-area">${todos.length ? todos.map(t => `<div class="compact-row ${t.completed ? 'done' : ''}"><button class="check ${t.completed ? 'checked' : ''}" data-action="toggle-todo" data-id="${t.id}" aria-label="${t.completed ? tr("标记未完成") : tr("标记完成")}">${t.completed ? svgIcon('check') : ''}</button><span title="${esc(t.text)}">${esc(t.text)}</span><button class="row-menu" data-action="delete-todo" data-id="${t.id}" title="${h("删除待办")}" aria-label="${h("删除待办：")}${esc(t.text)}">${svgIcon('close')}</button></div>`).join('') : `<div class="compact-empty">${h("还没有待办，点击下方新增")}</div>`}</div>
    <div class="compact-foot"><button data-action="expand">${h("展开主界面")}</button><button data-action="new-todo">${h("＋ 新增")}</button><button data-action="minimize">${h("最小化")}</button></div>
    ${compactTodoOpen ? `<dialog class="compact-todo-dialog" aria-labelledby="compact-todo-title"><div class="compact-dialog-heading"><strong id="compact-todo-title">${h("新增待办")}</strong><button class="icon-button" data-action="cancel-compact-todo" title="${h("关闭")}" aria-label="${h("关闭新增待办")}" ${savingTodo ? 'disabled' : ''}>${svgIcon('close')}</button></div>${todoForm()}</dialog>` : ''}
  </div>`;
}

function normalizeNavigation() {
  page = availablePage(visibility, page);
  if (!visibility[documentSection]) documentSection = visibility.todo ? 'todo' : 'note';
  if (!visibility[workbenchSection]) workbenchSection = visibility.project ? 'project' : 'app';
  tools.setVisibleSections(featureGroups.find(group => group.id === 'tools')!.children.filter(child => visibility[child.id]).map(child => child.id));
}

const scrollPositions = new Map<string, { top: number; bottom: boolean }>();
let renderedPage: Page = page;
function render() {
  normalizeNavigation();
  app.querySelectorAll<HTMLElement>('.scroll-area,.tools-content,.capture-panel').forEach(el => {
    scrollPositions.set(`${renderedPage}:${el.dataset.scrollKey ?? el.className}`, { top: el.scrollTop, bottom: el.scrollHeight - el.scrollTop - el.clientHeight < 70 });
  });
  renderedPage = page;
  const active = document.activeElement;
  const focus = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const settingsScroll = app.querySelector('.settings-page')?.scrollTop ?? 0;
  const focusedFeature = document.activeElement instanceof HTMLInputElement ? document.activeElement.dataset.feature : undefined;
  app.innerHTML = (mode === 'expanded' ? expanded() : mode === 'compact' ? compactView() : iconView()) + (notice ? `<div class="toast" role="status">${esc(notice)}</div>` : '');
  if (page === 'settings' && settingsFile?.error) {
    app.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('.settings-page input,.settings-page button,.settings-page select,.settings-page textarea').forEach(control => {
      if (!control.closest('.json-settings-card')) control.disabled = true;
    });
  }
  ai.restoreEditor();
  app.querySelectorAll<HTMLElement>('.scroll-area,.tools-content,.capture-panel').forEach(el => {
    const old = scrollPositions.get(`${page}:${el.dataset.scrollKey ?? el.className}`);
    if (old) el.scrollTop = el.classList.contains('ai-messages') && old.bottom ? el.scrollHeight : old.top;
    else if (el.classList.contains('ai-messages')) el.scrollTop = el.scrollHeight;
  });
  if (focus?.id) {
    const input = document.getElementById(focus.id);
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus({ preventScroll: true });
      if (focus.start !== null && focus.end !== null) input.setSelectionRange(focus.start, focus.end);
    }
  }
  for (const group of featureGroups) {
    const input = app.querySelector<HTMLInputElement>(`[data-feature="${group.id}"]`);
    if (input) input.indeterminate = groupState(visibility, group.id).partial;
  }
  const settingsBody = app.querySelector('.settings-page');
  if (settingsBody) settingsBody.scrollTop = settingsScroll;
  if (focusedFeature) app.querySelector<HTMLInputElement>(`[data-feature="${focusedFeature}"]`)?.focus({ preventScroll: true });
  const dialog = app.querySelector<HTMLDialogElement>('.compact-todo-dialog');
  if (dialog) { dialog.showModal(); dialog.querySelector<HTMLInputElement>('input')?.focus(); }
}

function closeCompactTodo() {
  if (savingTodo) return;
  compactTodoOpen = false;
  todoError = '';
  render();
  app.querySelector<HTMLButtonElement>('.compact-foot [data-action="new-todo"]')?.focus();
}

function closeEntryMenus() {
  app.querySelector('.entry-popover')?.remove();
  app.querySelectorAll<HTMLElement>('.entry-row .row-menu[aria-expanded="true"]').forEach(button => { button.setAttribute('aria-expanded', 'false'); });
}

function toggleEntryMenu(button: HTMLElement) {
  const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
  closeEntryMenus();
  if (!shouldOpen) return;
  const kind = button.dataset.kind as Kind;
  const id = Number(button.dataset.id);
  const entry = (kind === 'project' ? projects : apps).find(item => item.id === id);
  const shell = app.querySelector<HTMLElement>('.shell');
  if (!entry || !shell) return;
  const menu = document.createElement('div');
  menu.className = 'entry-popover';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', tr("{0}的操作", [entry.name]));
  menu.innerHTML = `<button data-action="edit-entry" data-id="${id}" data-kind="${kind}">${h("编辑")}</button><button class="danger" data-action="remove-entry" data-id="${id}" data-kind="${kind}">${h("删除")}</button>`;
  app.append(menu);
  const anchor = button.getBoundingClientRect();
  const bounds = shell.getBoundingClientRect();
  const popup = menu.getBoundingClientRect();
  const left = Math.max(bounds.left + 8, Math.min(anchor.right - popup.width, bounds.right - popup.width - 8));
  const below = anchor.bottom + 6 + popup.height <= bounds.bottom - 8;
  menu.style.left = `${left}px`;
  menu.style.top = `${below ? anchor.bottom + 6 : anchor.top - popup.height - 6}px`;
  button.setAttribute('aria-expanded', 'true');
}

async function runAction(action: string, button: HTMLElement) {
  if (await ai.action(action, button)) return;
  if (await tools.action(action, button)) return;
  const id = Number(button.dataset.id);
  switch (action) {
    case 'edit-settings-json': await openSettingsEditor(() => reloadFileSettings()); break;
    case 'open-settings-external': await invoke('open_settings_external'); break;
    case 'reveal-settings-json': await invoke('read_settings_file'); await invoke('reveal_settings_file'); break;
    case 'reload-settings-json': await reloadFileSettings(); break;
    case 'page':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm(tr("当前项目或应用尚未保存，确定离开吗？"))) break;
      if (computerDraft?.name && !confirm(tr("电脑档案尚未保存，确定离开吗？"))) break;
      page = button.dataset.page as Page; if (page === 'tools') tools.showHome(); search = ''; draft = null; computerDraft = null; await saveSetting('page', page); render(); if (page === 'settings') await reloadFileSettings(); break;
    case 'document-section':
      documentSection = button.dataset.section as DocumentSection;
      await saveSetting('document_section', documentSection);
      render(); break;
    case 'workbench-section':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm(tr("当前入口尚未保存，确定切换吗？"))) break;
      workbenchSection = button.dataset.section as Kind; draft = null; search = '';
      await saveSetting('workbench_section', workbenchSection); render(); break;
    case 'select-computer':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm(tr("当前入口尚未保存，确定切换吗？"))) break;
      if (computerDraft?.name && !confirm(tr("电脑档案尚未保存，确定切换吗？"))) break;
      selectedComputerId = button.dataset.computerId ?? ''; draft = null; search = ''; computerDraft = null;
      await saveSetting('selected_computer_id', selectedComputerId);
      await refresh(); break;
    case 'new-computer':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm(tr("当前入口尚未保存，确定添加电脑吗？"))) break;
      draft = null;
      computerDraft = { name: '', platform: computers.find(c => c.isCurrent)?.platform ?? 'windows' };
      render(); app.querySelector<HTMLInputElement>('#computer-name')?.focus(); break;
    case 'rename-computer': {
      const computer = computers.find(c => c.id === selectedComputerId);
      if (computer) { computerDraft = { id: computer.id, name: computer.name, platform: computer.platform }; render(); app.querySelector<HTMLInputElement>('#computer-name')?.focus(); }
      break;
    }
    case 'cancel-computer': computerDraft = null; render(); break;
    case 'delete-computer': {
      const computer = computers.find(c => c.id === selectedComputerId);
      if (!computer || computer.isCurrent || !confirm(tr("删除电脑档案“{0}”及其项目、应用入口？", [computer.name]))) break;
      await invoke('delete_computer', { id: computer.id });
      selectedComputerId = computers.find(c => c.isCurrent)?.id ?? '';
      await saveSetting('selected_computer_id', selectedComputerId);
      await refresh(); toast(tr("电脑档案已删除")); break;
    }
    case 'expand': await applyMode('expanded'); break;
    case 'icon': await applyMode('icon'); break;
    case 'compact': await applyMode('compact'); break;
    case 'pin': await togglePin(); break;
    case 'minimize': await windowRef.minimize(); break;
    case 'quit': await tools.beforeQuit(); await invoke('quit_app'); break;
    case 'new-todo':
      if (!visibility.todo) break;
      if (mode === 'compact') { compactTodoOpen = true; todoError = ''; render(); break; }
      page = 'document'; documentSection = 'todo'; todoError = '';
      if (mode !== 'expanded') await applyMode('expanded'); else render();
      app.querySelector<HTMLInputElement>('#todo-form input')?.focus();
      await Promise.all([saveSetting('page', 'document'), saveSetting('document_section', 'todo')]);
      break;
    case 'cancel-compact-todo': closeCompactTodo(); break;
    case 'edit-note': {
      const note = notes.find(item => item.id === id);
      if (!note) break;
      if (noteDraft.trim() && editingNoteId !== id && !confirm(tr("当前输入的速记尚未保存，确定改为编辑这条吗？"))) break;
      editingNoteId = id; noteDraft = note.content; noteError = ''; render();
      app.querySelector<HTMLTextAreaElement>('#note-form textarea')?.focus();
      break;
    }
    case 'cancel-note-edit': noteDraft = ''; noteError = ''; editingNoteId = null; render(); break;
    case 'delete-note': {
      const note = notes.find(item => item.id === id);
      if (!note || !confirm(tr("删除这条速记？"))) break;
      await invoke('delete_note', { id });
      noteRevision++;
      notes = notes.filter(item => item.id !== id);
      if (editingNoteId === id) { editingNoteId = null; noteDraft = ''; noteError = ''; }
      render(); toast(tr("速记已删除")); break;
    }
    case 'toggle-todo':
      await invoke('set_todo_completed', { id, completed: !todos.find(t => t.id === id)?.completed });
      await refresh(); break;
    case 'delete-todo': {
      const todo = todos.find(t => t.id === id);
      if (!todo || !confirm(tr("删除待办“{0}”？", [todo.text]))) break;
      await invoke('delete_todo', { id });
      todoRevision++;
      todos = todos.filter(item => item.id !== id);
      render(); toast(tr("待办已删除")); break;
    }
    case 'new-entry': draft = { kind: button.dataset.kind as Kind, name: '', target: '', editor: '' }; render(); app.querySelector<HTMLInputElement>('#draft-name')?.focus(); break;
    case 'entry-menu': toggleEntryMenu(button); break;
    case 'edit-entry': {
      const kind = button.dataset.kind as Kind;
      const entry = (kind === 'project' ? projects : apps).find(x => x.id === id);
      if (entry) draft = { id, kind, name: entry.name, target: entry.target, editor: entry.editor ?? '' };
      render(); break;
    }
    case 'cancel-entry': draft = null; render(); break;
    case 'pick-target':
    case 'pick-editor': {
      if (!draft) break;
      const directory = action === 'pick-target' && draft.kind === 'project';
      const selected = await open({ multiple: false, directory, title: directory ? tr("选择项目文件夹") : tr("选择程序或应用") });
      if (typeof selected === 'string') {
        const field = action === 'pick-editor' ? 'editor' : 'target';
        draft[field] = selected;
        if (field === 'target' && !draft.name) draft.name = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
        render();
      }
      break;
    }
    case 'delete-entry':
      if (draft?.id && confirm(tr("从小助手移除“{0}”？磁盘文件不会删除。", [draft.name]))) {
        await invoke('delete_launcher', { id: draft.id }); draft = null; await refresh(); toast(tr("入口已移除"));
      }
      break;
    case 'remove-entry': {
      const kind = button.dataset.kind as Kind;
      const entry = (kind === 'project' ? projects : apps).find(item => item.id === id);
      if (!entry || !confirm(tr("从小助手移除“{0}”？磁盘文件不会删除。", [entry.name]))) break;
      await invoke('delete_launcher', { id });
      if (draft?.id === id && draft.kind === kind) draft = null;
      await refresh(); toast(tr("入口已移除")); break;
    }
    case 'launch': await invoke('launch_entry', { id }); await refresh(); toast(tr("已发送打开请求")); break;
  }
}

app.addEventListener('click', async event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!button) { closeEntryMenus(); return; }
  if (button.dataset.action !== 'entry-menu') closeEntryMenus();
  if (button.classList.contains('mini-orb') && suppressMiniExpand) { suppressMiniExpand = false; return; }
  try { await runAction(button.dataset.action!, button); }
  catch (error) { toast(errorText(error)); }
});

window.addEventListener('keydown', event => {
  tools.keydown(event);
  if (event.key === 'Escape') closeEntryMenus();
});

app.addEventListener('cancel', event => {
  if ((event.target as HTMLElement).matches('.compact-todo-dialog')) {
    event.preventDefault();
    closeCompactTodo();
  }
}, true);

app.addEventListener('scroll', closeEntryMenus, true);
window.addEventListener('resize', closeEntryMenus);

app.addEventListener('mousedown', event => {
  if (pinned || event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest('button, input, textarea, select, a')) return;
  if (target.closest('[data-drag]')) void windowRef.startDragging();
});

app.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !(event.target as HTMLElement).closest('.mini-orb')) return;
  suppressMiniExpand = false;
  if (!pinned) miniDragStart = { x: event.screenX, y: event.screenY };
});

window.addEventListener('pointermove', event => {
  if (!miniDragStart || !(event.buttons & 1)) return;
  if (Math.hypot(event.screenX - miniDragStart.x, event.screenY - miniDragStart.y) < 5) return;
  miniDragStart = null;
  suppressMiniExpand = true;
  void windowRef.startDragging().catch(error => toast(errorText(error)));
});

window.addEventListener('pointerup', () => { miniDragStart = null; });

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (form.id === 'todo-form' && savingTodo) return;
  if (form.id === 'note-form' && savingNote) return;
  if (form.id === 'entry-form' && savingEntry) return;
  if (form.id === 'computer-form' && savingComputer) return;
  if (form.id === 'todo-form') savingTodo = true;
  if (form.id === 'note-form') savingNote = true;
  if (form.id === 'entry-form') savingEntry = true;
  if (form.id === 'computer-form') savingComputer = true;
  const submitButton = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const originalSubmitLabel = submitButton?.textContent ?? '';
  if ((form.id === 'entry-form' || form.id === 'computer-form') && submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = tr("保存中…");
  }
  try {
    if (await ai.submit(form)) return;
    if (form.id === 'todo-form') {
      const input = form.querySelector<HTMLInputElement>('[name=text]')!;
      todoDraft = input.value;
      if (!todoDraft.trim()) throw new Error(tr("请输入待办内容"));
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = tr("添加中…"); }
      const created = await invoke<Todo>('add_todo', { text: todoDraft });
      todoRevision++;
      todos.unshift(created);
      todoDraft = '';
      todoError = '';
      savingTodo = false;
      compactTodoOpen = false;
      render();
      if (mode === 'compact') app.querySelector<HTMLButtonElement>('.compact-foot [data-action="new-todo"]')?.focus();
      else app.querySelector<HTMLInputElement>('#todo-form input')?.focus();
      toast(tr("已加入待办列表"));
    } else if (form.id === 'note-form') {
      noteDraft = form.querySelector<HTMLTextAreaElement>('[name=content]')!.value;
      if (!noteDraft.trim()) throw new Error(tr("请输入速记内容"));
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = tr("保存中…"); }
      const saved = await invoke<NoteItem>('save_note', { id: editingNoteId, content: noteDraft });
      noteRevision++;
      notes = [saved, ...notes.filter(item => item.id !== saved.id)];
      noteDraft = ''; noteError = ''; editingNoteId = null; savingNote = false;
      render();
      app.querySelector<HTMLTextAreaElement>('#note-form textarea')?.focus();
      toast(tr("速记已保存"));
    } else if (form.id === 'entry-form' && draft) {
      draft.name = app.querySelector<HTMLInputElement>('#draft-name')!.value;
      draft.target = app.querySelector<HTMLInputElement>('#draft-target')!.value;
      if (draft.kind === 'project') draft.editor = app.querySelector<HTMLInputElement>('#draft-editor')!.value;
      await invoke('save_launcher', { id: draft.id ?? null, computerId: selectedComputerId, kind: draft.kind, name: draft.name, target: draft.target, editor: draft.kind === 'project' ? draft.editor : null });
      draft = null; await refresh(); toast(tr("已保存"));
    } else if (form.id === 'computer-form' && computerDraft) {
      const name = form.querySelector<HTMLInputElement>('#computer-name')!.value.trim();
      if (!name) throw new Error(tr("请输入电脑名称"));
      if (computerDraft.id) {
        await invoke('rename_computer', { id: computerDraft.id, name });
        toast(tr("电脑名称已更新"));
      } else {
        const platform = form.querySelector<HTMLSelectElement>('#computer-platform')!.value as Platform;
        const created = await invoke<Computer>('add_computer', { name, platform });
        selectedComputerId = created.id;
        await saveSetting('selected_computer_id', selectedComputerId);
        toast(tr("电脑档案已添加"));
      }
      computerDraft = null;
      await refresh();
    }
  } catch (error) {
    if (form.id === 'todo-form') { savingTodo = false; todoError = errorText(error); render(); }
    else if (form.id === 'note-form') { savingNote = false; noteError = errorText(error); render(); }
    else toast(errorText(error));
  }
  finally {
    if (form.id === 'todo-form') savingTodo = false;
    if (form.id === 'note-form') savingNote = false;
    if (form.id === 'entry-form') savingEntry = false;
    if (form.id === 'computer-form') savingComputer = false;
    if (form.isConnected && submitButton && (form.id === 'entry-form' || form.id === 'computer-form')) {
      submitButton.disabled = false;
      submitButton.textContent = originalSubmitLabel;
    }
  }
});

app.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  tools.input(input);
  ai.input(input);
  if (input.closest('#todo-form')) {
    todoDraft = input.value;
    todoError = '';
    app.querySelector('#todo-form + .form-error')?.remove();
  }
  if (input.closest('#note-form')) { noteDraft = input.value; noteError = ''; }
  if (input.id === 'entry-search') {
    search = input.value;
    const cursor = input.selectionStart;
    render();
    const replacement = app.querySelector<HTMLInputElement>('#entry-search');
    replacement?.focus(); replacement?.setSelectionRange(cursor, cursor);
  }
  if (draft) {
    if (input.id === 'draft-name') draft.name = input.value;
    if (input.id === 'draft-target') draft.target = input.value;
    if (input.id === 'draft-editor') draft.editor = input.value;
  }
  if (computerDraft && input.id === 'computer-name') computerDraft.name = input.value;
});

app.addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'ui-language') {
    if (savingLanguage) return;
    const next = input.value;
    savingLanguage = true; input.disabled = true;
    try {
      await saveSetting('ui_language', next);
      setLocale(next);
      notice = '';
      document.title = tr('桌面小助手');
    } catch (error) { toast(tr('保存语言设置失败：{0}', [errorText(error)])); }
    finally { savingLanguage = false; render(); }
    return;
  }
  tools.input(input);
  ai.input(input);
  try { if (await ai.change(input)) return; }
  catch (error) { toast(errorText(error)); render(); return; }
  if (input.dataset.feature) {
    if (savingVisibility) { render(); return; }
    const feature = input.dataset.feature;
    const next = setFeatureVisible(visibility, feature, input.checked);
    savingVisibility = true;
    app.querySelectorAll<HTMLInputElement>('[data-feature]').forEach(control => { control.disabled = true; });
    try {
      await saveSetting('feature_visibility', JSON.stringify(next));
      visibility = next;
    } catch (error) { toast(tr("保存功能显示失败：{0}", [errorText(error)])); }
    finally {
      savingVisibility = false;
      render();
      app.querySelector<HTMLInputElement>(`[data-feature="${feature}"]`)?.focus({ preventScroll: true });
    }
    return;
  }
  if (input.id === 'computer-platform') {
    if (computerDraft) computerDraft.platform = input.value as Platform;
    return;
  }
  if (input.id !== 'autostart-toggle' && input.id !== 'pin-toggle') return;
  try {
    if (input.id === 'autostart-toggle') {
      if (updatingAutostart) return;
      updatingAutostart = true;
      await saveSetting('autostart', String(input.checked));
      try { if (input.checked) await enable(); else await disable(); }
      catch (error) { await saveSetting('autostart', String(autostart)); throw error; }
      autostart = await isEnabled();
      toast(autostart ? tr("已开启开机启动") : tr("已关闭开机启动"));
    } else if (input.id === 'pin-toggle') await togglePin();
  } catch (error) {
    autostart = await isEnabled().catch(() => autostart);
    toast(errorText(error));
  } finally { updatingAutostart = false; render(); }
});

windowRef.onMoved(({ payload }) => {
  if (pinned) return;
  clearTimeout(positionTimer);
  positionTimer = window.setTimeout(async () => {
    try {
      await invoke('persist_main_position', { x: payload.x, y: payload.y });
    } catch (error) { console.error(tr("保存窗口位置失败"), error); }
  }, 350);
});

async function init() {
  try {
    setLocale(await setting('ui_language'));
    document.title = tr('桌面小助手');
    const [savedMode, savedPage, savedSection, savedWorkbenchSection, savedComputerId, savedPinned, x, y, startup, savedVisibility] = await Promise.all([
      setting('mode'), setting('page'), setting('document_section'), setting('workbench_section'), setting('selected_computer_id'), setting('pinned'), setting('window_x'), setting('window_y'), isEnabled().catch(() => false), setting('feature_visibility'),
    ]);
    mode = savedMode === 'icon' ? 'icon' : savedMode === 'compact' || savedMode === 'single' ? 'compact' : 'expanded';
    page = savedPage === 'project' || savedPage === 'software' || savedPage === 'workbench' ? 'workbench' : savedPage === 'settings' ? 'settings' : savedPage === 'tools' ? 'tools' : savedPage === 'ai' ? 'ai' : 'document';
    documentSection = savedSection === 'note' ? 'note' : 'todo';
    workbenchSection = savedPage === 'software' ? 'app' : savedPage === 'project' ? 'project' : savedWorkbenchSection === 'app' ? 'app' : 'project';
    selectedComputerId = savedComputerId ?? '';
    pinned = savedPinned === 'true';
    autostart = startup;
    const savedAutostart = await setting('autostart');
    if (savedAutostart !== null && (savedAutostart === 'true') !== autostart) {
      if (savedAutostart === 'true') await enable(); else await disable();
      autostart = await isEnabled();
    }
    visibility = parseVisibility(savedVisibility);
    normalizeNavigation();
    await applyMode(mode, false);
    if (savedMode === 'single') await saveSetting('mode', 'compact');
    if (savedPage === 'todo') await saveSetting('page', 'document');
    if (savedPage === 'project' || savedPage === 'software') {
      await Promise.all([saveSetting('page', 'workbench'), saveSetting('workbench_section', workbenchSection)]);
    }
    await invoke('restore_main_position', { x: x !== null && Number.isFinite(Number(x)) ? Math.round(Number(x)) : null, y: y !== null && Number.isFinite(Number(y)) ? Math.round(Number(y)) : null });
    try { await windowRef.setAlwaysOnTop(pinned); }
    catch { pinned = false; await saveSetting('pinned', 'false'); toast(tr("当前桌面环境不支持置顶")); }
    await refresh();
    if (selectedComputerId && savedComputerId !== selectedComputerId) await saveSetting('selected_computer_id', selectedComputerId);
    settingsFile = await invoke<SettingsDocument>('read_settings_file');
    settingsRevision = settingsFile.error ? settingsFile.defaults : settingsFile.content;
    render();
  } catch (error) { toast(tr("初始化失败：{0}", [errorText(error)])); }
}

async function reloadFileSettings() {
  if (reloadingSettings) return;
  reloadingSettings = true;
  try {
    settingsFile = await invoke<SettingsDocument>('read_settings_file');
    const effective = settingsFile.error ? settingsFile.defaults : settingsFile.content;
    if (effective !== settingsRevision || settingsDeferred) {
      const [locale, features, pin, startup] = await Promise.all([setting('ui_language'), setting('feature_visibility'), setting('pinned'), setting('autostart')]);
      setLocale(locale); document.title = tr('桌面小助手'); visibility = parseVisibility(features); normalizeNavigation();
      await invoke('set_tray_recording', { active: tools.recording });
      pinned = pin === 'true'; await windowRef.setAlwaysOnTop(pinned);
      if (startup !== null) {
        const enabled = await isEnabled();
        if ((startup === 'true') !== enabled) { if (startup === 'true') await enable(); else await disable(); }
      }
      autostart = await isEnabled();
      const loaded = await Promise.all([tools.reloadSettings(), ai.reloadSettings()]);
      settingsDeferred = loaded.some(value => !value);
      settingsRevision = effective;
    }
  } finally { reloadingSettings = false; render(); }
}

render();
void listen('assistant-show', async () => {
  try { await applyMode('expanded'); await invoke('restore_main_position', { x: null, y: null }); await windowRef.setFocus(); }
  catch (error) { toast(tr("恢复窗口失败：{0}", [errorText(error)])); }
});
void init();
void tools.initialize();
void ai.initialize();
