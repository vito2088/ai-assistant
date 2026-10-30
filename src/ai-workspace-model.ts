import type { ToolRun } from './ai-tool-state';
import type { Attachment } from './ai-model';
export type AgentKind = 'api' | 'codex' | 'claude';
export type Permission = { mode:'inherit'|'read'|'workspace'|'full'; workspace:string; extraDirs:string[]; appTools:boolean; commands:boolean; desktop:boolean; ask:boolean };
export type Contact = { id:string; name:string; aliases:string[]; kind:AgentKind; profileId:string; model:string; instructions:string; executable:string; permission:Permission };
export type TaskStatus = 'queued'|'running'|'approval'|'done'|'error'|'cancelled'|'blocked'|'interrupted';
export type AgentMessage = { id:string; sender:string; text:string; status:'generating'|'done'|'error'; createdAt:number; toolRuns?:ToolRun[]; activities?:string[]; error?:string; attachments?:Attachment[] };
export type AgentTask = { id:string; contactId:string; messageId:string; replyId:string; instruction:string; dependsOn:string[]; status:TaskStatus; error?:string };
export type Conversation = { id:string; title:string; kind:'direct'|'group'; members:string[]; defaultContactId:string; messages:AgentMessage[]; tasks:AgentTask[]; updatedAt:number; draft:string; filter:string[]|null; permissions:Record<string,Permission>; engineSessions:Record<string,string>; engineSessionScopes?:Record<string,string>; attachments?:Attachment[] };
export type Profile = { id:string; name:string; model:string; baseUrl:string; hasKey:boolean; vision:boolean; modelMappings?:{name:string;model:string}[] };
export type CliInfo = { kind:AgentKind; installed:boolean; path?:string; version?:string; error?:string };
export const defaultPermission = (kind:AgentKind):Permission => ({ mode:kind==='api'?'read':'inherit', workspace:'', extraDirs:[], appTools:false, commands:false, desktop:false, ask:true });
export const permissionLabels:Record<Permission['mode'],string> = { inherit:'跟随原程序', read:'只读分析', workspace:'项目内操作', full:'完全访问' };
export const taskLabels:Record<TaskStatus,string> = { queued:'等待执行', running:'正在执行', approval:'等待确认', done:'已完成', error:'执行失败', cancelled:'已停止', blocked:'前置任务未完成', interrupted:'上次执行已中断' };
export function createConversation(members:string[],title:string,group=false):Conversation {
  return {id:crypto.randomUUID(),title,kind:group?'group':'direct',members:[...new Set(members)],defaultContactId:members[0]??'',messages:[],tasks:[],updatedAt:Date.now(),draft:'',filter:null,permissions:{},engineSessions:{}};
}
export function visibleMessages(c:Conversation) { return c.filter===null?c.messages:c.messages.filter(m=>c.filter!.includes(m.sender)); }
const escapeRegex = (s:string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export type Mention = { id:string; index:number; end:number };
export function mentions(text:string,contacts:Contact[]):Mention[] {
  const out:Mention[]=[];
  for(const c of contacts) for(const name of new Set([c.name,...c.aliases].filter(Boolean))) {
    const re=new RegExp(`@${escapeRegex(name)}(?=$|[\\s，,。:：;；]|帮|请|先|检查|审查|实现|写|等|让|做|读|打开|干|完)`,'giu');
    for(const match of text.matchAll(re)) out.push({id:c.id,index:match.index!,end:match.index!+match[0].length});
    const direct=new RegExp(`(^|[\\n，,;；])\\s*${escapeRegex(name)}(?=[\\s，,:：]|帮|请|先|检查|审查|实现|写|等|让|做|读|打开)`,'giu');
    for(const match of text.matchAll(direct)) {const index=match.index!+match[0].indexOf(name);out.push({id:c.id,index,end:match.index!+match[0].length});}
  }
  return out.sort((a,b)=>a.index-b.index||b.end-a.end).filter((m,i,a)=>!a.slice(0,i).some(n=>n.index===m.index&&n.end>=m.end));
}
export type PlanStep = { contactId:string; instruction:string; dependsOnContacts:string[]; dependsOnTasks:string[] };
export function planTasks(text:string,c:Conversation,contacts:Contact[]):PlanStep[] {
  const members=contacts.filter(a=>c.members.includes(a.id));
  if(!members.length)throw Error('当前会话没有可用联系人');
  const found=mentions(text,members), ids=[...new Set(found.map(m=>m.id))];
  if(!ids.length) ids.push(c.defaultContactId||members[0].id);
  if(ids.some(id=>!members.some(m=>m.id===id)))throw Error('默认负责人已移除，请重新选择');
  const steps=ids.map(id=>({contactId:id,instruction:text,dependsOnContacts:[] as string[],dependsOnTasks:[] as string[]}));
  const wait=/(?:等(?:待)?|\bafter\b|\bonce\b)/i.exec(text);
  if(wait&&/(?:完成|做完|干完|结束|finish|done|complete)/i.test(text.slice(wait.index))) {
    const waiter=[...found].reverse().find(m=>m.index<wait.index);
    const tail=text.slice(wait.index+wait[0].length).toLocaleLowerCase();
    const dependencies=members.filter(m=>m.id!==waiter?.id&&[m.name,...m.aliases].some(name=>tail.includes(name.toLocaleLowerCase())));
    if(!waiter||dependencies.length!==1)throw Error('等待关系不明确，请明确写出谁执行、谁等待检查');
    const dependency=dependencies[0],step=steps.find(s=>s.contactId===waiter.id)!;
    const explicitWork=found.some(m=>m.id===dependency.id&&m.index<wait.index);
    if(explicitWork)step.dependsOnContacts.push(dependency.id);
    else {
      const previous=[...c.tasks].reverse().find(t=>t.contactId===dependency.id&&!['error','cancelled','blocked','interrupted'].includes(t.status));
      if(!previous)throw Error(`请先给 ${dependency.name} 分配任务，再安排等待检查`);
      step.dependsOnTasks.push(previous.id);
      const index=steps.findIndex(s=>s.contactId===dependency.id);if(index>=0)steps.splice(index,1);
    }
  }
  return steps;
}
export function materializePlan(plan:PlanStep[],messageId:string):AgentTask[] {
  const ids=new Map(plan.map(p=>[p.contactId,crypto.randomUUID()]));
  return plan.map(p=>({id:ids.get(p.contactId)!,contactId:p.contactId,messageId,replyId:crypto.randomUUID(),instruction:p.instruction,dependsOn:[...p.dependsOnTasks,...p.dependsOnContacts.map(id=>{const task=ids.get(id);if(!task)throw Error('前置联系人没有对应任务');return task;})],status:'queued'}));
}
export function nextTasks(c:Conversation,limit=2):AgentTask[] {
  const active=c.tasks.filter(t=>t.status==='running'||t.status==='approval');
  const busy=new Set(active.map(t=>t.contactId));
  const next:AgentTask[]=[];
  for(const task of c.tasks) {
    if(task.status!=='queued'||busy.has(task.contactId))continue;
    const deps=task.dependsOn.map(id=>c.tasks.find(t=>t.id===id));
    if(deps.some(t=>!t||['error','cancelled','blocked','interrupted'].includes(t.status))) {task.status='blocked';continue;}
    if(!deps.every(t=>t?.status==='done'))continue;
    if(next.length+active.length>=limit)break;
    next.push(task);busy.add(task.contactId);
  }
  return next;
}
export function restoreConversation(c:Conversation,runs:{id:string;state:string;result?:{text?:string;error?:string;sessionId?:string;workspace?:string}}[]) {
  c.permissions??={};c.engineSessions??={};c.filter??=null;c.draft??='';c.tasks??=[];
  for(const task of c.tasks) {
    const run=runs.find(r=>r.id===task.id), reply=c.messages.find(m=>m.id===task.replyId);
    if(run?.state==='done') {task.status='done';if(reply){reply.status='done';reply.text=run.result?.text??reply.text;}if(run.result?.sessionId)c.engineSessions[task.contactId]=run.result.sessionId;if(run.result?.workspace){c.engineSessionScopes??={};c.engineSessionScopes[task.contactId]=run.result.workspace;}}
    else if(['running','approval','queued'].includes(task.status)) {task.status='interrupted';if(reply){reply.status='error';reply.error='上次执行已中断，请检查实际结果后重新分配任务';}}
  }
  return c;
}
