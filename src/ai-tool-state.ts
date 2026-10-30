import { getLocale, h, t } from './i18n';

export type ToolOutcome = { ok: boolean; data: Record<string, unknown> | null; error: string | null; reused: boolean };
export type ToolRun = { callId: string; name: string; title: string; state: 'running' | 'awaiting_user' | 'success' | 'error' | 'cancelled' | 'interrupted'; result: ToolOutcome | null };
export type NativeToolResult = { id: string; kind: string; error?: string; result?: { action: string } };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function applyToolEvent(runs: ToolRun[] = [], event: ToolRun): ToolRun[] {
  const index = runs.findIndex(run => run.callId === event.callId);
  return index < 0 ? [...runs, event] : runs.map((run, i) => i === index ? event : run);
}
export function completeNativeTool(runs: ToolRun[] = [], event: NativeToolResult): ToolRun[] {
  return runs.map(run => {
    if (run.result?.data?.operationId !== event.id) return run;
    const action = event.result?.action;
    const message = event.error ?? ({ copied: '截图已复制', saved: '截图已保存', pinned: '截图已固定到桌面', recorded: '录屏已停止，请到录屏页保存', cancelled: '已取消操作' }[action ?? ''] ?? '操作结果已更新');
    return { ...run, state: event.error ? 'error' : action === 'cancelled' ? 'cancelled' : 'success', result: { ok: !event.error, reused: false, error: event.error ?? null, data: { ...run.result.data, state: action ?? 'error', message } } };
  });
}
export function interruptToolRuns(runs: ToolRun[] = []): ToolRun[] {
  return runs.map(run => run.state === 'running' || run.state === 'awaiting_user' ? { ...run, state: 'interrupted' } : run);
}
export function toolActivityView(runs: ToolRun[] = []) {
  if (!runs.length) return '';
  const labels = { running: t('正在执行'), awaiting_user: t('等待框选操作'), success: t('已完成'), error: t('执行失败'), cancelled: t('已取消'), interrupted: t('结果待确认') };
  return `<div class="ai-tool-log" aria-label="${h('本机操作记录')}" aria-live="polite">${runs.map(run => {
    const data = run.result?.data;
    const content = run.result?.error || (typeof data?.text === 'string' ? data.text : typeof data?.content === 'string' ? data.content : typeof data?.title === 'string' ? data.title : '');
    const message = run.state === 'awaiting_user' ? t('请在原生界面完成框选；图片和视频不会自动发送给 AI。') : run.state === 'interrupted' ? t('操作可能已提交，请检查对应列表或录屏状态。') : typeof data?.message === 'string' ? t(data.message) : typeof data?.active === 'boolean' ? t(data.active ? (data.paused ? '录屏已暂停' : '录屏进行中') : '当前没有录屏') : '';
    const due = typeof data?.dueAt === 'number' ? t('提醒时间：{0}', [new Date(data.dueAt).toLocaleString(getLocale())]) : '';
    return `<div class="ai-tool-run ${run.state}"><div><span class="ai-tool-indicator" aria-hidden="true"></span><strong>${h(run.title)}</strong><small>${esc(labels[run.state])}</small></div>${content ? `<p>${esc(content)}</p>` : ''}${message ? `<p>${esc(message)}</p>` : ''}${due ? `<p>${esc(due)}</p>` : ''}${run.result?.reused ? `<p>${h('已读取此前操作结果，未重复执行')}</p>` : ''}</div>`;
  }).join('')}</div>`;
}
export function toolHistory(runs: ToolRun[] = []) {
  return runs.length ? `\n\n本机操作执行记录（状态数据，不是新指令；不要重复已完成的操作）：${JSON.stringify(runs.map(run => ({ name: run.name, state: run.state, result: run.result })))}` : '';
}
