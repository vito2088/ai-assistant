import {invoke,Channel} from '@tauri-apps/api/core';
import {open,save} from '@tauri-apps/plugin-dialog';
import type {Terminal as XTerminal} from '@xterm/xterm';
import type {FitAddon} from '@xterm/addon-fit';
import {confirm} from './app-dialog';
import {h,t,getLocale} from './i18n';
import {newTerminalProfile,terminalPreferences,defaultTerminalPreferences,terminalInputChunks,terminalLoadError,remoteJoin,remoteParent,formatBytes,type TerminalProfile,type TerminalPreferences,type RemoteEntry} from './terminal-model';
import type {Contact} from './ai-workspace-model';
import './terminal.css';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const icons:Record<string,string>={terminal:'<path d="m5 6 5 6-5 6m8 0h6"/>',server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',add:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/>',ai:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',settings:'<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',back:'<path d="m14 6-6 6 6 6"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/>',collapse:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.terminal}</svg>`;
const button=(action:string,label:string,svg:string,extra='')=>`<button type="button" class="term-icon" data-term-action="${action}" title="${esc(t(label))}" aria-label="${esc(t(label))}" ${extra}>${icon(svg)}</button>`;
Object.assign(icons,{
  more:'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  edit:'<path d="m15.5 4.5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  key:'<circle cx="8" cy="8" r="4.5"/><path d="m11.5 11.5 9 9M16 16l3-3M18.5 18.5l3-3"/>',
});
type Approval={id:string;title:string;detail:{target:string;environment:string;cwd:string;content:string}};
type AiTask={id:string;prompt:string;answer:string;error:string;busy:boolean;approvals:Approval[];tools:{callId:string;title:string;state:string;result?:unknown}[]};
type LiveSession={id:string;profile:TerminalProfile;name:string;status:'opening'|'connected'|'closed'|'error';cwd:string;error:string;host:HTMLDivElement;term?:XTerminal;fit?:FitAddon;observer?:ResizeObserver;writeQueue:Promise<unknown>;path:string;entries:RemoteEntry[];fileBusy:boolean;fileError:string;truncated:boolean;aiDraft:string;contactId:string;tasks:AiTask[]};
type Transfer={id:string;session:string;name:string;direction:string;done:number;total:number;speed:number;status:'running'|'done'|'error';error:string};

export class TerminalWorkspace {
  private profiles:TerminalProfile[]=[];
  private sessions:LiveSession[]=[];
  private preferences:TerminalPreferences={...defaultTerminalPreferences};
  private shells:string[]=[];
  private ready=false;
  private attempted=false;
  private renderedLocale='';
  private loading:Promise<void>|null=null;
  private error='';
  private current='';
  private query='';
  private navOpen=true;
  private aiVisible=true;
  private panel:'files'|'ai'|null=null;
  private contacts:Contact[]=[];
  private transfers:Transfer[]=[];
  private root=document.createElement('section');
  private dialog:HTMLDialogElement|null=null;
  private menu:{popup:HTMLDivElement;trigger:HTMLElement;details:HTMLDetailsElement}|null=null;
  private renderTimer:number|undefined;
  constructor(private toast:(text:string)=>void,private goSettings:()=>void,private goAiSettings:()=>void,private settingsChanged:()=>void=()=>{}){
    this.root.className='terminal-workspace';
    this.root.addEventListener('click',e=>{const target=e.target as HTMLElement;const trigger=target.closest<HTMLElement>('.term-menu > summary');if(trigger){e.preventDefault();if(this.menu?.trigger===trigger)this.closeMenu();else this.openMenu(trigger,e.detail===0);return;}const el=target.closest<HTMLElement>('[data-term-action]');if(el)void this.action(el.dataset.termAction!,el).catch(e=>this.toast(errorText(e)));});
    this.root.addEventListener('input',e=>{const el=e.target as HTMLInputElement;const s=this.active();if(el.id==='term-search'){this.query=el.value;this.render();}if(el.id==='term-ai-prompt'&&s)s.aiDraft=el.value;});
    this.root.addEventListener('change',e=>{const el=e.target as HTMLSelectElement;const s=this.active();if(el.id==='term-ai-contact'&&s)s.contactId=el.value;});
    this.root.addEventListener('submit',e=>{e.preventDefault();const form=e.target as HTMLFormElement;const s=this.active();if(!s)return;if(form.id==='term-path-form')void this.list(s,(form.elements.namedItem('path') as HTMLInputElement).value);if(form.id==='term-ai-form')void this.ask(s);});
    this.root.addEventListener('keydown',e=>{if(e.target instanceof HTMLTextAreaElement&&e.target.id==='term-ai-prompt'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();const s=this.active();if(s)void this.ask(s);}});
    this.root.addEventListener('keydown',e=>{const trigger=(e.target as HTMLElement).closest<HTMLElement>('.term-menu > summary');if(trigger&&e.key==='ArrowDown'){e.preventDefault();this.openMenu(trigger,true);}});
    this.root.addEventListener('scroll',e=>{if((e.target as HTMLElement).matches('.term-profile-list,.term-file-list'))this.closeMenu();},true);
    document.addEventListener('pointerdown',e=>{const menu=this.menu;if(menu&&!menu.popup.contains(e.target as Node)&&!menu.trigger.contains(e.target as Node))this.closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.menu){e.preventDefault();e.stopPropagation();this.closeMenu(true);}});
    window.addEventListener('resize',()=>this.closeMenu());
  }
  view(){return '<div id="terminal-workspace-mount"></div>';}
  setAiVisible(visible:boolean){this.aiVisible=visible;this.root.dataset.aiEnabled=String(visible);if(!visible&&this.panel==='ai'){this.panel=null;this.render();}}
  beforeRender(){this.closeMenu();this.root.remove();}
  afterRender(){
    const mount=document.querySelector('#terminal-workspace-mount');
    if(mount){mount.append(this.root);if(!this.attempted&&!this.loading)void this.initialize();if(!this.root.childElementCount||this.renderedLocale!==getLocale())this.render();requestAnimationFrame(()=>this.fitActive());}
    const settings=document.querySelector<HTMLElement>('.terminal-settings');
    if(settings&&!settings.dataset.bound){settings.dataset.bound='true';settings.addEventListener('change',()=>{void this.savePreferences(settings);});}
  }
  private active(){return this.sessions.find(s=>s.id===this.current);}
  private closeMenu(restoreFocus=false){const menu=this.menu;if(!menu)return;this.menu=null;menu.popup.remove();menu.details.open=false;menu.trigger.setAttribute('aria-expanded','false');if(restoreFocus&&menu.trigger.isConnected)menu.trigger.focus({preventScroll:true});}
  private openMenu(trigger:HTMLElement,focusFirst=false){
    if(!this.ready)return;
    if(this.menu?.trigger===trigger){if(focusFirst)this.menu.popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();return;}
    this.closeMenu();const details=trigger.parentElement as HTMLDetailsElement;const content=details.querySelector('div');if(!content)return;
    const popup=document.createElement('div');popup.className='term-menu-popup';popup.setAttribute('role','menu');popup.setAttribute('aria-label',trigger.getAttribute('aria-label')??t('更多操作'));popup.innerHTML=content.innerHTML;
    popup.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.setAttribute('role','menuitem');button.tabIndex=-1;});
    this.menu={popup,trigger,details};details.open=true;trigger.setAttribute('aria-expanded','true');document.body.append(popup);
    const margin=8;const width=window.innerWidth;const height=window.innerHeight;
    popup.style.maxWidth=`${Math.max(0,width-2*margin)}px`;popup.style.maxHeight=`${Math.max(0,height-2*margin)}px`;
    const anchor=trigger.getBoundingClientRect();const bounds=popup.getBoundingClientRect();
    popup.style.left=`${Math.max(margin,Math.min(anchor.right-bounds.width,width-bounds.width-margin))}px`;
    const below=anchor.bottom+6;const top=below+bounds.height<=height-margin?below:anchor.top-bounds.height-6;
    popup.style.top=`${Math.max(margin,Math.min(top,height-bounds.height-margin))}px`;
    popup.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-term-action]');if(!button||button.disabled)return;this.closeMenu();void this.action(button.dataset.termAction!,button).catch(e=>this.toast(errorText(e)));});
    popup.addEventListener('keydown',e=>{
      if(e.key==='Tab'){this.closeMenu(true);return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();
      const buttons=Array.from(popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
    });
    if(focusFirst)popup.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  private schedule(){if(this.renderTimer!==undefined)return;this.renderTimer=window.setTimeout(()=>{this.renderTimer=undefined;this.render();},70);}
  async initialize(){
    if(this.loading)return this.loading;
    this.attempted=true;
    this.loading=(async()=>{try{const data=await invoke<{profiles:TerminalProfile[];preferences:TerminalPreferences;shells:string[]}>('terminal_load');this.profiles=data.profiles;this.preferences=terminalPreferences(data.preferences);this.shells=data.shells;this.ready=true;this.error='';}catch(e){this.error=t(terminalLoadError(errorText(e)));}finally{this.loading=null;this.render();this.settingsChanged();}})();return this.loading;
  }
  private status(s:LiveSession){return t(s.status==='opening'?'连接中…':s.status==='connected'?'已连接':s.status==='error'?'连接失败':'已结束');}
  private profileView(p:TerminalProfile){
    const live=this.sessions.filter(s=>s.profile.id===p.id);
    const shellNames:Record<string,string>={powershell:'PowerShell',pwsh:'PowerShell 7',cmd:'CMD',default:t('系统 Shell')};
    const detail=p.kind==='ssh'?`${p.username}@${p.host}`:(shellNames[p.shell]??p.shell);
    const menuItem=(action:string,label:string,glyph:string,id=p.id)=>`<button type="button" data-term-action="${action}" data-id="${esc(id)}" ${action==='delete-profile'?'class="term-menu-danger"':''}>${icon(glyph)}<span>${h(label)}</span></button>`;
    return `<div class="term-profile ${live.length?'has-sessions':''}"><div class="term-profile-row"><button type="button" class="term-profile-name" data-term-action="open" data-id="${esc(p.id)}" title="${esc(p.kind==='ssh'?`${p.username}@${p.host}:${p.port}`:p.cwd||detail)}"><span class="term-profile-glyph">${icon(p.kind==='ssh'?'server':'terminal')}</span><span class="term-profile-copy"><strong>${esc(p.name)}</strong><small>${esc(detail)}${p.group?` · ${esc(p.group)}`:''}</small></span></button><details class="term-menu term-profile-menu"><summary title="${h('更多操作')}" aria-label="${h('更多操作')}">${icon('more')}</summary><div>${menuItem('new-session','新建会话','add')}${menuItem('edit-profile','编辑连接','edit')}${p.kind==='ssh'?menuItem('forget-secret','清除保存的凭据','key'):''}${menuItem('delete-profile','删除连接','trash')}</div></details></div>${live.length?`<div class="term-session-list">${live.map(s=>`<div class="term-session-row ${s.id===this.current?'selected':''}"><button type="button" data-term-action="select" data-id="${s.id}" ${s.id===this.current?'aria-current="page"':''}><i class="term-status ${s.status}"></i><span>${esc(s.name)}<small>${esc(this.status(s))}</small></span></button>${button('close-session','关闭会话','close',`data-id="${s.id}"`)}</div>`).join('')}</div>`:''}</div>`;
  }
  private orphanView(){const orphan=this.sessions.filter(s=>!this.profiles.some(p=>p.id===s.profile.id));return orphan.length?`<div class="term-group-label">${h('未保存的会话')}</div>${orphan.map(s=>`<div class="term-session-row ${s.id===this.current?'selected':''}"><button type="button" data-term-action="select" data-id="${s.id}"><i class="term-status ${s.status}"></i><span>${esc(s.name)}<small>${esc(this.status(s))}</small></span></button>${button('close-session','关闭会话','close',`data-id="${s.id}"`)}</div>`).join('')}`:'';}
  private render(){
    this.closeMenu();
    this.renderedLocale=getLocale();
    const s=this.active();const active=document.activeElement;const input=active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
    const focusTerminal=!!active?.closest('.xterm');
    const bodyScroll=this.root.querySelector('.term-ai-history')?.scrollTop??0;
    const oldNav=this.root.querySelector('.term-profile-list')?.scrollTop??0;
    const filtered=this.profiles.filter(p=>`${p.name} ${p.group} ${p.host}`.toLowerCase().includes(this.query.toLowerCase()));
    this.root.className=`terminal-workspace ${this.navOpen?'':'term-nav-collapsed'} ${this.panel?'term-has-panel':''}`;
    this.root.innerHTML=`<aside class="term-nav"><header><strong>${h('会话')}</strong><details class="term-menu term-new-menu"><summary title="${h('新建终端')}" aria-label="${h('新建终端')}">${icon('add')}</summary><div><button type="button" data-term-action="new-local">${h('本地终端')}</button><button type="button" data-term-action="new-ssh">${h('SSH 连接')}</button></div></details></header><input id="term-search" type="search" value="${esc(this.query)}" placeholder="${h('搜索会话或连接')}" aria-label="${h('搜索会话或连接')}"><div class="term-profile-list">${(['local','ssh'] as const).map(kind=>`<div class="term-group-label">${h(kind==='local'?'本地':'远程')}<span>${filtered.filter(p=>p.kind===kind).length}</span></div>${filtered.filter(p=>p.kind===kind).map(p=>this.profileView(p)).join('')}`).join('')}${this.ready&&!this.profiles.length?`<p class="term-nav-empty">${h('点击加号创建第一个终端')}</p>`:''}</div><button type="button" class="term-nav-settings" data-term-action="settings">${icon('settings')}<span>${h('终端设置')}</span></button></aside>
      <div class="term-main"><header class="term-header">${button('toggle-nav','展开或收起会话列表','collapse')}<div class="term-title">${s?`<strong>${esc(s.name)}</strong><small><i class="term-status ${s.status}"></i>${esc(this.status(s))}${s.profile.environment?` · ${h({development:'开发环境',test:'测试环境',production:'生产环境'}[s.profile.environment])}`:''}</small>`:`<strong>${h('终端')}</strong><small>${h('本地与远程工作空间')}</small>`}</div><div class="term-toolbar">${s?`${s.status!=='connected'?button('reconnect','重新连接','refresh'):''}${s.profile.kind==='ssh'?button('files','远程文件','folder',`aria-pressed="${this.panel==='files'}"`):''}${button('ai','AI 助手','ai',`aria-pressed="${this.panel==='ai'}"`)}${button('clear','清空终端显示','refresh')}`:''}</div></header>
      <div class="term-content"><div class="term-console ${this.preferences.theme}"><div class="term-surface-mount"></div>${!s?`<div class="term-welcome">${icon('terminal')}<strong>${h('从这里连接你的工作环境')}</strong><p>${h('创建本地终端，或通过 SSH 连接服务器。')}</p><div><button type="button" class="term-primary" data-term-action="new-local">${h('本地终端')}</button><button type="button" data-term-action="new-ssh">${h('SSH 连接')}</button></div>${this.error?`<p class="term-error">${esc(this.error)}</p><button type="button" data-term-action="retry">${h('重新加载')}</button>`:!this.ready?`<p>${h('加载中…')}</p>`:''}</div>`:''}</div>${s&&this.panel?`<aside class="term-panel"><header><strong>${h(this.panel==='files'?'远程文件':'AI 助手')}</strong>${button('hide-panel','关闭面板','close')}</header>${this.panel==='files'?this.fileView(s):this.aiView(s)}</aside>`:''}</div>
      <footer class="term-footer"><span title="${esc(s?.cwd??'')}">${s?`${s.profile.kind==='ssh'?'SSH':'PTY'} · ${esc(s.cwd||'~')}`:h('认证凭据保存在本机，不进入 AI 对话')}</span>${s?.error?`<span class="term-error" title="${esc(s.error)}">${esc(s.error)}</span>`:''}<span>${this.sessions.filter(s=>s.status==='connected').length} ${h('个连接')}</span></footer></div>`;
    this.root.querySelector('.term-profile-list')!.insertAdjacentHTML('beforeend',this.orphanView());
    const search=this.root.querySelector<HTMLInputElement>('#term-search')!;
    const searchBox=document.createElement('div');searchBox.className='term-search';search.before(searchBox);searchBox.innerHTML=icon('search');searchBox.append(search);
    const settings=this.root.querySelector<HTMLButtonElement>('.term-nav-settings')!;
    const navFooter=document.createElement('footer');navFooter.className='term-nav-footer';settings.before(navFooter);navFooter.append(settings);
    this.root.querySelectorAll<HTMLButtonElement>('.term-new-menu button').forEach(item=>{item.insertAdjacentHTML('afterbegin',icon(item.dataset.termAction==='new-local'?'terminal':'server'));});
    this.root.querySelectorAll<HTMLElement>('.term-menu > summary').forEach(summary=>{summary.setAttribute('aria-haspopup','menu');summary.setAttribute('aria-expanded','false');});
    this.root.querySelectorAll<HTMLButtonElement>('[data-term-action=new-local],[data-term-action=new-ssh]').forEach(button=>{button.disabled=!this.ready;});
    this.root.querySelector('.term-new-menu')?.toggleAttribute('inert',!this.ready);
    if(s){this.root.querySelector('.term-surface-mount')!.append(s.host);}
    const history=this.root.querySelector('.term-ai-history');if(history)history.scrollTop=bodyScroll;
    const nav=this.root.querySelector('.term-profile-list');if(nav)nav.scrollTop=oldNav;
    if(input&&this.root.isConnected){const next=this.root.querySelector<HTMLInputElement|HTMLTextAreaElement>(`#${input.id}`);if(next){next.focus({preventScroll:true});if(input.start!==null&&next.type!=='number')try{next.setSelectionRange(input.start,input.end);}catch{}}}
    else if(focusTerminal&&this.root.isConnected)s?.term?.focus();
    requestAnimationFrame(()=>this.fitActive());
  }
  private fitActive(){const s=this.active();if(!s?.term||!s.fit||!s.host.isConnected||s.host.clientWidth<40||s.host.clientHeight<40)return;try{s.fit.fit();}catch{/* Font measurement is retried on the next resize. */}}
  private async createLive(p:TerminalProfile,secret?:string,remember=false){
    const id=crypto.randomUUID();const count=this.sessions.filter(s=>s.profile.id===p.id).length+1;
    const s:LiveSession={id,profile:{...p},name:count>1?`${p.name} · ${count}`:p.name,status:'opening',cwd:p.cwd,error:'',host:document.createElement('div'),writeQueue:Promise.resolve(),path:p.cwd||'.',entries:[],fileBusy:false,fileError:'',truncated:false,aiDraft:'',contactId:'',tasks:[]};
    s.host.className='term-surface';this.sessions.push(s);this.current=id;this.render();
    try{
      const [{Terminal},{FitAddon}]=await Promise.all([import('@xterm/xterm'),import('@xterm/addon-fit'),import('@xterm/xterm/css/xterm.css')]);
      if(!this.sessions.includes(s))return;
      const term=new Terminal({fontFamily:'Cascadia Code, Consolas, Menlo, monospace',fontSize:this.preferences.fontSize,scrollback:this.preferences.scrollback,cursorBlink:true,allowProposedApi:false,allowTransparency:false,theme:this.theme(),convertEol:false});
      const fit=new FitAddon();term.loadAddon(fit);s.term=term;s.fit=fit;term.open(s.host);this.fitActive();
      term.onData(data=>{if(s.status!=='connected'&&s.status!=='opening')return;for(const piece of terminalInputChunks(data)){s.writeQueue=s.writeQueue.then(()=>invoke('terminal_write',{id:s.id,data:piece})).catch(e=>{if(s.status==='connected')this.toast(errorText(e));});}});
      term.onResize(({cols,rows})=>{if(s.status==='connected')void invoke('terminal_resize',{id:s.id,cols,rows}).catch(()=>{});});
      let resizeFrame=0;s.observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>this.fitActive());});s.observer.observe(s.host);
      const onEvent=new Channel<{type:string;data?:string;bytes?:number;code?:number;error?:string}>();
      onEvent.onmessage=event=>{
        if(event.type==='data'&&event.data){const bytes=Uint8Array.from(atob(event.data),c=>c.charCodeAt(0));if(this.sessions.includes(s)&&s.term)s.term.write(bytes,()=>{void invoke('terminal_ack',{id:s.id,bytes:event.bytes??bytes.length}).catch(()=>{});});else void invoke('terminal_ack',{id:s.id,bytes:event.bytes??bytes.length}).catch(()=>{});}
        if(event.type==='exit'){s.status=event.error?'error':'closed';s.error=event.error??'';term.writeln(`\r\n\x1b[90m[${t('会话已结束')}${event.code!==undefined&&event.code!==null?` · ${event.code}`:''}]\x1b[0m`);this.schedule();}
      };
      const result=await invoke<{cwd:string}>('terminal_open',{id,profileId:p.id,cols:term.cols,rows:term.rows,secret:secret??null,remember,onEvent});
      if(!this.sessions.includes(s)){await invoke('terminal_close',{id});return;}
      if(s.status==='opening')s.status='connected';s.cwd=result.cwd;this.render();term.focus();this.fitActive();
    }catch(e){s.status='error';s.error=errorText(e);this.render();this.toast(s.error);}
  }
  private theme(){return this.preferences.theme==='light'?{background:'#fbfaf8',foreground:'#30364b',cursor:'#7361b8',selectionBackground:'#cfc5ef'}:{background:'#202131',foreground:'#e4e1ee',cursor:'#c6b5ff',selectionBackground:'#65558499'};}
  private async connect(p:TerminalProfile){
    if(p.kind==='local'){await this.createLive(p);return;}
    this.toast(t('正在核对服务器指纹…'));
    const trust=await invoke<{fingerprint:string;previous:string|null;trusted:boolean;changed:boolean}>('terminal_probe_host',{profileId:p.id});
    if(!trust.trusted){
      const accepted=await confirm(`${p.host}:${p.port}\n${trust.changed?t('服务器指纹发生变化，请先通过可信渠道核对。'):t('首次连接，请通过可信渠道核对服务器指纹。')}\n\n${trust.fingerprint}${trust.previous?`\n${t('原指纹')}：${trust.previous}`:''}`,{title:t(trust.changed?'服务器身份已变化':'确认服务器身份'),kind:'warning',okLabel:t('信任并继续')});
      if(!accepted)return;await invoke('terminal_trust_host',{profileId:p.id,fingerprint:trust.fingerprint,previous:trust.previous});
    }
    const auth=await this.credentials(p);if(auth)await this.createLive(p,auth.secret,auth.remember);
  }
  private credentials(p:TerminalProfile):Promise<{secret?:string;remember:boolean}|null>{
    return new Promise(resolve=>{
      const d=this.makeDialog(t('连接服务器'));d.innerHTML=`<header><strong>${h('连接服务器')}</strong>${button('cancel','关闭','close')}</header><form><p>${esc(p.name)} · ${esc(p.username)}@${esc(p.host)}</p><label>${h(p.auth==='key'?'私钥口令':'登录密码')}<input name="secret" type="password" autocomplete="off" placeholder="${h('留空使用已保存的凭据')}" maxlength="4096"></label><label class="term-checkbox"><input type="checkbox" name="remember">${h('保存到系统凭据库')}</label><p class="term-muted">${h('仅用于本机 SSH 认证，不发送给 AI。')}</p><footer><button type="button" data-term-action="cancel">${h('取消')}</button><button type="submit" class="term-primary">${h('连接')}</button></footer></form>`;
      const finish=(result:{secret?:string;remember:boolean}|null)=>{const input=d.querySelector<HTMLInputElement>('[name=secret]');if(input)input.value='';this.closeDialog(d);resolve(result);};
      d.addEventListener('submit',e=>{e.preventDefault();const secret=d.querySelector<HTMLInputElement>('[name=secret]')!.value;finish({secret:secret||undefined,remember:d.querySelector<HTMLInputElement>('[name=remember]')!.checked});});
      d.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-term-action=cancel]'))finish(null);});d.addEventListener('cancel',e=>{e.preventDefault();finish(null);});d.showModal();d.querySelector<HTMLInputElement>('input')!.focus();
    });
  }
  private makeDialog(title:string){if(this.dialog?.open)throw new Error(t('请先关闭当前弹窗'));const d=document.createElement('dialog');d.className='terminal-dialog';d.setAttribute('aria-label',title);document.body.append(d);this.dialog=d;return d;}
  private closeDialog(d:HTMLDialogElement){d.close();d.remove();if(this.dialog===d)this.dialog=null;}
  private editProfile(p:TerminalProfile){
    const d=this.makeDialog(t(p.id?'编辑连接':'新建终端'));let value={...p};
    const draw=()=>{d.innerHTML=`<header><strong>${h(p.id?'编辑连接':p.kind==='ssh'?'SSH 连接':'本地终端')}</strong>${button('cancel','关闭','close')}</header><form><label>${h('名称')}<input name="name" required maxlength="80" value="${esc(value.name)}" placeholder="${h(p.kind==='ssh'?'例如：开发服务器':'例如：项目调试')}"></label>${p.kind==='local'?`<label>Shell<select name="shell">${this.shells.map(shell=>`<option value="${shell}" ${value.shell===shell?'selected':''}>${esc(shell)}</option>`).join('')}</select></label><label>${h('起始目录')}<div class="term-input-row"><input name="cwd" value="${esc(value.cwd)}" placeholder="${h('留空使用用户目录')}">${button('pick-directory','选择文件夹','folder')}</div></label>`:`<div class="term-form-pair"><label>${h('服务器地址')}<input name="host" required maxlength="255" value="${esc(value.host)}" placeholder="192.168.1.10"></label><label>${h('端口')}<input type="number" name="port" min="1" max="65535" value="${value.port}" required></label></div><label>${h('用户名')}<input name="username" required maxlength="128" value="${esc(value.username)}" autocomplete="off"></label><label>${h('认证方式')}<select name="auth"><option value="password" ${value.auth==='password'?'selected':''}>${h('密码')}</option><option value="key" ${value.auth==='key'?'selected':''}>${h('私钥')}</option></select></label>${value.auth==='key'?`<label>${h('私钥文件')}<div class="term-input-row"><input name="keyPath" required value="${esc(value.keyPath)}">${button('pick-key','选择私钥文件','folder')}</div></label>`:''}<label>${h('默认远程目录')}<input name="cwd" value="${esc(value.cwd)}" placeholder="${h('留空使用服务器默认目录')}"></label><p class="term-muted">${h('远程目录与 AI 命令首版按 Linux / POSIX Shell 处理。')}</p>`}<div class="term-form-pair"><label>${h('分组')}<input name="group" maxlength="80" value="${esc(value.group)}"></label><label>${h('环境')}<select name="environment">${[['','未标记'],['development','开发环境'],['test','测试环境'],['production','生产环境']].map(([id,label])=>`<option value="${id}" ${value.environment===id?'selected':''}>${h(label)}</option>`).join('')}</select></label></div><p class="term-form-error" role="alert"></p><footer><button type="button" data-term-action="cancel">${h('取消')}</button><button type="submit" class="term-primary">${h('保存')}</button></footer></form>`;};
    const collect=()=>{const form=d.querySelector('form')!;form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[name],select[name]').forEach(el=>{if(el.name==='port')value.port=Number(el.value);else (value as unknown as Record<string,string>)[el.name]=el.value;});};
    let busy=false;draw();
    d.addEventListener('input',collect);d.addEventListener('change',e=>{collect();if((e.target as HTMLInputElement).name==='auth')draw();});
    d.addEventListener('click',e=>{const action=(e.target as HTMLElement).closest<HTMLElement>('[data-term-action]')?.dataset.termAction;if(action==='cancel'&&!busy)this.closeDialog(d);if(action==='pick-directory'||action==='pick-key')void (async()=>{const path=await open({directory:action==='pick-directory',multiple:false});if(typeof path==='string'){collect();if(action==='pick-directory')value.cwd=path;else value.keyPath=path;draw();}})().catch(e=>this.toast(errorText(e)));});
    d.addEventListener('cancel',e=>{e.preventDefault();if(!busy)this.closeDialog(d);});
    d.addEventListener('submit',e=>{e.preventDefault();if(busy)return;busy=true;collect();d.querySelector<HTMLButtonElement>('[type=submit]')!.disabled=true;void (async()=>{try{const saved=await invoke<TerminalProfile>('terminal_save_profile',{value});this.profiles=[...this.profiles.filter(p=>p.id!==saved.id),saved];this.closeDialog(d);this.render();this.toast(t('已保存'));if(!p.id&&saved.kind==='local')await this.connect(saved);}catch(e){const error=d.querySelector('.term-form-error');if(d.isConnected&&error)error.textContent=errorText(e);else this.toast(errorText(e));}finally{busy=false;const submit=d.querySelector<HTMLButtonElement>('[type=submit]');if(submit)submit.disabled=false;}})();});
    d.showModal();d.querySelector<HTMLInputElement>('[name=name]')!.focus();
  }
  private async closeSession(s:LiveSession){
    if((s.status==='connected'||s.status==='opening')&&!await confirm(t(s.profile.kind==='ssh'?'关闭此 SSH 会话？远端任务可能仍在运行。':'关闭此终端及其中运行的本地程序？'),{title:t('关闭会话'),kind:'warning'}))return;
    await invoke('terminal_close',{id:s.id});this.sessions=this.sessions.filter(item=>item!==s);s.observer?.disconnect();s.term?.dispose();if(this.current===s.id)this.current=this.sessions.at(-1)?.id??'';this.render();
  }
  private async action(action:string,el:HTMLElement){
    this.closeMenu();
    if(!this.ready&&!['retry','settings','ai-settings','toggle-nav'].includes(action)){this.toast(this.error||t('终端正在加载，请稍候'));return;}
    const p=this.profiles.find(p=>p.id===el.dataset.id);const s=this.active();
    this.root.querySelectorAll<HTMLDetailsElement>('.term-menu[open]').forEach(d=>d.open=false);
    switch(action){
      case 'new-local':this.editProfile(newTerminalProfile('local',this.shells[0]??'powershell'));break;
      case 'new-ssh':this.editProfile(newTerminalProfile('ssh'));break;
      case 'edit-profile':if(p)this.editProfile(p);break;
      case 'delete-profile':if(p&&await confirm(t('删除连接配置及保存的凭据？已打开的会话可继续使用。'),{destructive:true,title:t('删除连接')})){await invoke('terminal_delete_profile',{id:p.id});this.profiles=this.profiles.filter(item=>item!==p);this.render();}break;
      case 'forget-secret':if(p&&await confirm(t('清除这条连接保存的密码或私钥口令？'),{title:t('清除保存的凭据')})){await invoke('terminal_forget_secret',{id:p.id});this.toast(t('已清除保存的凭据'));}break;
      case 'open':if(p){const live=this.sessions.find(s=>s.profile.id===p.id&&s.status==='connected');if(live){this.current=live.id;this.render();}else await this.connect(p);}break;
      case 'new-session':if(p)await this.connect(p);break;
      case 'select':this.current=el.dataset.id??'';this.render();this.active()?.term?.focus();break;
      case 'close-session':{const target=this.sessions.find(s=>s.id===el.dataset.id);if(target)await this.closeSession(target);break;}
      case 'reconnect':if(s)await this.connect(this.profiles.find(p=>p.id===s.profile.id)??s.profile);break;
      case 'settings':this.goSettings();break;
      case 'ai-settings':this.goAiSettings();break;
      case 'retry':await this.initialize();break;
      case 'toggle-nav':this.navOpen=!this.navOpen;this.render();break;
      case 'clear':s?.term?.clear();break;
      case 'hide-panel':this.panel=null;this.render();break;
      case 'files':if(s){this.panel=this.panel==='files'?null:'files';this.render();if(this.panel)await this.list(s,s.path);}break;
      case 'ai':if(s&&this.aiVisible){this.panel=this.panel==='ai'?null:'ai';this.render();if(this.panel)void invoke<{contacts:Contact[]}>('ai_workspace_load').then(data=>{this.contacts=data.contacts.filter(c=>c.kind==='api');this.render();}).catch(()=>{});}break;
      case 'file-refresh':if(s)await this.list(s,s.path);break;
      case 'file-up':if(s)await this.list(s,remoteParent(s.path));break;
      case 'file-open':if(s){const entry=s.entries.find(e=>e.path===el.dataset.path);if(entry?.directory)await this.list(s,entry.path);else if(entry)await this.preview(s,entry);}break;
      case 'file-upload':if(s){const paths=await open({multiple:true,directory:false});for(const local of typeof paths==='string'?[paths]:paths??[]){const name=local.split(/[\\/]/).at(-1)!;const exists=s.entries.some(e=>e.name===name);if(exists&&!await confirm(t('远程已有同名文件，确认覆盖？'),{kind:'warning',title:name}))continue;void this.transfer(s,'upload',local,remoteJoin(s.path,name),exists);}}break;
      case 'file-download':if(s){const entry=s.entries.find(e=>e.path===el.dataset.path);if(entry&&!entry.directory){const local=await save({defaultPath:entry.name});if(local)void this.transfer(s,'download',local,entry.path,true);}}break;
      case 'file-mkdir':if(s){const name=await this.textInput(t('新建文件夹'),'');if(name){await invoke('terminal_file_action',{id:s.id,operation:'mkdir',path:s.path,target:name});await this.list(s,s.path);}}break;
      case 'file-rename':if(s){const entry=s.entries.find(e=>e.path===el.dataset.path);if(entry){const name=await this.textInput(t('重命名'),entry.name);if(name&&name!==entry.name){await invoke('terminal_file_action',{id:s.id,operation:'rename',path:entry.path,target:name});await this.list(s,s.path);}}}break;
      case 'file-delete':if(s){const entry=s.entries.find(e=>e.path===el.dataset.path);if(entry&&await confirm(`${t('删除远程文件或空文件夹？')}\n${entry.path}`,{title:t('删除'),destructive:true})){await invoke('terminal_file_action',{id:s.id,operation:'remove',path:entry.path,target:null});await this.list(s,s.path);}}break;
      case 'transfer-cancel':await invoke('terminal_cancel_transfer',{id:el.dataset.id});break;
      case 'explain-selection':if(s){const selection=s.term?.getSelection();if(!selection){this.toast(t('请先在终端中选中文字'));break;}s.aiDraft=`${t('解释下面选中的终端输出：')}\n${selection.slice(0,8000)}`;this.render();}break;
      case 'ai-stop':if(s){const task=s.tasks.find(t=>t.busy);if(task)await invoke('terminal_ai_cancel',{id:task.id});}break;
      case 'ai-approve':case 'ai-reject':if(s){const task=s.tasks.find(t=>t.id===el.dataset.task);if(task){el.setAttribute('disabled','');try{await invoke('terminal_ai_approve',{id:task.id,approvalId:el.dataset.id,allow:action==='ai-approve'});}catch(e){el.removeAttribute('disabled');throw e;}}}break;
    }
  }
  private fileView(s:LiveSession){
    const transfers=this.transfers.filter(t=>t.session===s.id).slice(-8);
    return `<div class="term-files"><form id="term-path-form"><div class="term-input-row">${button('file-up','上一级','back')}<input name="path" value="${esc(s.path)}" aria-label="${h('远程路径')}"><button type="submit" class="term-icon" title="${h('打开目录')}">${icon('folder')}</button></div></form><div class="term-file-toolbar">${button('file-upload','上传文件','upload')}${button('file-mkdir','新建文件夹','add')}${button('file-refresh','刷新','refresh')}<small>${s.fileBusy?h('加载中…'):`${s.entries.length} ${h('项')}`}</small></div>${s.fileError?`<p class="term-error">${esc(s.fileError)}</p>`:''}<div class="term-file-list">${s.entries.map(entry=>`<div class="term-file-row"><button type="button" class="term-file-name" data-term-action="file-open" data-path="${esc(entry.path)}" title="${esc(entry.name)}">${icon(entry.directory?'folder':'file')}<span>${esc(entry.name)}<small>${entry.directory?h('文件夹'):formatBytes(entry.size)}${entry.symlink?` · ${h('符号链接')}`:''}</small></span></button><details class="term-menu"><summary aria-label="${h('更多操作')}">${icon('more')}</summary><div>${!entry.directory?`<button type="button" data-term-action="file-download" data-path="${esc(entry.path)}">${h('下载')}</button>`:''}<button type="button" data-term-action="file-rename" data-path="${esc(entry.path)}">${h('重命名')}</button><button type="button" data-term-action="file-delete" data-path="${esc(entry.path)}">${h('删除')}</button></div></details></div>`).join('')}${!s.entries.length&&!s.fileBusy?`<p class="term-muted">${h('此目录没有可显示的文件')}</p>`:''}${s.truncated?`<p class="term-muted">${h('目录较大，仅显示前 2000 项')}</p>`:''}</div>${transfers.length?`<div class="term-transfers">${transfers.map(x=>`<div class="term-transfer"><span title="${esc(x.error||x.name)}">${x.direction==='upload'?'↑':'↓'} ${esc(x.name)}<small>${x.status==='done'?h('已完成'):x.status==='error'?esc(x.error):`${formatBytes(x.done)} / ${formatBytes(x.total)} · ${formatBytes(x.speed)}/s`}</small></span>${x.status==='running'?button('transfer-cancel','取消传输','close',`data-id="${x.id}"`):''}<progress max="${Math.max(1,x.total)}" value="${x.done}"></progress></div>`).join('')}</div>`:''}</div>`;
  }
  private async list(s:LiveSession,path:string){if(s.fileBusy)return;s.fileBusy=true;s.fileError='';this.render();try{const result=await invoke<{path:string;entries:RemoteEntry[];truncated:boolean}>('terminal_file_action',{id:s.id,operation:'list',path,target:null});s.path=result.path;s.entries=result.entries;s.truncated=result.truncated;}catch(e){s.fileError=errorText(e);}finally{s.fileBusy=false;this.render();}}
  private async preview(s:LiveSession,entry:RemoteEntry){const result=await invoke<{text:string}>('terminal_file_action',{id:s.id,operation:'read',path:entry.path,target:null});const d=this.makeDialog(entry.name);d.classList.add('term-preview');d.innerHTML=`<header><strong>${esc(entry.name)}</strong>${button('cancel','关闭','close')}</header><pre></pre>`;d.querySelector('pre')!.textContent=result.text;d.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-term-action=cancel]'))this.closeDialog(d);});d.addEventListener('cancel',e=>{e.preventDefault();this.closeDialog(d);});d.showModal();}
  private textInput(title:string,initial:string):Promise<string|null>{return new Promise(resolve=>{const d=this.makeDialog(title);d.innerHTML=`<header><strong>${esc(title)}</strong>${button('cancel','关闭','close')}</header><form><label>${h('名称')}<input name="value" value="${esc(initial)}" required maxlength="255"></label><footer><button type="button" data-term-action="cancel">${h('取消')}</button><button type="submit" class="term-primary">${h('确认')}</button></footer></form>`;const finish=(value:string|null)=>{this.closeDialog(d);resolve(value);};d.addEventListener('submit',e=>{e.preventDefault();finish(d.querySelector<HTMLInputElement>('input')!.value);});d.addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-term-action=cancel]'))finish(null);});d.addEventListener('cancel',e=>{e.preventDefault();finish(null);});d.showModal();d.querySelector('input')!.select();});}
  private async transfer(s:LiveSession,direction:string,local:string,remote:string,overwrite:boolean){
    const transfer:Transfer={id:crypto.randomUUID(),session:s.id,name:local.split(/[\\/]/).at(-1)!,direction,done:0,total:0,speed:0,status:'running',error:''};this.transfers.push(transfer);this.transfers=this.transfers.filter(x=>x.status==='running'||this.transfers.indexOf(x)>=this.transfers.length-30);this.render();
    const onEvent=new Channel<{type:string;done?:number;total?:number;speed?:number}>();onEvent.onmessage=e=>{if(e.type==='progress'){transfer.done=e.done??0;transfer.total=e.total??0;transfer.speed=e.speed??0;this.schedule();}};
    try{await invoke('terminal_transfer',{id:s.id,transferId:transfer.id,direction,local,remote,overwrite,onEvent});transfer.status='done';this.toast(t('传输完成'));if(this.sessions.includes(s))await this.list(s,s.path);}catch(e){transfer.status='error';transfer.error=errorText(e);this.toast(transfer.error);}finally{this.render();}
  }
  private aiView(s:LiveSession){
    const busy=s.tasks.some(t=>t.busy);const approvals=s.tasks.flatMap(task=>task.approvals.map(a=>({task,a})));
    return `<div class="term-ai"><div class="term-ai-options"><select id="term-ai-contact" aria-label="${h('执行 AI')}" ${busy?'disabled':''}><option value="">${h('跟随主 AI')}</option>${this.contacts.map(c=>`<option value="${esc(c.id)}" ${s.contactId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>${button('ai-settings','AI 模型设置','settings')}${button('explain-selection','解释选中内容','terminal')}</div><p class="term-ai-boundary">${h('逐项确认后执行 · 独立通道 · 不读取键盘输入')}<small>${h('任意命令以目标账号权限运行，不属于系统沙箱。')}</small></p><div class="term-ai-history">${s.tasks.length?s.tasks.map(task=>`<article><p class="term-ai-question">${esc(task.prompt)}</p>${task.tools.map(tool=>`<details class="term-ai-tool"><summary>${esc(t(tool.title))} · ${esc(t(tool.state))}</summary><pre>${esc(tool.result?JSON.stringify(tool.result,null,2):'')}</pre></details>`).join('')}<div class="term-ai-answer">${esc(task.answer||(!task.error&&task.busy?t('正在思考…'):''))}</div>${task.error?`<p class="term-error">${esc(task.error)}</p>`:''}</article>`).join(''):`<div class="term-ai-empty">${icon('ai')}<strong>${h('让 AI 协助当前会话')}</strong><p>${h('描述任务，AI 会先请求确认具体操作。终端历史不会自动发送。')}</p></div>`}</div>${approvals.map(({task,a})=>`<div class="term-ai-approval"><strong>${esc(t(a.title))}</strong><p>${esc(a.detail.target)}${a.detail.environment==='production'?` · ${h('生产环境')}`:''}<br>${esc(a.detail.cwd||'~')}</p><pre>${esc(a.detail.content)}</pre><div><button type="button" data-term-action="ai-reject" data-task="${task.id}" data-id="${a.id}">${h('拒绝')}</button><button type="button" class="term-primary" data-term-action="ai-approve" data-task="${task.id}" data-id="${a.id}">${h('确认执行')}</button></div></div>`).join('')}<form id="term-ai-form"><textarea id="term-ai-prompt" rows="3" maxlength="10000" placeholder="${h('描述任务，Ctrl+Enter 发送')}" ${busy?'disabled':''}>${esc(s.aiDraft)}</textarea><footer><small>${h('操作结果会经过限量与脱敏')}</small>${busy?`<button type="button" data-term-action="ai-stop">${h('停止')}</button>`:`<button type="submit" class="term-primary" ${s.status!=='connected'?'disabled':''}>${h('发送')}</button>`}</footer></form></div>`;
  }
  private async ask(s:LiveSession){
    if(s.tasks.some(t=>t.busy)||s.status!=='connected'||!s.aiDraft.trim())return;
    const task:AiTask={id:crypto.randomUUID(),prompt:s.aiDraft.trim(),answer:'',error:'',busy:true,approvals:[],tools:[]};s.tasks.push(task);s.tasks=s.tasks.slice(-15);s.aiDraft='';this.render();
    const onEvent=new Channel<{type:string;text?:string;id?:string;title?:string;detail?:Approval['detail'];event?:{callId:string;title:string;state:string;result?:unknown}}>();
    onEvent.onmessage=e=>{if(e.type==='text')task.answer+=e.text??'';if(e.type==='approval')task.approvals.push({id:e.id!,title:e.title!,detail:e.detail!});if(e.type==='approvalResolved')task.approvals=task.approvals.filter(a=>a.id!==e.id);if(e.type==='tool'&&e.event){const old=task.tools.find(t=>t.callId===e.event!.callId);if(old)Object.assign(old,e.event);else task.tools.push(e.event);}this.schedule();};
    try{task.answer=await invoke<string>('terminal_ai_run',{id:task.id,sessionId:s.id,prompt:task.prompt,contactId:s.contactId||null,onEvent});}catch(e){task.error=errorText(e);}finally{task.busy=false;task.approvals=[];this.render();}
  }
  settingsView(){return `<section class="terminal-settings"><div class="settings-card"><div><strong>${h('终端外观')}</strong><p>${h('应用于当前及新建会话')}</p></div><select name="theme" aria-label="${h('终端主题')}"><option value="dark" ${this.preferences.theme==='dark'?'selected':''}>${h('深色')}</option><option value="light" ${this.preferences.theme==='light'?'selected':''}>${h('浅色')}</option></select></div><div class="settings-card"><div><strong>${h('终端字号')}</strong><p>10–24 px</p></div><input type="number" name="fontSize" min="10" max="24" value="${this.preferences.fontSize}"></div><div class="settings-card"><div><strong>${h('历史回滚行数')}</strong><p>${h('限制每个会话保留的输出，控制内存占用')}</p></div><select name="scrollback">${[500,1000,3000,5000,10000].map(n=>`<option ${n===this.preferences.scrollback?'selected':''}>${n}</option>`).join('')}</select></div><div class="settings-note">${h('SSH 密码与私钥口令保存在本机系统凭据库，可在连接菜单中清除。')}<br><br>${h('AI 每次读取文件或执行命令均需确认。任意命令拥有目标账号的权限；本机命令没有系统沙箱，远端停止也需要核对实际任务状态。')}</div></section>`;}
  private async savePreferences(root:HTMLElement){
    const value=terminalPreferences({theme:root.querySelector<HTMLSelectElement>('[name=theme]')!.value as 'dark'|'light',fontSize:Number(root.querySelector<HTMLInputElement>('[name=fontSize]')!.value),scrollback:Number(root.querySelector<HTMLSelectElement>('[name=scrollback]')!.value)});
    try{await invoke('terminal_save_preferences',{value});this.preferences=value;for(const s of this.sessions)if(s.term){s.term.options.fontSize=value.fontSize;s.term.options.scrollback=value.scrollback;s.term.options.theme=this.theme();}this.render();this.toast(t('已保存'));}catch(e){this.toast(errorText(e));}
  }
}
