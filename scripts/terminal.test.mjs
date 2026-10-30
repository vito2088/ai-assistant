import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {parseHTML} from 'linkedom';

function module(source,bindings={}){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,...bindings});return exports;}
const model=module(await readFile(new URL('../src/terminal-model.ts',import.meta.url),'utf8'));
const source=await readFile(new URL('../src/terminal.ts',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(handler=async()=>undefined,accept=false){
  const {window,document}=parseHTML('<html><body><div id="terminal-workspace-mount"></div></body></html>');
  window.innerWidth=880;window.innerHeight=620;
  window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
  window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:174,bottom:144,width:174,height:144};};
  const calls=[];const messages=[];const terminals=[];
  class Terminal {
    constructor(options){this.options=options;this.cols=80;this.rows=24;this.focusCalls=0;terminals.push(this);}
    loadAddon(){}onData(){}onResize(){}clear(){}dispose(){}writeln(){}
    open(host){this.element=document.createElement('div');this.element.className='xterm';host.append(this.element);}
    focus(){this.focusCalls++;}
    write(_data,done){done?.();}
  }
  const invoke=async(name,args)=>{calls.push({name,args});const result=await handler(name,args);if(name==='terminal_load'&&result===undefined)return {profiles:[],preferences:model.defaultTerminalPreferences,shells:['powershell','cmd']};if(name==='terminal_open'&&result===undefined)return {cwd:'C:/fixture'};return result;};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const {TerminalWorkspace}=module(source,{document,window,HTMLInputElement:window.HTMLInputElement,HTMLTextAreaElement:window.HTMLTextAreaElement,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},ResizeObserver:class {observe(){}disconnect(){}},crypto:webcrypto,setTimeout,clearTimeout,require:name=>{
    if(name==='./terminal-model')return model;
    if(name==='@xterm/xterm')return {Terminal};
    if(name==='@xterm/addon-fit')return {FitAddon:class {fit(){}}};
    if(name==='@tauri-apps/api/core')return {invoke,Channel:class {onmessage=()=>{};}};
    if(name==='@tauri-apps/plugin-dialog')return {open:async()=>null,save:async()=>null};
    if(name==='./app-dialog')return {confirm:async()=>accept};
    if(name==='./i18n')return {t:s=>s,h:escape,getLocale:()=> 'zh-CN'};return {};
  }});
  const workspace=new TerminalWorkspace(text=>messages.push(text),()=>{},()=>{});
  return {workspace,document,window,calls,messages,terminals};
}

test('remote filenames cannot traverse and preferences repair invalid persisted values',()=>{
  for(const name of ['..','../a','a/b','a\\b','a\nb',''])assert.throws(()=>model.remoteJoin('/srv',name));
  assert.equal(model.remoteJoin('/','a.txt'),'/a.txt');assert.equal(model.remoteParent('/srv/demo/'),'/srv');
  assert.equal(JSON.stringify(model.terminalPreferences({fontSize:100,scrollback:-1,theme:'broken'})),JSON.stringify(model.defaultTerminalPreferences));
  const unicode='a'.repeat(8191)+'😀中'.repeat(9000);const chunks=[...model.terminalInputChunks(unicode)];assert.equal(chunks.join(''),unicode);for(const chunk of chunks){assert.ok(Buffer.byteLength(chunk)<=65536);assert.equal(Buffer.from(chunk).toString(),chunk);}
});

test('one submit opens the first visible child session and repeated submit while pending never duplicates it',async()=>{
  let complete;const f=fixture(async(name,args)=>{if(name==='terminal_save_profile')return new Promise(resolve=>{complete=()=>resolve({...args.value,id:'saved-profile'});});});
  await f.workspace.initialize();f.workspace.afterRender();
  f.document.querySelector('[data-term-action=new-local]').click();
  const input=f.document.querySelector('dialog input[name=name]');input.value='本地测试';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));
  const form=f.document.querySelector('dialog form');form.dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(f.calls.filter(c=>c.name==='terminal_save_profile').length,1);assert.equal(f.calls.at(-1).args.value.name,'本地测试');
  complete();await tick();assert.equal(f.document.querySelector('dialog'),null);assert.match(f.document.querySelector('.term-profile-list').textContent,/本地测试/);
  const opened=f.calls.filter(c=>c.name==='terminal_open');assert.equal(opened.length,1);assert.equal(opened[0].args.profileId,'saved-profile');assert.equal(f.workspace.current,opened[0].args.id);assert.equal(f.workspace.sessions[0].status,'connected');assert.ok(f.terminals[0].focusCalls>0);
  assert.equal(f.document.querySelector('.term-profile-name').dataset.termAction,'open');assert.equal(f.document.querySelectorAll('.term-session-list .term-session-row').length,1);
  const selected=f.document.querySelector('.term-session-list .term-session-row.selected');assert.equal(selected.querySelector('button').dataset.id,opened[0].args.id);assert.equal(selected.querySelector('button').getAttribute('aria-current'),'page');assert.match(selected.textContent,/已连接/);
});

test('editing a saved profile does not create an extra session and multiple sessions remain individually selectable',async()=>{
  const f=fixture(async(name,args)=>name==='terminal_save_profile'?args.value:undefined,true);await f.workspace.initialize();f.workspace.afterRender();
  const p={...model.newTerminalProfile('local','cmd'),id:'existing',name:'原连接'};f.workspace.profiles=[p];
  f.workspace.editProfile(p);const input=f.document.querySelector('dialog input[name=name]');input.value='已改名';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.document.querySelector('dialog form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.calls.filter(c=>c.name==='terminal_open').length,0);
  const saved=f.workspace.profiles[0];await f.workspace.createLive(saved);await f.workspace.createLive(saved);
  assert.equal(f.document.querySelectorAll('.term-session-list .term-session-row').length,2);const first=f.workspace.sessions[0];f.document.querySelector(`[data-term-action=select][data-id="${first.id}"]`).click();await tick();assert.equal(f.workspace.current,first.id);assert.ok(first.term.focusCalls>1);
  await f.workspace.closeSession(f.workspace.sessions[1]);assert.equal(f.document.querySelectorAll('.term-session-list .term-session-row').length,1);assert.equal(f.document.querySelector('.term-session-row.selected button').dataset.id,first.id);
  await f.workspace.closeSession(first);assert.equal(f.document.querySelector('.term-session-list'),null);assert.equal(f.document.querySelector('.term-profile-name').dataset.id,saved.id);
});

test('a failed save preserves the form without starting a terminal',async()=>{
  const f=fixture(async name=>{if(name==='terminal_save_profile')throw 'save failed';});await f.workspace.initialize();f.workspace.afterRender();f.document.querySelector('[data-term-action=new-local]').click();
  const input=f.document.querySelector('dialog input[name=name]');input.value='保留草稿';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.document.querySelector('dialog form').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(f.document.querySelector('dialog input[name=name]').value,'保留草稿');assert.match(f.document.querySelector('.term-form-error').textContent,/save failed/);assert.equal(f.calls.filter(c=>c.name==='terminal_open').length,0);
});

test('connection menus float outside the scrolling list, stay in the viewport, and edit the selected connection',async()=>{
  const f=fixture();await f.workspace.initialize();f.workspace.profiles=[{...model.newTerminalProfile('local'),id:'first',name:'第一条连接'},{...model.newTerminalProfile('local'),id:'second',name:'第二条连接'}];f.workspace.render();f.workspace.afterRender();
  const trigger=f.document.querySelectorAll('.term-profile-menu > summary')[1];trigger.getBoundingClientRect=()=>({left:181,right:206,top:540,bottom:567,width:25,height:27});trigger.click();
  const popup=f.document.querySelector('.term-menu-popup');assert.equal(popup.parentElement,f.document.body);assert.equal(f.document.querySelector('.term-profile-list').contains(popup),false);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(popup.getAttribute('role'),'menu');
  assert.ok(Number.parseFloat(popup.style.left)>=8);assert.ok(Number.parseFloat(popup.style.left)+174<=872);assert.ok(Number.parseFloat(popup.style.top)+144<=612);assert.ok(Number.parseFloat(popup.style.top)<540,'a menu near the bottom opens above its trigger');
  popup.querySelector('[data-term-action=edit-profile]').click();await tick();assert.equal(f.document.querySelector('.term-menu-popup'),null);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(f.document.querySelector('dialog input[name=name]').value,'第二条连接');
});

test('menus close on outside input, Escape and page changes without leaving a detached popup',async()=>{
  const f=fixture();await f.workspace.initialize();f.workspace.profiles=[{...model.newTerminalProfile('local'),id:'profile',name:'终端'}];f.workspace.render();f.workspace.afterRender();
  const trigger=f.document.querySelector('.term-profile-menu > summary');trigger.getBoundingClientRect=()=>({left:0,right:20,top:40,bottom:67,width:20,height:27});trigger.click();assert.equal(f.document.querySelector('.term-menu-popup').style.left,'8px');
  f.document.body.dispatchEvent(new f.window.Event('pointerdown',{bubbles:true}));assert.equal(f.document.querySelector('.term-menu-popup'),null);
  let restored=false;trigger.focus=()=>{restored=true;};trigger.click();const escape=new f.window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';f.document.dispatchEvent(escape);assert.equal(f.document.querySelector('.term-menu-popup'),null);assert.equal(restored,true);
  trigger.click();assert.ok(f.document.querySelector('.term-menu-popup'));f.workspace.beforeRender();assert.equal(f.document.querySelector('.term-menu-popup'),null);assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('an outdated backend shows a restart hint, prevents unavailable actions, and can reload after restart',async()=>{
  let outdated=true;const f=fixture(async name=>{if(name==='terminal_load'&&outdated)throw 'Command terminal_load not found';});
  await f.workspace.initialize();f.workspace.afterRender();
  assert.match(f.document.body.textContent,/应用界面与运行版本不一致/);assert.equal(f.document.body.textContent.includes('Command terminal_load not found'),false);
  assert.equal(f.document.querySelector('[data-term-action=new-local]').disabled,true);assert.equal(f.document.querySelector('.term-new-menu').hasAttribute('inert'),true);
  await f.workspace.action('new-local',f.document.querySelector('[data-term-action=new-local]'));assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.calls.length,1);
  outdated=false;f.document.querySelector('[data-term-action=retry]').click();await tick();
  assert.equal(f.document.querySelector('.term-error'),null);assert.equal(f.document.querySelector('[data-term-action=new-local]').disabled,false);assert.equal(f.calls.filter(call=>call.name==='terminal_load').length,2);
});

test('global app renders preserve the same terminal DOM and unsent AI draft',async()=>{
  const f=fixture();await f.workspace.initialize();const host=f.document.createElement('div');host.textContent='persistent terminal';
  const profile={...model.newTerminalProfile('local'),id:'profile',name:'test'};
  f.workspace.sessions=[{id:'session',name:'test',profile,status:'connected',cwd:'C:/test',host,aiDraft:'还没发送',contactId:'',tasks:[],entries:[]}];f.workspace.current='session';f.workspace.panel='ai';f.workspace.render();f.workspace.afterRender();
  assert.equal(f.document.querySelector('.term-surface-mount').firstChild,host);
  f.workspace.beforeRender();f.document.body.innerHTML='<div>another page</div>';assert.equal(host.isConnected,false);
  f.document.body.innerHTML=f.workspace.view();f.workspace.afterRender();assert.equal(f.document.querySelector('.term-surface-mount').firstChild,host);assert.equal(f.document.querySelector('#term-ai-prompt').value,'还没发送');
  assert.ok(f.document.querySelector('[data-term-action=select][data-id=session]'),'sessions remain selectable after their profile is deleted');
  f.workspace.setAiVisible(false);assert.equal(f.document.querySelector('.term-ai'),null);assert.equal(f.document.querySelector('.terminal-workspace').dataset.aiEnabled,'false');
});

test('unconfirmed server identity cannot reach trust or authentication',async()=>{
  const f=fixture(async name=>name==='terminal_probe_host'?{fingerprint:'SHA256:new',previous:'SHA256:old',trusted:false,changed:true}:undefined);
  await f.workspace.connect({...model.newTerminalProfile('ssh'),id:'remote',name:'remote',host:'localhost',username:'test'});
  assert.deepEqual(f.calls.map(c=>c.name),['terminal_probe_host']);
});

test('AI sends only the explicit task and approvals stay bound to the displayed task',async()=>{
  let finish;const f=fixture(async(name,args)=>{if(name==='terminal_ai_run'){args.onEvent.onmessage({type:'approval',id:'approval-id',title:'执行终端命令',detail:{target:'test',cwd:'/srv',content:'echo test'}});return new Promise(resolve=>{finish=resolve;});}});
  await f.workspace.initialize();const host=f.document.createElement('div');host.textContent='terminal history must stay local';
  const s={id:'session',name:'test',profile:{...model.newTerminalProfile('ssh'),id:'p',name:'test'},status:'connected',cwd:'/srv',host,aiDraft:'检查服务状态',contactId:'',tasks:[],entries:[]};
  f.workspace.sessions=[s];f.workspace.current=s.id;f.workspace.panel='ai';f.workspace.afterRender();const task=f.workspace.ask(s);await tick();f.workspace.render();
  const request=f.calls.find(c=>c.name==='terminal_ai_run');assert.equal(request.args.prompt,'检查服务状态');assert.equal(JSON.stringify(request.args).includes('terminal history must stay local'),false);
  f.document.querySelector('[data-term-action=ai-reject]').click();await tick();const decision=f.calls.find(c=>c.name==='terminal_ai_approve');assert.equal(decision.args.allow,false);assert.equal(decision.args.id,request.args.id);assert.equal(decision.args.approvalId,'approval-id');
  finish('已停止');await task;assert.equal(s.tasks[0].busy,false);assert.equal(s.tasks[0].approvals.length,0);
});
