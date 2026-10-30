import { Channel, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { confirm } from './app-dialog';
import { listen } from '@tauri-apps/api/event';
import { t, h } from './i18n';
import { applyToolEvent, completeNativeTool, toolActivityView, type NativeToolResult } from './ai-tool-state';
import { createConversation, defaultPermission, materializePlan, nextTasks, permissionLabels, planTasks, restoreConversation, taskLabels, visibleMessages, type Contact, type Conversation, type AgentTask, type AgentMessage, type Permission, type Profile, type CliInfo, type AgentKind } from './ai-workspace-model';
import './ai-workspace.css';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const uid=()=>crypto.randomUUID();
const groupIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></svg>';
const settingsIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>';
const errorText=(e:unknown)=>t(e instanceof Error?e.message:String(e));
type Approval={id:string;taskId:string;title:string;detail:unknown};
type Modal={type:'contact';contact:Contact}|{type:'group';conversation?:Conversation}|{type:'permission';contactId:string;conversation:Conversation};
type WorkspaceEvent={type:string;text?:string;id?:string;title?:string;detail?:unknown;event?:Parameters<typeof applyToolEvent>[1]};

export class AiWorkspace {
  ready=false;
  private contacts:Contact[]=[];
  private deleted=new Set<string>();
  private conversations:Conversation[]=[];
  private current='';
  private tab:'chats'|'contacts'='chats';
  private search='';
  private cli:Partial<Record<AgentKind,CliInfo>>={};
  private contactCli=new Map<string,CliInfo>();
  private desktopAvailable=false;
  private running=new Map<string,{conversation:Conversation;task:AgentTask}>();
  private approvals=new Map<string,Approval>();
  private saves=new Map<string,Promise<unknown>>();
  private saveTimers=new Map<string,number>();
  private renderTimer:number|undefined;
  private modal:Modal|null=null;
  private dialog:HTMLDialogElement|null=null;
  private modalIdentity:Modal|null=null;
  private modalError='';
  private saving=false;
  private installing='';
  private installLog='';
  private navOpen=true;
  private messageLimit=200;
  private imageUrls=new Map<string,string>();
  private detailStates=new Map<string,boolean>();
  constructor(private changed:()=>void,private toast:(s:string)=>void,private profiles:()=>Profile[],private notes:()=>{id:number;content:string}[]=()=>[],private refresh:()=>Promise<void>=async()=>{}){
    if(typeof document.addEventListener==='function')document.addEventListener('pointerdown',e=>{const target=e.target as Node;document.querySelectorAll<HTMLDetailsElement>('.aiw-filter,.aiw-add-menu,.aiw-note-picker').forEach(d=>{if(d.open&&!d.contains(target)){d.open=false;this.detailStates.set(`${this.current}:${d.dataset.aiwDetail}`,false);}});});
  }
  get busy(){return this.running.size>0;}
  private conversation(){return this.conversations.find(c=>c.id===this.current);}
  private name(id:string){return id==='user'?t('我'):this.contacts.find(c=>c.id===id)?.name??t('已移除的联系人');}
  private button(action:string,label:string,extra='',disabled=false){return `<button type="button" data-action="aiw-${action}" ${extra} ${disabled?'disabled':''}>${label}</button>`;}
  private notify(){if(this.renderTimer!==undefined)return;this.renderTimer=window.setTimeout(()=>{this.renderTimer=undefined;this.changed();},60);}
  private persist(c:Conversation){
    clearTimeout(this.saveTimers.get(c.id));this.saveTimers.delete(c.id);c.updatedAt=Date.now();
    const value=JSON.parse(JSON.stringify(c));const pending=(this.saves.get(c.id)??Promise.resolve()).catch(()=>{}).then(()=>invoke('ai_workspace_save_conversation',{value}));this.saves.set(c.id,pending);return pending;
  }
  private persistSoon(c:Conversation){clearTimeout(this.saveTimers.get(c.id));this.saveTimers.set(c.id,window.setTimeout(()=>{void this.persist(c).catch(e=>this.toast(errorText(e)));},500));}
  async initialize(legacy:{id:string;title:string;messages:any[];source?:unknown}[]=[]){
    const data=await invoke<{contacts:Contact[];conversations:Conversation[];runs:any[];desktopAvailable?:boolean;deleted?:{kind:string;id:string}[]}>('ai_workspace_load');
    this.desktopAvailable=!!data.desktopAvailable;
    this.deleted=new Set((data.deleted??[]).map(d=>`${d.kind}:${d.id}`));
    this.contacts=data.contacts;this.conversations=data.conversations.map(c=>restoreConversation(c,data.runs));
    for(const r of data.runs.filter(r=>r.state==='running'))await invoke('ai_workspace_cancel',{id:r.id});
    await this.syncProfiles();
    const first=this.contacts.find(c=>c.kind==='api');
    if(first)for(const s of legacy.filter(s=>!s.source)){
      const id=`legacy_${s.id}`;
      if(this.conversations.some(c=>c.id===id)||this.deleted.has(`conversation:${id}`))continue;
      const c=createConversation([first.id],s.title||t('历史对话'));c.id=id;
      c.messages=s.messages.map(m=>({id:m.id,sender:m.role==='user'?'user':first.id,text:m.text??'',createdAt:Date.now(),status:m.status==='generating'?'error':m.status??'done',error:m.error,toolRuns:m.toolRuns,attachments:m.attachments}));
      this.conversations.push(c);await this.persist(c);
    }
    this.current=this.conversations[0]?.id??'';this.ready=true;this.changed();
    await Promise.allSettled(['codex','claude'].map(kind=>this.detect(kind as AgentKind)));
    void this.detectContacts();
    await listen<NativeToolResult>('native-capture-finished',event=>{
      for(const c of this.conversations){let touched=false;for(const m of c.messages)if(m.toolRuns?.some(r=>r.result?.data?.operationId===event.payload.id)){m.toolRuns=completeNativeTool(m.toolRuns,event.payload);touched=true;}if(touched)this.persistSoon(c);}this.notify();
    });
  }
  async syncProfiles(){
    for(const profile of this.profiles()){
      const id=`api_${profile.id}`;if(this.contacts.some(c=>c.id===id)||this.deleted.has(`contact:${id}`))continue;
      let name=profile.name||profile.model;let n=2;while(this.contacts.some(c=>c.name.toLowerCase()===name.toLowerCase()))name=`${profile.name||profile.model} ${n++}`;
      const contact:Contact={id,name,kind:'api',profileId:profile.id,model:'',aliases:[],instructions:'',executable:'',permission:{...defaultPermission('api'),mode:'workspace',appTools:true}};
      this.contacts.push(await invoke<Contact>('ai_workspace_save_contact',{value:contact}));
    }
  }
  async clearHistory(){
    this.imageUrls.forEach(url=>URL.revokeObjectURL(url));this.imageUrls.clear();
    this.saveTimers.forEach(clearTimeout);this.saveTimers.clear();await Promise.allSettled([...this.saves.values()]);this.conversations=[];this.current='';this.saves.clear();this.approvals.clear();this.changed();
  }
  private available(c:Contact){if(c.kind!=='api')return !!(this.contactCli.get(c.id)??(!c.executable?this.cli[c.kind]:undefined))?.installed;const p=this.profiles().find(p=>p.id===c.profileId);return !!p?.baseUrl&&!!(c.model||p.model)&&(p.hasKey||/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(p.baseUrl));}
  private badge(c:Contact){return c.kind==='api'?(this.profiles().find(p=>p.id===c.profileId)?.name??t('服务已移除')):c.kind==='codex'?'Codex CLI':'Claude Code';}
  view(){
    if(typeof document.querySelectorAll==='function')document.querySelectorAll<HTMLDetailsElement>('.ai-workspace details[data-aiw-detail]').forEach(d=>{const scope=d.closest<HTMLElement>('.ai-workspace')?.dataset.conversation??'';this.detailStates.set(`${scope}:${d.dataset.aiwDetail}`,d.open);});
    const c=this.conversation();const query=this.search.toLocaleLowerCase();
    const conversations=[...this.conversations].sort((a,b)=>b.updatedAt-a.updatedAt).filter(c=>c.title.toLocaleLowerCase().includes(query));
    const contacts=this.contacts.filter(c=>`${c.name} ${c.aliases.join(' ')}`.toLocaleLowerCase().includes(query));
    return `<section data-conversation="${this.current}" class="ai-workspace ${this.navOpen?'':'aiw-nav-collapsed'}"><aside class="aiw-nav"><header class="aiw-nav-header"><div class="aiw-nav-tabs">${this.button('tab',h('聊天'),`data-tab="chats" class="${this.tab==='chats'?'selected':''}"`)}${this.button('tab',h('通讯录'),`data-tab="contacts" class="${this.tab==='contacts'?'selected':''}"`)}</div><details data-aiw-detail="add" class="aiw-add-menu"><summary aria-label="${h('添加')}">＋</summary><div>${this.button('new-contact',h('添加 AI 联系人'))}${this.button('new-group',h('新建群组'))}${this.cliMenu()}</div></details></header>
      <input id="aiw-search" class="aiw-search" placeholder="${h('搜索聊天或联系人')}" aria-label="${h('搜索聊天或联系人')}" value="${esc(this.search)}">
      <div class="aiw-list scroll-area" data-scroll-key="aiw-${this.tab}">${this.tab==='chats'?conversations.map(item=>`<button class="aiw-list-item ${item.id===this.current?'selected':''}" data-action="aiw-select" data-id="${item.id}"><span class="aiw-avatar">${item.kind==='group'?groupIcon:esc(item.title.slice(0,1))}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.tasks.some(t=>['running','approval','queued'].includes(t.status))?t('有任务进行中'):item.messages.at(-1)?.text.slice(0,48)||t('开始聊天'))}</small></span></button>`).join(''):contacts.map(item=>`<div class="aiw-contact-row"><button class="aiw-list-item" data-action="aiw-open-contact" data-id="${item.id}"><span class="aiw-avatar">${esc(item.name.slice(0,1))}</span><span><strong>${esc(item.name)}</strong><small>${esc(this.badge(item))} · ${this.available(item)?h('可使用'):h('需配置')}</small></span></button>${this.button('edit-contact','⋯',`data-id="${item.id}" class="aiw-contact-more" title="${h('编辑联系人')}"`)}</div>`).join('')}${!(this.tab==='chats'?conversations.length:contacts.length)?`<p class="aiw-empty-list">${h('暂无记录')}</p>`:''}</div>
      <footer class="aiw-nav-footer"><button type="button" class="aiw-settings-link" data-action="ai-model-settings" title="${h('AI 设置')}">${settingsIcon}<span>${h('AI 设置')}</span></button></footer>
    </aside><section class="aiw-main">${c?this.chat(c):this.welcome()}</section></section>`;
  }
  private cliMenu(){return `<section class="aiw-cli-menu" aria-label="${h('本机 AI')}"><p>${h('本机 AI')}</p>${(['codex','claude'] as const).map(kind=>{
    const info=this.cli[kind],name=kind==='codex'?'Codex':'Claude Code',action=info?.installed?'new-contact':'install';
    const label=info?.installed?h('添加为联系人'):h('安装执行端');
    return this.button(action,`<span><strong>${name}</strong><small>${esc(info?.version||(info?t('未检测到安装'):t('未检测')))}</small></span><span class="aiw-cli-action">${info?.installed?'＋':h('安装')}</span>`,`class="aiw-cli-entry" data-kind="${kind}" title="${label} · ${name}" aria-label="${label} · ${name}"`,!!this.installing);
  }).join('')}${this.button('detect',h('重新检测'),`class="aiw-cli-detect"`,!!this.installing)}${this.installing?`<p class="aiw-cli-progress" role="status">${h('正在安装…')}<small>${esc(this.installLog.slice(-240))}</small></p>`:''}</section>`;}
  private welcome(){return `<div class="aiw-welcome"><strong>${h('和你的 AI 一起工作')}</strong><p>${h('从通讯录开始私聊，或创建群组安排协作任务。')}</p><div>${this.button('new-contact',h('添加 AI 联系人'))}${this.button('new-group',h('新建群组'))}</div><p>${h('本机 CLI 可以独立使用，无需在小助手中配置 API 密钥。')}</p><button type="button" data-action="ai-configure">${h('配置模型服务')}</button></div>`;}
  private chat(c:Conversation){
    const all=visibleMessages(c),messages=all.slice(-this.messageLimit),members=this.contacts.filter(a=>c.members.includes(a.id));
    const selected=c.filter===null?t('全部消息'):c.filter.length===1?t('仅看 {0}',[this.name(c.filter[0])]):t('已选 {0} 人',[c.filter.length]);
    const active=c.tasks.filter(t=>['queued','running','approval'].includes(t.status));
    return `<header class="aiw-chat-header">${this.button('toggle-nav','☰',`class="aiw-nav-toggle" title="${h('展开或收起列表')}"`)}<div class="aiw-chat-title"><strong>${esc(c.title)}</strong><small>${c.kind==='group'?h('{0} 位 AI 成员',[c.members.length]):esc(this.badge(members[0]??{kind:'api',profileId:''} as Contact))}</small></div>${c.kind==='group'?this.button('edit-group','⋯',`title="${h('群组设置')}"`):this.button('edit-contact','⋯',`data-id="${c.members[0]}" title="${h('编辑联系人')}"`)}${c.id.startsWith('legacy_')?this.button('legacy-session',h('原对话'),`data-id="${c.id.slice(7)}"`):''}${this.button('delete-chat','×',`title="${h('删除会话')}"`,!!active.length)}</header>
      <div class="aiw-chat-controls"><details data-aiw-detail="filter" class="aiw-filter"><summary>${esc(selected)} ▾</summary><div>${['user',...c.members].map(id=>`<label><input type="checkbox" data-aiw-filter="${id}" ${c.filter===null||c.filter.includes(id)?'checked':''}>${esc(this.name(id))}</label>`).join('')}${this.button('filter-all',h('恢复全部'))}</div></details>${c.filter!==null?this.button('filter-all','×',`title="${h('恢复全部')}"`):''}<span></span><label>${h('负责人')}<select id="aiw-recipient">${members.map(a=>`<option value="${a.id}" ${a.id===c.defaultContactId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>${this.button('permissions',`${h(permissionLabels[(c.permissions[c.defaultContactId]??members.find(m=>m.id===c.defaultContactId)?.permission??defaultPermission('api')).mode])} ▾`,`data-id="${c.defaultContactId}"`,!members.length)}</div>
      ${this.taskView(c)}
      <div class="aiw-messages ai-messages scroll-area" data-scroll-key="aiw-messages-${c.id}">${all.length>this.messageLimit?this.button('more-messages',h('加载更早的消息')):''}${messages.map(m=>this.messageView(m,c)).join('')}${!messages.length?`<p class="aiw-empty-list">${c.filter!==null?h('当前筛选下没有消息'):h('发送消息，开始这次协作。')}</p>`:''}</div>
      <form id="aiw-chat-form" class="aiw-composer">${c.attachments?.length?`<div class="aiw-attachments">${c.attachments.map(a=>`<span>${esc(a.name)}${this.button('remove-attachment','×',`data-id="${a.id}"`)}</span>`).join('')}</div>`:''}<textarea id="aiw-input" maxlength="16000" placeholder="${c.kind==='group'?h('@成员分配任务；可安排完成后检查'):h('告诉这位 AI 要完成什么')}" aria-label="${h('AI 消息')}">${esc(c.draft)}</textarea><div class="aiw-mentions" hidden></div><footer><details data-aiw-detail="notes" class="aiw-note-picker"><summary>${h('引用速记')}</summary><div>${this.notes().slice(0,40).map(n=>this.button('attach-note',esc(n.content.slice(0,45)),`data-id="${n.id}"`)).join('')||h('还没有速记')}</div></details>${this.button('attach-image',h('添加图片'))}<small>${h('Enter 发送，Shift+Enter 换行')}</small>${active.length?this.button('stop-all',h('停止任务')):''}<button type="submit" class="primary small" ${!members.length?'disabled':''}>${h('发送')}</button></footer></form>`;
  }
  private messageView(m:AgentMessage,c:Conversation){return `<article class="aiw-message ${m.sender==='user'?'mine':''}"><header>${this.button('only-person',esc(this.name(m.sender)),`data-id="${m.sender}" title="${h('只看该成员')}"`)}<time>${new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></header>${(m.attachments??[]).map(a=>`<span class="aiw-message-reference">${esc(a.name)}${a.image?`<img src="${this.imageUrl(a.id,a.image)}" alt="${esc(a.name)}">`:a.text?`<details><summary>${h('查看引用')}</summary><pre>${esc(a.text)}</pre></details>`:''}</span>`).join('')}<div class="aiw-message-text">${esc(m.text|| (m.status==='generating'?t('正在执行…'):''))}</div>${m.toolRuns?.length?toolActivityView(m.toolRuns):''}${m.activities?.length?`<details data-aiw-detail="activity-${m.id}" class="aiw-activity"><summary>${h('执行记录')} (${m.activities.length})</summary><pre>${esc(m.activities.slice(-20).join('\n'))}</pre></details>`:''}${m.error?`<p class="tool-error" role="alert">${esc(m.error)}</p>`:''}${m.text&&m.sender!=='user'?`<div class="aiw-message-actions">${this.button('copy-message',h('复制'),`data-id="${m.id}"`)}${this.button('save-note',h('另存速记'),`data-id="${m.id}"`)}</div>`:''}</article>`;}
  private imageUrl(id:string,data:string){
    const old=this.imageUrls.get(id);if(old)return old;
    try{const [head,body]=data.split(',');const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:head.split(':')[1].split(';')[0]}));this.imageUrls.set(id,url);return url;}catch{return '';}
  }
  private taskView(c:Conversation){
    const tasks=c.tasks.slice(-20);if(!tasks.length)return '';
    return `<details data-aiw-detail="tasks" class="aiw-task-list" ${tasks.some(t=>['running','approval','queued'].includes(t.status))?'open':''}><summary>${h('协作任务')} · ${tasks.filter(t=>t.status==='done').length}/${tasks.length}</summary><div>${tasks.map(task=>`<div class="aiw-task"><span><strong>${esc(this.name(task.contactId))}</strong><small>${h(taskLabels[task.status])}${task.dependsOn.length?` · ${h('等待 {0}',[task.dependsOn.map(id=>this.name(c.tasks.find(t=>t.id===id)?.contactId??'')).join('、')])}`:''}</small>${task.error?`<small class="tool-error">${esc(task.error)}</small>`:''}</span>${['running','approval','queued'].includes(task.status)?this.button('stop-task',h('停止'),`data-id="${task.id}"`):['error','blocked','cancelled','interrupted'].includes(task.status)?this.button('retry-task',h('重新分配'),`data-id="${task.id}"`):''}</div>`).join('')}</div></details><div class="aiw-approval-region">${[...this.approvals.values()].filter(a=>c.tasks.some(t=>t.id===a.taskId)).map(a=>`<div class="aiw-approval" role="alert"><strong>${h('需要你的确认')} · ${esc(this.name(c.tasks.find(t=>t.id===a.taskId)!.contactId))}</strong><p>${esc(a.title)}</p><details><summary>${h('查看操作')}</summary><pre>${esc(JSON.stringify(a.detail,null,2))}</pre></details><div>${this.button('approve',h('允许本次'),`data-task="${a.taskId}" data-id="${a.id}"`)}${this.button('deny',h('拒绝'),`data-task="${a.taskId}" data-id="${a.id}"`)}</div></div>`).join('')}</div>`;
  }
  private async detect(kind:AgentKind){this.cli[kind]=await invoke<CliInfo>('ai_cli_detect',{kind,executable:null});this.notify();}
  private async detectContacts(){for(const c of this.contacts.filter(c=>c.kind!=='api')){try{this.contactCli.set(c.id,await invoke<CliInfo>('ai_cli_detect',{kind:c.kind,executable:c.executable||null}));this.notify();}catch{}}}
  private async openContact(id:string){
    const agent=this.contacts.find(c=>c.id===id);if(!agent)throw Error(t('联系人已移除'));
    let c=this.conversations.find(c=>c.kind==='direct'&&c.members.length===1&&c.members[0]===id);
    if(!c){c=createConversation([id],agent.name);this.conversations.unshift(c);await this.persist(c);}
    this.current=c.id;this.tab='chats';this.messageLimit=200;this.changed();
  }
  async submit(form:HTMLFormElement){
    if(form.id==='aiw-contact-form'){await this.saveContact(form);return true;}
    if(form.id==='aiw-group-form'){await this.saveGroup(form);return true;}
    if(form.id==='aiw-permission-form'){await this.savePermission(form);return true;}
    if(form.id!=='aiw-chat-form')return false;
    const c=this.conversation();if(!c)return true;const text=c.draft.trim()||(c.attachments?.length?t('请分析这份资料。'):'');if(!text)return true;
    const plan=planTasks(text,c,this.contacts), messageId=uid(),tasks=materializePlan(plan,messageId);
    if(tasks.some(t=>!this.available(this.contacts.find(a=>a.id===t.contactId)!)))throw Error(t('执行端尚未就绪，请配置模型或检测本机 CLI'));
    if(c.attachments?.some(a=>a.image)&&tasks.some(task=>{const agent=this.contacts.find(a=>a.id===task.contactId)!;return agent.kind!=='api'||!this.profiles().find(p=>p.id===agent.profileId)?.vision;}))throw Error(t('图片引用需要接收方使用支持图片的自定义 AI；CLI 可通过任务中的文件路径读取项目图片。'));
    const attachments=[...(c.attachments??[])];c.messages.push({id:messageId,sender:'user',text,status:'done',createdAt:Date.now(),attachments});c.draft='';c.attachments=[];
    for(const task of tasks){c.tasks.push(task);c.messages.push({id:task.replyId,sender:task.contactId,text:'',status:'generating',createdAt:Date.now()});}
    try{await this.persist(c);}catch(e){c.messages=c.messages.filter(m=>m.id!==messageId&&!tasks.some(t=>t.replyId===m.id));c.tasks=c.tasks.filter(t=>!tasks.some(created=>created.id===t.id));c.draft=text;c.attachments=attachments;this.changed();throw e;}this.changed();void this.pump();return true;
  }
  private async pump(){
    if(this.running.size>=2)return;
    const busy=new Set([...this.running.values()].map(r=>r.task.contactId));
    for(const c of this.conversations)for(const task of nextTasks(c,2)){
      if(this.running.size>=2)return;if(busy.has(task.contactId))continue;
      const p=c.permissions[task.contactId]??this.contacts.find(a=>a.id===task.contactId)?.permission;
      if(p&&p.mode!=='read'&&[...this.running.values()].some(r=>{const other=r.conversation.permissions[r.task.contactId]??this.contacts.find(a=>a.id===r.task.contactId)?.permission;return other&&other.mode!=='read'&&(other.mode==='full'||p.mode==='full'||(p.workspace&&p.workspace===other.workspace));}))continue;
      busy.add(task.contactId);task.status='running';this.running.set(task.id,{conversation:c,task});
      void this.execute(c,task);
    }
    this.notify();
  }
  private async execute(c:Conversation,task:AgentTask){
    const reply=c.messages.find(m=>m.id===task.replyId)!;
    try{
      await this.persist(c);
      if(task.status==='cancelled')throw Error(t('任务已停止'));
      const channel=new Channel<WorkspaceEvent>();channel.onmessage=e=>{
        if(e.type==='text')reply.text+=(e.text??'');
        else if(e.type==='tool'&&e.event)reply.toolRuns=applyToolEvent(reply.toolRuns,e.event);
        else if(e.type==='activity'){reply.activities??=[];reply.activities.push(e.text??'');if(reply.activities.length>100)reply.activities.shift();}
        else if(e.type==='approval'&&e.id){task.status='approval';this.approvals.set(e.id,{id:e.id,taskId:task.id,title:e.title??'',detail:e.detail});}
        else if(e.type==='approvalResolved'&&e.id){this.approvals.delete(e.id);if(task.status==='approval')task.status='running';}
        this.persistSoon(c);this.notify();
      };
      const result=await invoke<{text:string;sessionId?:string;workspace?:string}>('ai_workspace_run',{id:task.id,conversationId:c.id,onEvent:channel});
      task.status='done';reply.status='done';reply.text=result.text||reply.text;if(result.sessionId)c.engineSessions[task.contactId]=result.sessionId;if(result.workspace){c.engineSessionScopes??={};c.engineSessionScopes[task.contactId]=result.workspace;reply.activities??=[];reply.activities.push(t('工作目录')+': '+result.workspace);}
    }catch(e){task.status=task.status==='cancelled'?'cancelled':'error';task.error=errorText(e);reply.status='error';reply.error=task.error;}
    finally{
      this.running.delete(task.id);for(const [id,a]of this.approvals)if(a.taskId===task.id)this.approvals.delete(id);
      nextTasks(c);await this.persist(c).catch(e=>this.toast(errorText(e)));this.changed();void this.pump();
    }
  }
  input(input:HTMLInputElement|HTMLTextAreaElement){
    if(input.id==='aiw-search'){this.search=input.value;this.changed();return true;}
    if(input.id==='aiw-input'){const c=this.conversation();if(c){c.draft=input.value;this.persistSoon(c);this.updateMentions(input as HTMLTextAreaElement);}return true;}
    return false;
  }
  private updateMentions(input:HTMLTextAreaElement){
    const c=this.conversation(),popup=document.querySelector<HTMLElement>('.aiw-mentions');if(!c||!popup)return;
    const match=/@([^@\n，,;；]*)$/.exec(input.value.slice(0,input.selectionStart));
    const contacts=match?this.contacts.filter(a=>c.members.includes(a.id)&&[a.name,...a.aliases].some(n=>n.toLowerCase().includes(match[1].toLowerCase()))):[];
    popup.hidden=!contacts.length;popup.innerHTML=contacts.slice(0,8).map(a=>this.button('mention',`@${esc(a.name)}`,`data-id="${a.id}"`)).join('');
  }
  async change(input:HTMLInputElement|HTMLSelectElement){
    const c=this.conversation();
    if(input.dataset.aiwFilter!==undefined&&c){const selected=new Set(c.filter??['user',...c.members]);if((input as HTMLInputElement).checked)selected.add(input.dataset.aiwFilter);else selected.delete(input.dataset.aiwFilter);c.filter=[...selected];await this.persist(c);this.changed();return true;}
    if(input.id==='aiw-recipient'&&c){c.defaultContactId=input.value;await this.persist(c);this.changed();return true;}
    if(input.name==='profileId'){this.updateModalVisibility();return true;}
    if(input.id==='aiw-kind'||input.id==='aiw-mode'){this.updateModalVisibility();return true;}
    return false;
  }
  afterRender(){
    if(!document.querySelector('.ai-workspace'))return;
    this.syncModal();
    document.querySelectorAll<HTMLDetailsElement>('.ai-workspace details[data-aiw-detail]').forEach(d=>{const state=this.detailStates.get(`${this.current}:${d.dataset.aiwDetail}`);if(state!==undefined)d.open=state;});
    const input=document.querySelector<HTMLTextAreaElement>('#aiw-input');
    if(input&&!input.dataset.keys){input.dataset.keys='true';input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();const popup=document.querySelector<HTMLElement>('.aiw-mentions');if(popup&&!popup.hidden){popup.querySelector<HTMLButtonElement>('button')?.click();return;}input.form?.requestSubmit();}});}
  }
  private permissionFields(p:Permission,kind:AgentKind){return `<div class="aiw-permission-fields"><label>${h('执行权限')}<select id="aiw-mode" name="mode">${(['inherit','read','workspace','full'] as const).map(m=>`<option value="${m}" ${p.mode===m?'selected':''}>${h(permissionLabels[m])}</option>`).join('')}</select></label><label>${h('工作目录')}<div class="aiw-path"><input id="aiw-workspace" name="workspace" value="${esc(p.workspace)}" placeholder="${h('需要读写项目时选择目录')}">${this.button('pick-workspace',h('浏览'))}</div></label><label data-api-only>${h('额外授权目录（每行一个）')}<textarea name="extraDirs" rows="2">${esc(p.extraDirs.join('\n'))}</textarea></label><label class="aiw-check"><input type="checkbox" name="ask" ${p.ask?'checked':''}>${kind==='api'?h('写操作逐项确认'):h('启动任务前确认')}</label><label class="aiw-check"><input type="checkbox" name="appTools" ${p.appTools?'checked':''}>${h('允许操作小助手工具')}</label><div data-api-only><label class="aiw-check"><input type="checkbox" name="commands" ${p.commands?'checked':''}>${h('允许执行系统命令')}</label><label class="aiw-check"><input type="checkbox" name="desktop" ${p.desktop?'checked':''}>${h('允许观察和控制桌面（Windows，需图片模型）')}</label><p class="aiw-help">${h('命令按当前系统用户运行，不提供系统级目录或网络隔离。')}</p></div><p class="aiw-help" data-cli-only>${h('CLI 使用自身的权限机制；跟随原程序时不覆盖配置。Windows 下 Claude Code 命令没有系统沙箱。')}</p><p class="aiw-full-note" hidden>${h('完全访问可触及项目以外的文件与命令，范围仍受系统用户权限和执行端策略限制。')}</p></div>`;}
  private contactForm(c:Contact){return `<form id="aiw-contact-form"><label>${h('联系人名称')}<input id="aiw-contact-name" name="name" maxlength="60" required value="${esc(c.name)}" autofocus></label><label>${h('别名（逗号分隔）')}<input name="aliases" value="${esc(c.aliases.join(', '))}" placeholder="GPT, DS"></label><label>${h('接入类型')}<select id="aiw-kind" name="kind">${(['api','codex','claude'] as const).map(kind=>`<option value="${kind}" ${c.kind===kind?'selected':''}>${kind==='api'?t('自定义 AI'):kind==='codex'?'Codex CLI':'Claude Code'}</option>`).join('')}</select></label><div data-api-only><div class="aiw-model-service"><label for="aiw-profile-id">${h('模型服务')}</label><div class="aiw-service-select"><select id="aiw-profile-id" name="profileId"><option value="">${h('请选择')}</option>${this.profiles().map(p=>`<option value="${p.id}" ${p.id===c.profileId?'selected':''}>${esc(p.name)} · ${esc(p.model)}</option>`).join('')}</select><button type="button" class="aiw-settings-button" data-action="ai-model-settings" title="${h('配置模型服务')}" aria-label="${h('配置模型服务')}">${settingsIcon}</button></div></div><label>${h('模型 ID（留空使用服务默认值）')}<input name="model" maxlength="200" value="${esc(c.model)}"></label><p class="aiw-help">${h('密钥继续使用设置中的模型服务配置。')}</p></div><div data-cli-only><label>${h('程序路径（留空自动检测）')}<div class="aiw-path"><input id="aiw-executable" name="executable" value="${esc(c.executable)}">${this.button('pick-executable',h('浏览'))}</div></label><div class="aiw-dialog-actions">${this.button('detect-contact',h('检测执行端'))}${this.button('open-cli',h('打开原程序'))}</div><p class="aiw-help">${h('沿用 CLI 自己的模型和认证配置，安装检测不代表账号已经可用。')}</p></div><label>${h('角色说明')}<textarea name="instructions" maxlength="16000" rows="3" placeholder="${h('例如：负责实现功能，完成后报告修改和测试结果。')}">${esc(c.instructions)}</textarea></label>${this.permissionFields(c.permission,c.kind)}<footer>${this.contacts.some(a=>a.id===c.id)?this.button('delete-contact',h('删除联系人'),`data-id="${c.id}" class="danger-link"`):'<span></span>'}<div>${this.button('close-dialog',h('取消'))}<button type="submit" class="primary small">${h('保存')}</button></div></footer></form>`;}
  private groupForm(c?:Conversation){return `<form id="aiw-group-form"><label>${h('群组名称')}<input id="aiw-group-name" name="title" maxlength="100" required autofocus value="${esc(c?.title??'')}"></label><fieldset class="aiw-member-picker"><legend>${h('选择 AI 成员')}</legend>${this.contacts.map(a=>`<label class="aiw-check"><input type="checkbox" name="member" value="${a.id}" ${c?.members.includes(a.id)?'checked':''}>${esc(a.name)}<small>${esc(this.badge(a))}</small></label>`).join('')}${!this.contacts.length?`<p>${h('请先添加 AI 联系人')}</p>`:''}</fieldset><p class="aiw-help">${h('最多 16 位成员；未点名的消息交给默认负责人。')}</p><footer><span></span><div>${this.button('close-dialog',h('取消'))}<button type="submit" class="primary small" ${!this.contacts.length?'disabled':''}>${h('保存')}</button></div></footer></form>`;}
  private syncModal(){
    if(!this.modal){this.dialog?.close();this.dialog?.remove();this.dialog=null;this.modalIdentity=null;return;}
    if(this.modalIdentity!==this.modal||!this.dialog?.isConnected){
      this.dialog?.close();this.dialog?.remove();const dialog=document.createElement('dialog');dialog.className='aiw-dialog';dialog.setAttribute('aria-labelledby','aiw-dialog-title');
      const title=this.modal.type==='contact'?t('AI 联系人'):this.modal.type==='group'?t('群组设置'):t('本次会话权限');
      const form=this.modal.type==='contact'?this.contactForm(this.modal.contact):this.modal.type==='group'?this.groupForm(this.modal.conversation):'';
      // Permission editor uses the selected contact's adapter, including CLI-specific labels.
      let html=form;
      if(this.modal.type==='permission'){
        const state=this.modal;const agent=this.contacts.find(a=>a.id===state.contactId)!;
        html=`<form id="aiw-permission-form"><p>${esc(agent.name)} · ${h('仅影响当前会话')}</p>${this.permissionFields(state.conversation.permissions[state.contactId]??agent.permission,agent.kind)}<footer><span></span><div>${this.button('close-dialog',h('取消'))}<button type="submit" class="primary small">${h('保存')}</button></div></footer></form>`;
      }
      html=html.replace(/(<form[^>]*>)([\s\S]*)(<footer>[\s\S]*<\/footer>)(<\/form>)/,'$1<div class="aiw-editor-fields">$2</div>$3$4');
      dialog.innerHTML=`<header><strong id="aiw-dialog-title">${esc(title)}</strong>${this.button('close-dialog','×',`aria-label="${h('关闭')}"`)}</header><div class="aiw-dialog-body">${html}<p class="aiw-dialog-error tool-error" role="alert" hidden></p></div>`;
      dialog.addEventListener('cancel',e=>{e.preventDefault();if(!this.saving){this.modal=null;this.changed();}});
      document.querySelector('#app')!.append(dialog);this.dialog=dialog;this.modalIdentity=this.modal;dialog.showModal();this.updateModalVisibility();
    }
    const error=this.dialog!.querySelector<HTMLElement>('.aiw-dialog-error')!;error.textContent=this.modalError;error.hidden=!this.modalError;
    this.dialog!.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('input,button,select,textarea').forEach(e=>{e.disabled=this.saving;});
    this.updateModalVisibility();
  }
  private updateModalVisibility(){
    if(!this.dialog||!this.modal)return;
    const kind=this.modal.type==='contact'?(this.dialog.querySelector<HTMLSelectElement>('#aiw-kind')?.value??'api'):this.modal.type==='permission'?this.contacts.find(a=>a.id===(this.modal as {contactId:string}).contactId)?.kind:'api';
    this.dialog.querySelectorAll<HTMLElement>('[data-api-only]').forEach(e=>{e.hidden=kind!=='api';});this.dialog.querySelectorAll<HTMLElement>('[data-cli-only]').forEach(e=>{e.hidden=kind==='api';});
    const mode=this.dialog.querySelector<HTMLSelectElement>('#aiw-mode');if(mode){const inherit=mode.querySelector<HTMLOptionElement>('option[value=inherit]');if(inherit){inherit.hidden=kind==='api';if(kind==='api'&&mode.value==='inherit')mode.value='read';}this.dialog.querySelector<HTMLElement>('.aiw-full-note')!.hidden=mode.value!=='full';const commands=this.dialog.querySelector<HTMLInputElement>('[name=commands]');if(commands){commands.disabled=this.saving||mode.value==='read';if(mode.value==='read')commands.checked=false;}const desktop=this.dialog.querySelector<HTMLInputElement>('[name=desktop]');if(desktop){const profileId=this.dialog.querySelector<HTMLSelectElement>('[name=profileId]')?.value??(this.modal.type==='permission'?this.contacts.find(a=>a.id===(this.modal as {contactId:string}).contactId)?.profileId:'');desktop.disabled=this.saving||mode.value!=='full'||!this.desktopAvailable||!this.profiles().find(p=>p.id===profileId)?.vision;if(mode.value!=='full'||!this.desktopAvailable)desktop.checked=false;}}
  }
  private readPermission(form:HTMLFormElement):Permission{
    const values=new FormData(form);return {mode:String(values.get('mode')) as Permission['mode'],workspace:String(values.get('workspace')??'').trim(),extraDirs:String(values.get('extraDirs')??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),appTools:values.has('appTools'),commands:values.get('mode')!=='read'&&values.has('commands'),desktop:values.get('mode')==='full'&&values.has('desktop'),ask:values.has('ask')};
  }
  private async confirmFull(next:Permission,old?:Permission){if(next.mode==='full'&&old?.mode!=='full')return confirm(t('允许这个 AI 完全访问？它可能修改项目以外的文件或执行系统命令。'),{title:t('完全访问'),kind:'warning'});return true;}
  private readContact(form:HTMLFormElement,id:string):Contact{
    const v=new FormData(form),kind=String(v.get('kind')) as AgentKind,permission=this.readPermission(form);
    if(kind==='api'&&permission.mode==='inherit')permission.mode='read';
    return {id,name:String(v.get('name')??'').trim(),aliases:String(v.get('aliases')??'').split(/[,，]/).map(s=>s.trim()).filter(Boolean),kind,profileId:String(v.get('profileId')??''),model:String(v.get('model')??''),instructions:String(v.get('instructions')??''),executable:String(v.get('executable')??''),permission};
  }
  prepareModelSettings(){
    if(this.saving)return false;
    const form=this.dialog?.querySelector<HTMLFormElement>('#aiw-contact-form');
    if(this.modal?.type==='contact'&&form)this.modal.contact=this.readContact(form,this.modal.contact.id);
    this.dialog?.close();this.dialog?.remove();this.dialog=null;this.modalIdentity=null;
    return true;
  }
  private async saveContact(form:HTMLFormElement){
    if(this.modal?.type!=='contact'||this.saving)return;const original=this.modal.contact,contact=this.readContact(form,original.id),kind=contact.kind;
    if(!await this.confirmFull(contact.permission,this.contacts.find(c=>c.id===original.id)?.permission))return;
    this.saving=true;this.modalError='';this.syncModal();
    try{const saved=await invoke<Contact>('ai_workspace_save_contact',{value:contact});const index=this.contacts.findIndex(c=>c.id===saved.id);if(index>=0)this.contacts[index]=saved;else this.contacts.push(saved);if(kind!=='api')this.contactCli.set(saved.id,await invoke<CliInfo>('ai_cli_detect',{kind,executable:contact.executable||null}));this.modal=null;this.tab='contacts';this.toast(t('联系人已保存'));}
    catch(e){this.modalError=errorText(e);}finally{this.saving=false;this.changed();}
  }
  private async saveGroup(form:HTMLFormElement){
    if(this.modal?.type!=='group'||this.saving)return;const v=new FormData(form),members=v.getAll('member').map(String);if(!members.length||members.length>16){this.modalError=t('请选择 1～16 位成员');this.syncModal();return;}
    const c=this.modal.conversation??createConversation(members,String(v.get('title')).trim(),true);
    if(c.tasks.some(t=>['running','approval','queued'].includes(t.status))){this.modalError=t('请先停止群组任务再修改成员');this.syncModal();return;}
    c.title=String(v.get('title')).trim();c.members=members;if(!members.includes(c.defaultContactId))c.defaultContactId=members[0];if(c.filter)c.filter=c.filter.filter(id=>id==='user'||members.includes(id));
    this.saving=true;this.syncModal();try{await this.persist(c);if(!this.conversations.some(s=>s.id===c.id))this.conversations.unshift(c);this.current=c.id;this.tab='chats';this.modal=null;}catch(e){this.modalError=errorText(e);}finally{this.saving=false;this.changed();}
  }
  private async savePermission(form:HTMLFormElement){
    if(this.modal?.type!=='permission'||this.saving)return;const {conversation:c,contactId}=this.modal;
    if(c.tasks.some(t=>t.contactId===contactId&&['running','approval'].includes(t.status))){this.modalError=t('请先停止这个联系人的任务再调整权限');this.syncModal();return;}
    const permission=this.readPermission(form),old=c.permissions[contactId]??this.contacts.find(a=>a.id===contactId)!.permission;
    if(!await this.confirmFull(permission,old))return;
    this.saving=true;this.syncModal();try{c.permissions[contactId]=permission;await this.persist(c);this.modal=null;}catch(e){this.modalError=errorText(e);}finally{this.saving=false;this.changed();}
  }
  async action(action:string,button:HTMLElement){
    if(!action.startsWith('aiw-'))return false;
    const c=this.conversation(),id=button.dataset.id??'';
    if(action==='aiw-new-contact'||action==='aiw-new-group'){
      const menu=document.querySelector<HTMLDetailsElement>('.aiw-add-menu');if(menu)menu.open=false;
      this.detailStates.set(`${this.current}:add`,false);
    }
    switch(action){
      case 'aiw-copy-message':if(c){const message=c.messages.find(m=>m.id===id);if(message)await navigator.clipboard.writeText(message.text);}break;
      case 'aiw-save-note':if(c){const message=c.messages.find(m=>m.id===id);if(message){await invoke('save_note',{id:null,content:message.text});await this.refresh();this.toast(t('已保存'));}}break;
      case 'aiw-attach-note':if(c){const note=this.notes().find(n=>n.id===Number(id));if(note){c.attachments??=[];if(c.attachments.length>=4)throw Error(t('最多引用四份资料'));c.attachments.push({id:uid(),name:t('速记'),text:note.content});await this.persist(c);}}break;
      case 'aiw-remove-attachment':if(c){c.attachments=c.attachments?.filter(a=>a.id!==id);await this.persist(c);}break;
      case 'aiw-attach-image':if(c){if((c.attachments?.length??0)>=4)throw Error(t('最多引用四份资料'));const path=await open({multiple:false,filters:[{name:'Image',extensions:['png','jpg','jpeg','webp']}]});if(typeof path==='string'){const image=await invoke<string>('ai_image',{path});c.attachments??=[];c.attachments.push({id:uid(),name:path.split(/[\\/]/).pop()??t('图片'),image});await this.persist(c);}}break;
      case 'aiw-tab':this.tab=button.dataset.tab==='contacts'?'contacts':'chats';break;
      case 'aiw-select':this.current=id;this.messageLimit=200;break;
      case 'aiw-open-contact':await this.openContact(id);return true;
      case 'aiw-new-contact':{const kind=(button.dataset.kind??'api') as AgentKind;this.modal={type:'contact',contact:{id:uid(),name:kind==='codex'?'Codex':kind==='claude'?'Claude':'',aliases:[],kind,profileId:this.profiles()[0]?.id??'',model:'',instructions:'',executable:this.cli[kind]?.path??'',permission:defaultPermission(kind)}};this.modalError='';break;}
      case 'aiw-edit-contact':{const contact=this.contacts.find(a=>a.id===id);if(contact){this.modal={type:'contact',contact:structuredClone(contact)};this.modalError='';}break;}
      case 'aiw-new-group':this.modal={type:'group'};this.modalError='';break;
      case 'aiw-edit-group':if(c)this.modal={type:'group',conversation:c};this.modalError='';break;
      case 'aiw-permissions':if(c&&this.contacts.some(a=>a.id===id))this.modal={type:'permission',contactId:id,conversation:c};this.modalError='';break;
      case 'aiw-close-dialog':if(!this.saving){this.modal=null;this.modalError='';}break;
      case 'aiw-filter-all':if(c){c.filter=null;this.detailStates.set(`${c.id}:filter`,false);const filter=document.querySelector<HTMLDetailsElement>('.aiw-filter');if(filter)filter.open=false;await this.persist(c);}break;
      case 'aiw-only-person':if(c){c.filter=[id];await this.persist(c);}break;
      case 'aiw-toggle-nav':this.navOpen=!this.navOpen;break;
      case 'aiw-more-messages':this.messageLimit+=200;break;
      case 'aiw-detect':await Promise.allSettled(['codex','claude'].map(kind=>this.detect(kind as AgentKind)));await this.detectContacts();break;
      case 'aiw-detect-contact':case 'aiw-open-cli':{
        const kind=this.dialog?.querySelector<HTMLSelectElement>('#aiw-kind')?.value as AgentKind;
        const executable=this.dialog?.querySelector<HTMLInputElement>('#aiw-executable')?.value||null;if(!kind||kind==='api')break;
        if(action==='aiw-open-cli')await invoke('ai_cli_open',{kind,executable});else{const info=await invoke<CliInfo>('ai_cli_detect',{kind,executable});if(this.modal?.type==='contact')this.contactCli.set(this.modal.contact.id,info);this.modalError=info.installed?`${info.version} · ${info.path}`:info.error??t('未检测到安装');}break;
      }
      case 'aiw-pick-workspace':case 'aiw-pick-executable':{
        const chosen=await open({directory:action==='aiw-pick-workspace',multiple:false});if(typeof chosen==='string'){const input=this.dialog?.querySelector<HTMLInputElement>(action==='aiw-pick-workspace'?'#aiw-workspace':'#aiw-executable');if(input)input.value=chosen;}break;
      }
      case 'aiw-install':{
        if(this.installing)break;const kind=button.dataset.kind as AgentKind;
        if(!await confirm(t('从官方来源安装 {0} 命令行程序？Codex 的此安装方式需要 Node.js/npm。',[kind==='codex'?'Codex':'Claude Code']),{title:t('安装执行端'),kind:'info',okLabel:t('安装')}))break;
        this.installing=kind;this.installLog='';this.changed();try{const channel=new Channel<{text:string}>();channel.onmessage=e=>{this.installLog=(this.installLog+'\n'+e.text).slice(-12000);this.notify();};await invoke('ai_cli_install',{kind,onEvent:channel});await this.detect(kind);this.toast(t('安装完成，请在原程序中完成登录或配置'));}catch(e){this.toast(errorText(e));}finally{this.installing='';}break;
      }
      case 'aiw-mention':{
        const input=document.querySelector<HTMLTextAreaElement>('#aiw-input'),agent=this.contacts.find(a=>a.id===id);if(!input||!agent||!c)break;const before=input.value.slice(0,input.selectionStart),match=/@([^@\n，,;；]*)$/.exec(before);if(!match)break;const head=before.slice(0,match.index)+`@${agent.name} `;input.value=head+input.value.slice(input.selectionStart);c.draft=input.value;input.focus();input.setSelectionRange(head.length,head.length);document.querySelector<HTMLElement>('.aiw-mentions')!.hidden=true;this.persistSoon(c);return true;
      }
      case 'aiw-approve':case 'aiw-deny':await invoke('ai_workspace_approve',{id:button.dataset.task,approvalId:id,allow:action==='aiw-approve'});break;
      case 'aiw-stop-task':case 'aiw-stop-all':if(c){for(const task of c.tasks.filter(t=>action==='aiw-stop-all'||t.id===id)){if(!['queued','running','approval'].includes(task.status))continue;task.status='cancelled';await invoke('ai_workspace_cancel',{id:task.id});const reply=c.messages.find(m=>m.id===task.replyId);if(reply){reply.status='error';reply.error=t('任务已停止');}}await this.persist(c);void this.pump();}break;
      case 'aiw-retry-task':if(c){const old=c.tasks.find(t=>t.id===id);if(old){c.draft=old.instruction;this.toast(t('请检查已执行的结果，再发送新任务'));}}break;
      case 'aiw-delete-chat':if(c){if(c.tasks.some(t=>['queued','running','approval'].includes(t.status)))throw Error(t('请先停止相关任务'));if(!await confirm(t('删除此会话及其任务记录？已执行的文件修改会保留。'),{title:t('删除会话'),kind:'warning',okLabel:t('删除'),destructive:true}))break;clearTimeout(this.saveTimers.get(c.id));await this.saves.get(c.id)?.catch(()=>{});await invoke('ai_workspace_delete',{kind:'conversation',id:c.id});this.conversations=this.conversations.filter(s=>s.id!==c.id);this.current=this.conversations[0]?.id??'';}break;
      case 'aiw-delete-contact':{
        if(!await confirm(t('删除联系人？历史会话会保留。'),{title:t('删除联系人'),kind:'warning',okLabel:t('删除'),destructive:true}))break;await invoke('ai_workspace_delete',{kind:'contact',id});this.contacts=this.contacts.filter(a=>a.id!==id);this.deleted.add(`contact:${id}`);this.modal=null;break;
      }
      default:return false;
    }
    this.changed();return true;
  }
}
