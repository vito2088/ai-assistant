import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TimedTask } from './time-tools';
import { h } from './i18n';
import './reminder-alert.css';
const root = document.querySelector<HTMLElement>('#reminder')!;
let current: TimedTask | undefined;
let busy = false;
let revision = 0;
let shown = false;
async function refresh() {
  const version = ++revision;
  const tasks = (await invoke<TimedTask[]>('timed_tasks')).filter(task=>task.state==='done' && task.screen);
  if (version !== revision) return;
  if (!tasks.length) { await invoke('close_reminder_alert'); return; }
  if (JSON.stringify(current)===JSON.stringify(tasks[0])) return;
  current = tasks[0];
  root.innerHTML = `<section class="alert-card" role="alertdialog" aria-labelledby="alert-title"><div class="alert-icon">◷</div><div class="alert-copy"><p class="alert-label">${h(current.kind==='timer'?'倒计时结束':'提醒时间到了')}${tasks.length>1?` · ${tasks.length} ${h('项待处理')}`:''}</p><h1 id="alert-title"></h1><p class="alert-date"></p></div><div class="alert-actions"><button data-action="snooze">${h('5 分钟后再提醒')}</button><button class="primary" data-action="dismiss">${h('知道了')}</button></div><small>${h('按 Esc 关闭当前提醒')}</small></section>`;
  root.querySelector('h1')!.textContent = current.title;
  root.querySelector('h1')!.title = current.title;
  root.querySelector('.alert-date')!.textContent = new Date(current.dueAt).toLocaleString();
  root.querySelector<HTMLButtonElement>('.primary')?.focus({preventScroll:true});
  if (!shown) {
    shown = true;
    await invoke('animate_reminder_alert', {reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  }
}
async function act(action: string) {
  if (!current || busy) return;
  busy=true;
  root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
  try { await invoke('change_timed_task',{id:current.id,action}); current=undefined;await refresh(); }
  catch { root.querySelector('small')!.textContent=h('操作失败，请重试'); }
  finally { busy=false; root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false); }
}
root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-action]');if(button)void act(button.dataset.action!);});
window.addEventListener('keydown',event=>{if(event.key==='Escape')void act('dismiss');});
void (async () => {
  await listen('timed-tasks-changed',()=>{if(!busy)void refresh().catch(console.error);});
  await listen('reminder-dismiss',()=>{void act('dismiss');});
  await refresh();
})().catch(error => { root.textContent = h('操作失败，请重试'); console.error(error); });
