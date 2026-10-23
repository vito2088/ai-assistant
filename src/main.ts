import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import './style.css';
import { Tools } from './tools';
import { featureGroups, parseVisibility, groupState, setFeatureVisible, visiblePages, availablePage } from './feature-visibility';

type Mode = 'expanded' | 'icon' | 'compact';
type Page = 'document' | 'workbench' | 'tools' | 'settings';
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
}, toast);

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
  toast(next ? '已固定位置并置顶' : '已解除固定');
}

function topBar() {
  return `<header class="topbar" data-drag>
    <div class="brand"><span class="brand-mark">${svgIcon('sparkle')}</span><span>小助手</span></div>
    <div class="window-actions">
      <button class="icon-button ${pinned ? 'active' : ''}" data-action="pin" title="${pinned ? '解除固定与置顶' : '固定位置并置顶'}" aria-label="${pinned ? '解除固定与置顶' : '固定位置并置顶'}" aria-pressed="${pinned}">${svgIcon('pin')}</button>
      <button class="icon-button" data-action="icon" title="收起为桌面小图标" aria-label="收起为桌面小图标">${svgIcon('collapse')}</button>
      <button class="icon-button" data-action="minimize" title="最小化" aria-label="最小化">${svgIcon('minimize')}</button>
      <button class="icon-button close-button" data-action="quit" title="退出小助手" aria-label="退出小助手">${svgIcon('close')}</button>
    </div>
  </header>`;
}

function todoForm() {
  return `<form id="todo-form" class="inline-form">
    <input name="text" maxlength="200" autocomplete="off" placeholder="写下要做的事…" aria-label="待办内容" value="${esc(todoDraft)}" />
    <button type="submit" class="primary small" ${savingTodo ? 'disabled' : ''}>${savingTodo ? '添加中…' : '添加'}</button>
  </form>${todoError ? `<p class="form-error" role="alert">${esc(todoError)}</p>` : ''}`;
}

function todoPage() {
  return `<section class="page-body">
    ${todoForm()}
    <div class="summary"><span>${todos.filter(t => !t.completed).length} 项待完成</span><button class="subtle-link" data-action="compact">紧凑列表 ↗</button></div>
    <div class="list scroll-area">${todos.length ? todos.map(t => `<div class="todo-row ${t.completed ? 'done' : ''}">
      <button class="check ${t.completed ? 'checked' : ''}" data-action="toggle-todo" data-id="${t.id}" aria-label="${t.completed ? '标记未完成' : '标记完成'}">${t.completed ? svgIcon('check') : ''}</button>
      <span class="todo-text">${esc(t.text)}</span>
      <button class="row-menu" data-action="delete-todo" data-id="${t.id}" title="删除" aria-label="删除待办">${svgIcon('close')}</button>
    </div>`).join('') : `<div class="empty"><div class="empty-icon">✓</div><strong>还没有待办</strong><span>在上方输入框写下第一件事</span></div>`}</div>
  </section>`;
}

function notesPage() {
  const noteTime = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<section class="page-body">
    <form id="note-form" class="note-composer">
      <textarea name="content" maxlength="2000" placeholder="随手记下想法、线索或临时信息…" aria-label="速记内容">${esc(noteDraft)}</textarea>
      <div class="note-composer-actions">${editingNoteId !== null ? '<button type="button" class="text-button" data-action="cancel-note-edit">取消编辑</button>' : '<span></span>'}<button type="submit" class="primary small" ${savingNote ? 'disabled' : ''}>${savingNote ? '保存中…' : editingNoteId !== null ? '保存修改' : '保存速记'}</button></div>
    </form>
    ${noteError ? `<p class="form-error" role="alert">${esc(noteError)}</p>` : ''}
    <div class="summary"><span>${notes.length} 条速记</span></div>
    <div class="list scroll-area note-list ${notes.length ? '' : 'is-empty'}">${notes.length ? notes.map(note => `<article class="note-row">
      <div class="note-content">${esc(note.content)}</div>
      <div class="note-meta"><time>${noteTime(note.updatedAt)}</time><div><button data-action="edit-note" data-id="${note.id}">编辑</button><button data-action="delete-note" data-id="${note.id}">删除</button></div></div>
    </article>`).join('') : '<div class="empty"><div class="empty-icon">✎</div><strong>还没有速记</strong><span>在上方输入，随时保存一条</span></div>'}</div>
  </section>`;
}

function documentPage() {
  return `<div class="document-page"><nav class="document-tabs" aria-label="文档子栏目">
    ${visibility.todo ? `<button class="document-tab ${documentSection === 'todo' ? 'selected' : ''}" data-action="document-section" data-section="todo" aria-current="${documentSection === 'todo' ? 'page' : 'false'}">待办</button>` : ''}
    ${visibility.note ? `<button class="document-tab ${documentSection === 'note' ? 'selected' : ''}" data-action="document-section" data-section="note" aria-current="${documentSection === 'note' ? 'page' : 'false'}">速记</button>` : ''}
  </nav>${documentSection === 'todo' ? todoPage() : notesPage()}</div>`;
}

function workbenchPage() {
  const selected = computers.find(c => c.id === selectedComputerId);
  const platformName = (platform: Platform) => ({ windows: 'Windows', macos: 'macOS', linux: 'Linux' })[platform];
  return `<div class="workbench-page ${draft ? 'editing-entry' : ''}">
    <div class="computer-switcher"><div class="computer-list" aria-label="电脑列表">${computers.map(c => `<button class="computer-chip ${c.id === selectedComputerId ? 'selected' : ''}" data-action="select-computer" data-computer-id="${esc(c.id)}" aria-pressed="${c.id === selectedComputerId}" title="${esc(c.name)} · ${platformName(c.platform)}"><strong>${esc(c.name)}</strong><span>${c.isCurrent ? '本机' : '待绑定'}</span></button>`).join('')}</div><button class="computer-add" data-action="new-computer" title="添加电脑" aria-label="添加电脑">${svgIcon('add')}</button></div>
    ${computerDraft ? `<form id="computer-form" class="computer-form ${computerDraft.id ? 'is-rename' : ''}"><div class="form-title"><strong>${computerDraft.id ? '电脑改名' : '添加电脑档案'}</strong><button type="button" class="text-button" data-action="cancel-computer">取消</button></div>
      <input id="computer-name" aria-label="电脑名称" maxlength="80" required placeholder="例如：家用电脑" value="${esc(computerDraft.name)}" />
      ${computerDraft.id ? '' : `<select id="computer-platform" aria-label="电脑系统"><option value="windows" ${computerDraft.platform === 'windows' ? 'selected' : ''}>Windows</option><option value="macos" ${computerDraft.platform === 'macos' ? 'selected' : ''}>macOS</option><option value="linux" ${computerDraft.platform === 'linux' ? 'selected' : ''}>Linux</option></select>`}
      <button type="submit" class="primary small">${computerDraft.id ? '保存名称' : '添加'}</button></form>` : ''}
    ${selected ? `<div class="computer-toolbar"><span>${platformName(selected.platform)} · ${selected.isCurrent ? '当前电脑' : '待绑定到另一台电脑'}</span><div><button data-action="rename-computer" title="重命名">改名</button>${selected.isCurrent ? '' : `<button data-action="delete-computer" title="删除电脑档案">删除</button>`}</div></div>
    <nav class="document-tabs workbench-tabs" aria-label="工作台子栏目">${visibility.project ? `<button class="document-tab ${workbenchSection === 'project' ? 'selected' : ''}" data-action="workbench-section" data-section="project">项目</button>` : ''}${visibility.app ? `<button class="document-tab ${workbenchSection === 'app' ? 'selected' : ''}" data-action="workbench-section" data-section="app">应用</button>` : ''}${selected.isCurrent ? `<button class="workbench-add" data-action="new-entry" data-kind="${workbenchSection}" title="添加${workbenchSection === 'project' ? '项目' : '应用'}" aria-label="添加${workbenchSection === 'project' ? '项目' : '应用'}">添加${workbenchSection === 'project' ? '项目' : '应用'}</button>` : ''}</nav>
    ${selected.isCurrent ? entryPage(workbenchSection) : `<section class="remote-computer"><strong>这台电脑尚未绑定</strong><p>项目与应用的路径属于各自的电脑。以后开启同步后，可在“${esc(selected.name)}”上绑定此档案并添加入口。</p></section>`}` : '<div class="empty"><strong>还没有电脑档案</strong></div>'}
  </div>`;
}

function entryPage(kind: Kind) {
  const items = (kind === 'project' ? projects : apps).filter(x => `${x.name} ${x.target}`.toLowerCase().includes(search.toLowerCase()));
  const title = kind === 'project' ? '项目' : '应用';
  return `<section class="page-body workbench-entries">
    ${draft?.kind === kind ? entryForm() : ''}
    <input class="search" id="entry-search" placeholder="搜索${title}…" value="${esc(search)}" />
    <div class="list scroll-area">${items.length ? items.map(item => `<div class="entry-item"><div class="entry-row">
      <div class="entry-icon">${kind === 'project' ? '⌘' : '◈'}</div>
      <div class="entry-meta"><strong>${esc(item.name)}</strong><span title="${esc(item.target)}">${esc(item.target)}</span></div>
      <button class="open-button" data-action="launch" data-id="${item.id}">打开 ↗</button>
      <button class="row-menu" data-action="entry-menu" data-id="${item.id}" data-kind="${kind}" title="更多操作" aria-label="${esc(item.name)}的更多操作" aria-haspopup="true" aria-expanded="false">${svgIcon('more')}</button>
    </div></div>`).join('') : `<div class="empty"><div class="empty-icon">${kind === 'project' ? '⌘' : '◈'}</div><strong>${search ? '没有找到匹配项' : `还没有${title}`}</strong><span>${search ? '试试上方的添加按钮' : `点击上方“添加${title}”`}</span></div>`}</div>
  </section>`;
}

function entryForm() {
  if (!draft) return '';
  return `<form id="entry-form" class="entry-form">
    <div class="form-title"><strong>${draft.id ? '编辑' : '添加'}${draft.kind === 'project' ? '项目' : '应用'}</strong><button type="button" class="text-button" data-action="cancel-entry">取消</button></div>
    <label>名称<input id="draft-name" value="${esc(draft.name)}" maxlength="100" required placeholder="输入显示名称" /></label>
    <label>${draft.kind === 'project' ? '项目文件夹' : '应用入口'}<div class="path-field"><input id="draft-target" value="${esc(draft.target)}" required placeholder="${draft.kind === 'project' ? '选择项目文件夹' : '选择程序文件或应用'}" /><button type="button" data-action="pick-target">浏览</button></div></label>
    ${draft.kind === 'project' ? `<label>编辑器<div class="path-field"><input id="draft-editor" value="${esc(draft.editor)}" required placeholder="选择编辑器程序" /><button type="button" data-action="pick-editor">浏览</button></div></label>` : ''}
    <div class="form-actions">${draft.id ? `<button type="button" class="danger-link" data-action="delete-entry">移除入口</button>` : '<span></span>'}<button type="submit" class="primary small">保存</button></div>
  </form>`;
}

function featureSettings() {
  return `<div class="settings-card feature-settings"><div><strong id="feature-settings-title">功能显示</strong><p>勾选需要显示的功能，自动保存；隐藏不删除数据。</p></div>
    <ul class="feature-tree" aria-labelledby="feature-settings-title">${featureGroups.map(group => {
      const state = groupState(visibility, group.id);
      return `<li><label class="feature-parent"><input type="checkbox" data-feature="${group.id}" ${state.checked ? 'checked' : ''} ${savingVisibility ? 'disabled' : ''}><span>${group.label}</span><small>${group.children.filter(child => visibility[child.id]).length}/${group.children.length}</small></label>
        <ul>${group.children.map(child => `<li><label><input type="checkbox" data-feature="${child.id}" ${visibility[child.id] ? 'checked' : ''} ${savingVisibility ? 'disabled' : ''}><span>${child.label}</span></label></li>`).join('')}</ul></li>`;
    }).join('')}</ul><p class="feature-settings-note">设置始终显示，可随时恢复隐藏的功能。</p>
  </div>`;
}

function settingsPage() {
  return `<section class="page-body settings-page">
    <div class="settings-card"><div><strong>开机启动</strong><p>登录系统后自动打开小助手</p></div><label class="switch"><input type="checkbox" id="autostart-toggle" ${autostart ? 'checked' : ''} ${updatingAutostart ? 'disabled' : ''} /><span></span></label></div>
    <div class="settings-card"><div><strong>固定并置顶</strong><p>锁定位置，显示在普通窗口上方</p></div><label class="switch"><input type="checkbox" id="pin-toggle" ${pinned ? 'checked' : ''} /><span></span></label></div>
    ${featureSettings()}
    ${tools.settingsView()}
    <div class="settings-note">数据保存在本机。最小化后可点击任务栏图标恢复，也可通过系统托盘显示或退出应用。</div>
  </section>`;
}

function expanded() {
  return `<div class="shell expanded-shell">${topBar()}<nav class="tabs" style="grid-template-columns:repeat(${visiblePages(visibility).length},minmax(0,1fr))">
    ${visiblePages(visibility).map(p => `<button class="tab ${page === p ? 'selected' : ''}" data-action="page" data-page="${p}">${({ document: '文档', workbench: '工作台', tools: '工具', settings: '设置' } as Record<Page, string>)[p]}${p === 'tools' ? `<span class="tools-recording-dot recording-dot" ${tools.recording ? '' : 'hidden'} aria-label="正在录屏"></span>` : ''}</button>`).join('')}
  </nav>${page === 'document' ? documentPage() : page === 'workbench' ? workbenchPage() : page === 'tools' ? tools.view() : settingsPage()}<footer class="footer"><span>DESKTOP ASSISTANT</span><span>v0.1</span></footer></div>`;
}

function iconView() {
  return `<div class="mini-stage"><button class="mini-orb" data-action="expand" title="点击展开，拖动可移动小图标" aria-label="点击展开，拖动可移动小图标">${svgIcon('sparkle')}</button>
    <div class="orbit-actions">
      <button class="orbit up" data-action="expand" title="展开">${svgIcon('expand')}<small>展开</small></button>
      ${visibility.todo ? `<button class="orbit right" data-action="new-todo" title="新增待办">${svgIcon('add')}<small>新增</small></button>` : ''}
      <button class="orbit down ${pinned ? 'on' : ''}" data-action="pin" title="${pinned ? '解除固定' : '固定'}" aria-pressed="${pinned}">${svgIcon('pin')}<small>固定</small></button>
      ${visibility.todo ? `<button class="orbit left" data-action="compact" title="紧凑列表">${svgIcon('list')}<small>紧凑</small></button>` : ''}
    </div>
  </div>`;
}

function compactView() {
  const remaining = todos.filter(t => !t.completed).length;
  return `<div class="shell compact-shell"><header class="compact-head" data-drag><span class="compact-brand">${svgIcon('sparkle')}<span>待办</span><small>${remaining} 项待完成</small></span><div class="window-actions"><button class="icon-button ${pinned ? 'active' : ''}" data-action="pin" title="${pinned ? '解除固定与置顶' : '固定位置并置顶'}" aria-label="${pinned ? '解除固定与置顶' : '固定位置并置顶'}" aria-pressed="${pinned}">${svgIcon('pin')}</button><button class="icon-button" data-action="icon" title="收起为桌面小图标" aria-label="收起为桌面小图标">${svgIcon('collapse')}</button><button class="icon-button close-button" data-action="quit" title="退出小助手" aria-label="退出小助手">${svgIcon('close')}</button></div></header>
    <div class="compact-list scroll-area">${todos.length ? todos.map(t => `<div class="compact-row ${t.completed ? 'done' : ''}"><button class="check ${t.completed ? 'checked' : ''}" data-action="toggle-todo" data-id="${t.id}" aria-label="${t.completed ? '标记未完成' : '标记完成'}">${t.completed ? svgIcon('check') : ''}</button><span title="${esc(t.text)}">${esc(t.text)}</span><button class="row-menu" data-action="delete-todo" data-id="${t.id}" title="删除待办" aria-label="删除待办：${esc(t.text)}">${svgIcon('close')}</button></div>`).join('') : '<div class="compact-empty">还没有待办，点击下方新增</div>'}</div>
    <div class="compact-foot"><button data-action="expand">展开主界面</button><button data-action="new-todo">＋ 新增</button><button data-action="minimize">最小化</button></div>
    ${compactTodoOpen ? `<dialog class="compact-todo-dialog" aria-labelledby="compact-todo-title"><div class="compact-dialog-heading"><strong id="compact-todo-title">新增待办</strong><button class="icon-button" data-action="cancel-compact-todo" title="关闭" aria-label="关闭新增待办" ${savingTodo ? 'disabled' : ''}>${svgIcon('close')}</button></div>${todoForm()}</dialog>` : ''}
  </div>`;
}

function normalizeNavigation() {
  page = availablePage(visibility, page);
  if (!visibility[documentSection]) documentSection = visibility.todo ? 'todo' : 'note';
  if (!visibility[workbenchSection]) workbenchSection = visibility.project ? 'project' : 'app';
  tools.setVisibleSections(featureGroups[2].children.filter(child => visibility[child.id]).map(child => child.id));
}

function render() {
  normalizeNavigation();
  const settingsScroll = app.querySelector('.settings-page')?.scrollTop ?? 0;
  const focusedFeature = document.activeElement instanceof HTMLInputElement ? document.activeElement.dataset.feature : undefined;
  app.innerHTML = (mode === 'expanded' ? expanded() : mode === 'compact' ? compactView() : iconView()) + (notice ? `<div class="toast" role="status">${esc(notice)}</div>` : '');
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
  menu.setAttribute('aria-label', `${entry.name}的操作`);
  menu.innerHTML = `<button data-action="edit-entry" data-id="${id}" data-kind="${kind}">编辑</button><button class="danger" data-action="remove-entry" data-id="${id}" data-kind="${kind}">删除</button>`;
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
  if (await tools.action(action, button)) return;
  const id = Number(button.dataset.id);
  switch (action) {
    case 'page':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm('当前项目或应用尚未保存，确定离开吗？')) break;
      if (computerDraft?.name && !confirm('电脑档案尚未保存，确定离开吗？')) break;
      page = button.dataset.page as Page; if (page === 'tools') tools.showHome(); search = ''; draft = null; computerDraft = null; await saveSetting('page', page); render(); break;
    case 'document-section':
      documentSection = button.dataset.section as DocumentSection;
      await saveSetting('document_section', documentSection);
      render(); break;
    case 'workbench-section':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm('当前入口尚未保存，确定切换吗？')) break;
      workbenchSection = button.dataset.section as Kind; draft = null; search = '';
      await saveSetting('workbench_section', workbenchSection); render(); break;
    case 'select-computer':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm('当前入口尚未保存，确定切换吗？')) break;
      if (computerDraft?.name && !confirm('电脑档案尚未保存，确定切换吗？')) break;
      selectedComputerId = button.dataset.computerId ?? ''; draft = null; search = ''; computerDraft = null;
      await saveSetting('selected_computer_id', selectedComputerId);
      await refresh(); break;
    case 'new-computer':
      if (draft && (draft.name || draft.target || draft.editor) && !confirm('当前入口尚未保存，确定添加电脑吗？')) break;
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
      if (!computer || computer.isCurrent || !confirm(`删除电脑档案“${computer.name}”及其项目、应用入口？`)) break;
      await invoke('delete_computer', { id: computer.id });
      selectedComputerId = computers.find(c => c.isCurrent)?.id ?? '';
      await saveSetting('selected_computer_id', selectedComputerId);
      await refresh(); toast('电脑档案已删除'); break;
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
      if (noteDraft.trim() && editingNoteId !== id && !confirm('当前输入的速记尚未保存，确定改为编辑这条吗？')) break;
      editingNoteId = id; noteDraft = note.content; noteError = ''; render();
      app.querySelector<HTMLTextAreaElement>('#note-form textarea')?.focus();
      break;
    }
    case 'cancel-note-edit': noteDraft = ''; noteError = ''; editingNoteId = null; render(); break;
    case 'delete-note': {
      const note = notes.find(item => item.id === id);
      if (!note || !confirm('删除这条速记？')) break;
      await invoke('delete_note', { id });
      noteRevision++;
      notes = notes.filter(item => item.id !== id);
      if (editingNoteId === id) { editingNoteId = null; noteDraft = ''; noteError = ''; }
      render(); toast('速记已删除'); break;
    }
    case 'toggle-todo':
      await invoke('set_todo_completed', { id, completed: !todos.find(t => t.id === id)?.completed });
      await refresh(); break;
    case 'delete-todo': {
      const todo = todos.find(t => t.id === id);
      if (!todo || !confirm(`删除待办“${todo.text}”？`)) break;
      await invoke('delete_todo', { id });
      todoRevision++;
      todos = todos.filter(item => item.id !== id);
      render(); toast('待办已删除'); break;
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
      const selected = await open({ multiple: false, directory, title: directory ? '选择项目文件夹' : '选择程序或应用' });
      if (typeof selected === 'string') {
        const field = action === 'pick-editor' ? 'editor' : 'target';
        draft[field] = selected;
        if (field === 'target' && !draft.name) draft.name = selected.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
        render();
      }
      break;
    }
    case 'delete-entry':
      if (draft?.id && confirm(`从小助手移除“${draft.name}”？磁盘文件不会删除。`)) {
        await invoke('delete_launcher', { id: draft.id }); draft = null; await refresh(); toast('入口已移除');
      }
      break;
    case 'remove-entry': {
      const kind = button.dataset.kind as Kind;
      const entry = (kind === 'project' ? projects : apps).find(item => item.id === id);
      if (!entry || !confirm(`从小助手移除“${entry.name}”？磁盘文件不会删除。`)) break;
      await invoke('delete_launcher', { id });
      if (draft?.id === id && draft.kind === kind) draft = null;
      await refresh(); toast('入口已移除'); break;
    }
    case 'launch': await invoke('launch_entry', { id }); await refresh(); toast('已发送打开请求'); break;
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
    submitButton.textContent = '保存中…';
  }
  try {
    if (form.id === 'todo-form') {
      const input = form.querySelector<HTMLInputElement>('[name=text]')!;
      todoDraft = input.value;
      if (!todoDraft.trim()) throw new Error('请输入待办内容');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '添加中…'; }
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
      toast('已加入待办列表');
    } else if (form.id === 'note-form') {
      noteDraft = form.querySelector<HTMLTextAreaElement>('[name=content]')!.value;
      if (!noteDraft.trim()) throw new Error('请输入速记内容');
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = '保存中…'; }
      const saved = await invoke<NoteItem>('save_note', { id: editingNoteId, content: noteDraft });
      noteRevision++;
      notes = [saved, ...notes.filter(item => item.id !== saved.id)];
      noteDraft = ''; noteError = ''; editingNoteId = null; savingNote = false;
      render();
      app.querySelector<HTMLTextAreaElement>('#note-form textarea')?.focus();
      toast('速记已保存');
    } else if (form.id === 'entry-form' && draft) {
      draft.name = app.querySelector<HTMLInputElement>('#draft-name')!.value;
      draft.target = app.querySelector<HTMLInputElement>('#draft-target')!.value;
      if (draft.kind === 'project') draft.editor = app.querySelector<HTMLInputElement>('#draft-editor')!.value;
      await invoke('save_launcher', { id: draft.id ?? null, computerId: selectedComputerId, kind: draft.kind, name: draft.name, target: draft.target, editor: draft.kind === 'project' ? draft.editor : null });
      draft = null; await refresh(); toast('已保存');
    } else if (form.id === 'computer-form' && computerDraft) {
      const name = form.querySelector<HTMLInputElement>('#computer-name')!.value.trim();
      if (!name) throw new Error('请输入电脑名称');
      if (computerDraft.id) {
        await invoke('rename_computer', { id: computerDraft.id, name });
        toast('电脑名称已更新');
      } else {
        const platform = form.querySelector<HTMLSelectElement>('#computer-platform')!.value as Platform;
        const created = await invoke<Computer>('add_computer', { name, platform });
        selectedComputerId = created.id;
        await saveSetting('selected_computer_id', selectedComputerId);
        toast('电脑档案已添加');
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
  tools.input(input);
  if (input.dataset.feature) {
    if (savingVisibility) { render(); return; }
    const feature = input.dataset.feature;
    const next = setFeatureVisible(visibility, feature, input.checked);
    savingVisibility = true;
    app.querySelectorAll<HTMLInputElement>('[data-feature]').forEach(control => { control.disabled = true; });
    try {
      await saveSetting('feature_visibility', JSON.stringify(next));
      visibility = next;
    } catch (error) { toast(`保存功能显示失败：${errorText(error)}`); }
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
      if (input.checked) await enable(); else await disable();
      autostart = await isEnabled();
      toast(autostart ? '已开启开机启动' : '已关闭开机启动');
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
    } catch (error) { console.error('保存窗口位置失败', error); }
  }, 350);
});

async function init() {
  try {
    const [savedMode, savedPage, savedSection, savedWorkbenchSection, savedComputerId, savedPinned, x, y, startup, savedVisibility] = await Promise.all([
      setting('mode'), setting('page'), setting('document_section'), setting('workbench_section'), setting('selected_computer_id'), setting('pinned'), setting('window_x'), setting('window_y'), isEnabled().catch(() => false), setting('feature_visibility'),
    ]);
    mode = savedMode === 'icon' ? 'icon' : savedMode === 'compact' || savedMode === 'single' ? 'compact' : 'expanded';
    page = savedPage === 'project' || savedPage === 'software' || savedPage === 'workbench' ? 'workbench' : savedPage === 'settings' ? 'settings' : savedPage === 'tools' ? 'tools' : 'document';
    documentSection = savedSection === 'note' ? 'note' : 'todo';
    workbenchSection = savedPage === 'software' ? 'app' : savedPage === 'project' ? 'project' : savedWorkbenchSection === 'app' ? 'app' : 'project';
    selectedComputerId = savedComputerId ?? '';
    pinned = savedPinned === 'true';
    autostart = startup;
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
    catch { pinned = false; await saveSetting('pinned', 'false'); toast('当前桌面环境不支持置顶'); }
    await refresh();
    if (selectedComputerId && savedComputerId !== selectedComputerId) await saveSetting('selected_computer_id', selectedComputerId);
  } catch (error) { toast(`初始化失败：${errorText(error)}`); }
}

render();
void listen('assistant-show', async () => {
  try { await applyMode('expanded'); await invoke('restore_main_position', { x: null, y: null }); await windowRef.setFocus(); }
  catch (error) { toast(`恢复窗口失败：${errorText(error)}`); }
});
void init();
void tools.initialize();
