import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/ai-workspace-model.ts',import.meta.url),'utf8');
const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto:{randomUUID},require:()=>({})});
const {createConversation,planTasks,materializePlan,nextTasks,visibleMessages,restoreConversation,mentions}=exports;
const contacts=[{id:'ds',name:'DeepSeek',aliases:['DS']},{id:'gpt',name:'GPT',aliases:['审查员']},{id:'codex',name:'Codex',aliases:[]}];
const plain=v=>JSON.parse(JSON.stringify(v));
function group(){return createConversation(['ds','gpt','codex'],'测试组',true);}
test('routes explicit mentions and direct names without broadcasting unaddressed messages',()=>{
 const c=group();assert.deepEqual(plain(planTasks('请整理需求',c,contacts)).map(s=>s.contactId),['ds']);assert.deepEqual(plain(planTasks('@GPT 检查一下',c,contacts)).map(s=>s.contactId),['gpt']);assert.deepEqual(plain(planTasks('审查员，请检查',c,contacts)).map(s=>s.contactId),['gpt']);assert.deepEqual(plain(planTasks('这份文档提到了 GPT 的能力',c,contacts)).map(s=>s.contactId),['ds']);
});
test('implements dependency ordering even when the reviewer is mentioned first',()=>{
 const c=group(),previous={id:'work',contactId:'ds',status:'running'};c.tasks.push(previous);
 const steps=planTasks('@GPT 让他等 @DS干完活后检查下他',c,contacts);assert.equal(steps.length,1);assert.equal(steps[0].contactId,'gpt');assert.deepEqual(plain(steps[0].dependsOnTasks),['work']);
 const tasks=materializePlan(steps,'message');c.tasks.push(...tasks);assert.equal(nextTasks(c).length,0);previous.status='done';assert.equal(nextTasks(c)[0].contactId,'gpt');
});
test('plans worker then review and blocks downstream work after actual failure',()=>{
 const c=group(),steps=planTasks('@DS 先实现功能，@GPT 等 DS 完成后检查',c,contacts),tasks=materializePlan(steps,'message');c.tasks.push(...tasks);assert.equal(nextTasks(c).length,1);assert.equal(nextTasks(c)[0].contactId,'ds');tasks[0].status='error';nextTasks(c);assert.equal(tasks[1].status,'blocked');
});
test('ambiguous waits never invent work for another contact',()=>{assert.throws(()=>planTasks('@GPT 等 @DS 做完后检查',group(),contacts),/先给/);});
test('member filtering changes display only and supports multi-selection including self',()=>{
 const c=group();c.messages=[{id:'a',sender:'user'},{id:'b',sender:'ds'},{id:'c',sender:'gpt'}];c.tasks=[{id:'work',contactId:'ds',status:'running'}];c.filter=['user','gpt'];assert.deepEqual(plain(visibleMessages(c)).map(m=>m.id),['a','c']);assert.equal(c.tasks[0].status,'running');c.filter=[];assert.equal(visibleMessages(c).length,0);c.filter=null;assert.equal(visibleMessages(c).length,3);
});
test('recovery restores committed outputs and never silently restarts interrupted jobs',()=>{
 const c=group();c.tasks=[{id:'a',contactId:'ds',replyId:'r1',status:'running'},{id:'b',contactId:'gpt',replyId:'r2',status:'queued'}];c.messages=[{id:'r1',text:'partial',status:'generating'},{id:'r2',text:'',status:'generating'}];restoreConversation(c,[{id:'a',state:'done',result:{text:'actual result',sessionId:'engine-id'}}]);assert.equal(c.tasks[0].status,'done');assert.equal(c.messages[0].text,'actual result');assert.equal(c.engineSessions.ds,'engine-id');assert.equal(c.tasks[1].status,'interrupted');assert.equal(nextTasks(c).length,0);
});
test('contact aliases with regexp characters and similar names route to exact IDs',()=>{const people=[{id:'a',name:'GPT+',aliases:[]},{id:'b',name:'GPT',aliases:[]}];assert.deepEqual(plain(mentions('@GPT+ 帮忙',people)).map(m=>m.id),['a']);});

const uiSource=await readFile(new URL('../src/ai-workspace.ts',import.meta.url),'utf8');
const uiCode=ts.transpileModule(uiSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function settle(test,limit=200){for(let i=0;i<limit;i++){if(test())return;await tick();}assert.fail('workspace did not settle');}
function uiFixture(handler){
 const calls=[],saved=new Map(),notices=[];
 const profiles=[{id:'p',name:'Service',model:'test',baseUrl:'http://localhost:1234/v1',hasKey:false,vision:true}];
 const mock={invoke:async(name,args)=>{calls.push({name,args});const result=await handler?.(name,args);if(result!==undefined)return result;if(name==='ai_workspace_save_conversation'){saved.set(args.value.id,plain(args.value));return;}if(name==='ai_workspace_cancel')return;if(name==='ai_cli_detect')return{installed:true,version:'test',path:'C:/test.exe'};throw Error('Unexpected '+name);},Channel:class{}};
 const translations={t:(s,args=[])=>s.replace(/\{(\d+)\}/g,(_,i)=>args[i]??''),h:s=>s};
 const module={};vm.runInNewContext(uiCode,{exports:module,require:name=>name==='./ai-workspace-model'?exports:name==='./ai-tool-state'?{toolActivityView:()=>'',applyToolEvent:()=>[]}:name==='./i18n'?translations:name==='@tauri-apps/api/core'?mock:name==='@tauri-apps/api/event'?{listen:async()=>{}}:name==='./app-dialog'?{confirm:async()=>true}:name==='@tauri-apps/plugin-dialog'?{open:async()=>null}: {},crypto:{randomUUID},window:{setTimeout},clearTimeout,Date,console,structuredClone,document:{querySelector:()=>null},navigator:{},URL});
 const workspace=new module.AiWorkspace(()=>{},s=>notices.push(s),()=>profiles);
 workspace.ready=true;workspace.contacts=contacts.map(c=>({...c,kind:'api',profileId:'p',model:'',permission:{...exports.defaultPermission('api'),mode:'workspace',appTools:true},instructions:'',executable:''}));
 const c=group();workspace.conversations=[c];workspace.current=c.id;return{workspace,c,calls,saved,notices};
}
test('real UI scheduler waits for successful execution and binds tasks to exact contact IDs',async()=>{
 const gate=deferred(),order=[];
 const f=uiFixture(async(name,args)=>{if(name==='ai_workspace_run'){const task=f.c.tasks.find(t=>t.id===args.id);order.push(task.contactId);if(task.contactId==='ds')await gate.promise;args.onEvent.onmessage({type:'text',text:task.contactId+' result'});return{text:task.contactId+' done',sessionId:task.contactId+'-session'};}});
 f.c.draft='@DS 先实现功能，@GPT 等 DS 完成后检查';await f.workspace.submit({id:'aiw-chat-form'});await settle(()=>order.length===1);assert.deepEqual(order,['ds']);assert.equal(f.c.tasks[1].status,'queued');gate.resolve();await settle(()=>f.c.tasks.every(t=>t.status==='done'));assert.deepEqual(order,['ds','gpt']);assert.equal(f.c.engineSessions.gpt,'gpt-session');assert.equal(f.c.messages.at(-1).text,'gpt done');
});
test('failed worker blocks review, and member filtering never starts or stops tasks',async()=>{
 const order=[];const f=uiFixture(async(name,args)=>{if(name==='ai_workspace_run'){order.push(f.c.tasks.find(t=>t.id===args.id).contactId);throw Error('actual failure');}});
 f.c.draft='@DS 实现功能，@GPT 等 DS 完成后检查';await f.workspace.submit({id:'aiw-chat-form'});await settle(()=>f.c.tasks[1].status==='blocked');await f.workspace.change({dataset:{aiwFilter:'ds'},checked:false});assert.deepEqual(order,['ds']);assert.equal(f.c.tasks[0].status,'error');assert.equal(f.c.tasks[1].status,'blocked');assert.ok(!f.c.filter.includes('ds'));
});
test('cancelling while persistence is pending cannot start the CLI afterwards',async()=>{
 const gate=deferred();let saves=0;
 const f=uiFixture(async(name)=>{if(name==='ai_workspace_save_conversation'&&++saves===2)await gate.promise;});
 f.c.draft='@DS 帮我整理';await f.workspace.submit({id:'aiw-chat-form'});await settle(()=>saves===2);const stop=f.workspace.action('aiw-stop-all',{dataset:{}});await tick();gate.resolve();await stop;await settle(()=>f.workspace.running.size===0);assert.equal(f.calls.filter(c=>c.name==='ai_workspace_run').length,0);assert.equal(f.c.tasks[0].status,'cancelled');
});
test('failed initial persistence preserves the input and creates no executable task',async()=>{
 const f=uiFixture(async(name)=>{if(name==='ai_workspace_save_conversation')throw Error('disk full');});f.c.draft='@DS 创建文件';await assert.rejects(()=>f.workspace.submit({id:'aiw-chat-form'}),/disk full/);assert.equal(f.c.messages.length,0);assert.equal(f.c.tasks.length,0);assert.equal(f.c.draft,'@DS 创建文件');assert.equal(f.calls.some(c=>c.name==='ai_workspace_run'),false);
});
test('CLI-only workspace has no API-key gate and escapes contact and message markup',()=>{
 const f=uiFixture();f.workspace.contacts=[{...f.workspace.contacts[0],id:'cli',kind:'codex',name:'<script>alert(1)</script>'}];f.workspace.cli={codex:{installed:true}};f.c.members=['cli'];f.c.defaultContactId='cli';f.c.messages.push({id:'x',sender:'cli',text:'<img src=x onerror=alert(1)>',createdAt:1,status:'done'});const html=f.workspace.view();assert.ok(!html.includes('ai-key-mask'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img src=x onerror='));
});
