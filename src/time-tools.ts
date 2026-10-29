import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { h, t } from './i18n';
import './time-tools.css';

export type TimedTask = { id: number; kind: 'timer' | 'reminder'; title: string; dueAt: number; remaining: number; state: 'running' | 'paused' | 'done' | 'dismissed'; screen: boolean };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function remainingText(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds / 3600),Math.floor(seconds / 60) % 60,seconds % 60].map(v=>String(v).padStart(2,'0')).join(':');
}
export class TimeTools {
  private tasks: TimedTask[] = [];
  private title = '';
  private creating = false;
  private editing: TimedTask | null = null;
  private timeChanged = false;
  private kind: 'timer' | 'reminder' = 'timer';
  private hours = '0'; private minutes = '5'; private seconds = '0'; private date = '';
  private screen = true; private busy = false;
  constructor(private changed: () => void, private toast: (message: string) => void) {}
  async initialize() {
    await listen('timed-tasks-changed', () => { void this.refresh().catch(error=>this.toast(String(error))); });
    await this.refresh();
    window.setInterval(() => document.querySelectorAll<HTMLElement>('[data-time-due]').forEach(node => {
      node.textContent = remainingText(Number(node.dataset.timeDue) - Date.now());
    }), 1000);
  }
  private async refresh() { this.tasks = await invoke<TimedTask[]>('timed_tasks'); this.changed(); }
  close() { this.creating = false; this.editing = null; }
  private openEdit(task: TimedTask) {
    this.editing = {...task}; this.creating=true;this.kind=task.kind;this.title=task.title;this.screen=task.screen;this.timeChanged=false;
    const seconds=Math.max(1,Math.ceil((task.state==='paused'?task.remaining:task.dueAt-Date.now())/1000));
    this.hours=String(Math.floor(seconds/3600));this.minutes=String(Math.floor(seconds/60)%60);this.seconds=String(seconds%60);
    const date=new Date(task.dueAt);date.setMinutes(date.getMinutes()-date.getTimezoneOffset());this.date=date.toISOString().slice(0,19);
    this.changed();
  }
  afterRender() {
    const dialog = document.querySelector<HTMLDialogElement>('.time-create-dialog');
    if (!dialog) return;
    dialog.showModal();
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!this.busy) { this.close(); this.changed(); } });
    dialog.querySelector('form')!.onsubmit = event => {
      event.preventDefault(); event.stopPropagation();
      const button = dialog.querySelector<HTMLElement>('[data-time-submit]')!;
      void this.action('time-add', button);
    };
    dialog.querySelector<HTMLInputElement>('#time-title')?.focus({preventScroll:true});
  }
  view() {
    const kind = this.kind;
    const tasks = this.tasks;
    return `<div class="time-tool"><div class="time-list-toolbar"><span>${h('所有提醒')}</span><button class="primary small" data-action="time-new">＋ ${h('新增提醒')}</button></div>
      ${this.creating ? `<dialog class="time-create-dialog" aria-labelledby="time-create-title"><form><header><strong id="time-create-title">${h(this.editing?'编辑提醒':'新增提醒')}</strong><button type="button" class="icon-button" data-action="time-cancel" aria-label="${h('关闭')}" ${this.busy?'disabled':''}>×</button></header><div class="time-kind-switch" aria-label="${h('提醒方式')}"><button type="button" class="${kind==='timer'?'selected':''}" data-action="time-kind" data-kind="timer" aria-pressed="${kind==='timer'}">${h('倒计时')}</button><button type="button" class="${kind==='reminder'?'selected':''}" data-action="time-kind" data-kind="reminder" aria-pressed="${kind==='reminder'}">${h('指定时间')}</button></div>
      <label class="tool-field">${h('提醒内容')}<input id="time-title" maxlength="200" placeholder="${h('例如：起身活动一下')}" value="${esc(this.title)}"></label>
      ${kind === 'timer' ? `<div class="time-duration">${([['hours','小时',this.hours],['minutes','分钟',this.minutes],['seconds','秒',this.seconds]] as const).map(([id,label,value])=>`<label>${h(label)}<input id="time-${id}" type="number" min="0" max="${id==='hours'?8760:59}" step="1" value="${value}"></label>`).join('')}</div>` : `<label class="tool-field">${h('提醒时间')}<input id="time-date" type="datetime-local" step="1" value="${esc(this.date)}"></label>`}
      <label class="tool-checkbox"><input id="time-screen" type="checkbox" ${this.screen?'checked':''}>${h('屏幕弹窗提醒')}</label>
      <p class="tool-hint">${h('到点后在屏幕顶部约 100px 处显示横条提醒；关闭后仅在列表中标记到点。')}</p>
      <div class="time-create-actions"><button type="button" class="text-button" data-action="time-cancel" ${this.busy?'disabled':''}>${h('取消')}</button><button type="submit" class="primary" data-time-submit data-kind="${kind}" ${this.busy?'disabled':''}>${h(this.busy?'保存中…':this.editing?'保存修改':kind==='timer'?'开始倒计时':'添加提醒')}</button></div></form></dialog>` : ''}
      <div class="time-task-list">${tasks.length ? tasks.map(task=>`<article class="time-task ${task.state==='done'?'is-due':''}"><strong>${esc(task.title)}</strong><span>${task.state==='running' && task.kind==='timer'?`<time data-time-due="${task.dueAt}">${remainingText(task.dueAt-Date.now())}</time>`: task.state==='paused'?`${h('已暂停')} · ${remainingText(task.remaining)}`:task.state==='done'?h('已到时间'):task.state==='dismissed'?h('已处理'):esc(new Date(task.dueAt).toLocaleString())}</span><small>${h(task.kind==='timer'?'倒计时':'指定时间')} · ${h(task.screen?'屏幕提醒已开启':'仅列表提醒')}</small><div class="time-task-actions"><button data-action="time-edit" data-id="${task.id}">${h('编辑')}</button>${task.kind==='timer' && ['running','paused'].includes(task.state)?`<button data-action="time-${task.state==='paused'?'resume':'pause'}" data-id="${task.id}">${h(task.state==='paused'?'继续':'暂停')}</button>`:''}${task.state==='done'?`<button data-action="time-dismiss" data-id="${task.id}">${h('知道了')}</button><button data-action="time-snooze" data-id="${task.id}">${h('5 分钟后再提醒')}</button>`:''}<button data-action="time-delete" data-id="${task.id}" aria-label="${h('删除')} ${esc(task.title)}">${h(['running','paused'].includes(task.state)?'取消':'删除')}</button></div></article>`).join(''):`<p class="time-empty">${h('还没有提醒')}</p>`}</div></div>`;
  }
  input(input: HTMLInputElement) {
    if (['time-date','time-hours','time-minutes','time-seconds'].includes(input.id)) this.timeChanged=true;
    if (input.id === 'time-title') this.title = input.value;
    if (input.id === 'time-date') this.date = input.value;
    if (input.id === 'time-screen') this.screen = input.checked;
    if (input.id === 'time-hours') this.hours = input.value;
    if (input.id === 'time-minutes') this.minutes = input.value;
    if (input.id === 'time-seconds') this.seconds = input.value;
  }
  async action(action: string, button: HTMLElement) {
    if (!action.startsWith('time-')) return false;
    if (this.busy) return true;
    if (action === 'time-new') { this.editing=null;this.title='';this.date='';this.timeChanged=false;this.creating=true;this.changed();return true; }
    if (action === 'time-edit') { const task=this.tasks.find(task=>task.id===Number(button.dataset.id));if(task)this.openEdit(task);return true; }
    if (action === 'time-cancel') { this.close();this.changed();return true; }
    if (action === 'time-kind') { const next=button.dataset.kind==='reminder'?'reminder':'timer';if(next!==this.kind)this.timeChanged=true;this.kind=next;this.changed();return true; }
    this.busy = true; button.setAttribute('disabled','');
    try {
      if (action === 'time-add') {
        const kind = this.kind;
        const parts = [this.hours,this.minutes,this.seconds].map(Number);
        if (kind==='timer' && (parts.some(n=>!Number.isInteger(n)||n<0) || parts[1]>59 || parts[2]>59)) throw new Error('请输入有效的小时、分钟和秒');
        const value = kind==='timer' ? (parts[0]*3600+parts[1]*60+parts[2])*1000 : new Date(this.date).getTime();
        if (!Number.isFinite(value) || value<=0) throw new Error('请设置有效时间');
        const args={kind,title:this.title.trim() || t(kind==='timer'?'定时器到时间了':'提醒时间到了'),value,screen:this.screen};
        const wasEditing=!!this.editing;
        if(this.editing) await invoke('update_timed_task',{...args,id:this.editing.id,resetTime:this.timeChanged});
        else await invoke('add_timed_task',args);
        this.editing=null;
        this.title = '';
        this.creating = false;
        this.toast(wasEditing?'提醒已更新':kind==='timer'?'倒计时已开始':'提醒已添加');
      } else await invoke('change_timed_task',{id:Number(button.dataset.id),action:action.slice(5)});
      await this.refresh();
    } catch (error) { this.toast(String(error)); }
    finally { this.busy=false;this.changed(); }
    return true;
  }
}
