import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const compile = async name => ts.transpileModule(await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modelCode = await compile('ai-model');
const presetsCode = await compile('ai-presets');
const uiCode = await compile('ai');
const translationCode = await compile('capture-translation');
function load(code, bindings = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, ...bindings });
  return exports;
}
const presets = load(presetsCode);
const localeData = load(await compile('locales'));
const i18n = load(await compile('i18n'), { require: () => localeData });
const toolState = load(await compile('ai-tool-state'), { require: () => i18n });
const connection = load(await compile('ai-connection'), { require: () => i18n });
const model = load(modelCode, { require: () => toolState });
const plain = value => JSON.parse(JSON.stringify(value));
const session = id => ({ id, title: id, updatedAt: 1, messages: [], attachments: [] });
const button = (session, extra = {}) => ({ dataset: { session, ...extra } });
const input = value => ({ id: 'ai-input', value, dataset: {} });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function fixture({ config = {}, profiles, sessions = [session('s1')], handler, notes = [] } = {}) {
  const catalog = { profiles: profiles ?? [{ id: 'primary', name: '主模型', provider: 'custom', baseUrl: 'http://localhost:11434/v1', model: 'test', vision: true, language: '中文', hasKey: false, ...config }], activeId: profiles?.[0]?.id ?? 'primary' };
  const saved = new Map(sessions.map(s => [s.id, plain(s)]));
  const calls = [], notices = [], timers = new Map(), listeners = new Map();
  let timerId = 0;
  const invoke = async (name, args) => {
    calls.push({ name, args });
    if (handler) { const result = await handler(name, args); if (result !== undefined) return result; }
    if (name === 'ai_sessions') return plain([...saved.values()]);
    if (name === 'ai_settings') return plain(catalog);
    if (name === 'ai_save_settings') {
      const index = catalog.profiles.findIndex(p => p.id === args.settings.id);
      if (index < 0) catalog.profiles.push(plain(args.settings)); else catalog.profiles[index] = plain(args.settings);
      if (!catalog.activeId) catalog.activeId = args.settings.id;
      return plain(catalog);
    }
    if (name === 'ai_select_model') { catalog.activeId = args.id; return plain(catalog); }
    if (name === 'ai_delete_model') {
      catalog.profiles = catalog.profiles.filter(p => p.id !== args.id);
      if (catalog.activeId === args.id) catalog.activeId = catalog.profiles[0]?.id ?? '';
      return plain(catalog);
    }
    if (name === 'ai_save_session') { saved.set(args.session.id, plain(args.session)); return null; }
    if (name === 'ai_delete_session') { if (args.id) saved.delete(args.id); else saved.clear(); return null; }
    if (name === 'ai_generate') { args.onDelta.onmessage?.('测试'); return '测试回答'; }
    if (name === 'ai_test_connection') return { elapsedMs: 12 };
    if (name === 'ai_cancel' || name === 'ai_add_todos') return null;
    throw new Error(`Unexpected command ${name}`);
  };
  const { Ai } = load(uiCode, {
    structuredClone,
    require: name => name === './ai-workspace' ? { AiWorkspace: class { ready=false; afterRender(){} async initialize(){} async syncProfiles(){} async clearHistory(){} input(){return false} async change(){return false} async submit(){return false} async action(){return false} } } : name === './i18n' ? i18n : name === './ai-tool-state' ? toolState : name === './ai-connection' ? connection : name === './ai-model' ? model : name === './ai-presets' ? presets : name === './ai.css' ? {} : name === '@tauri-apps/api/event' ? { listen: async (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name); } } : name === '@tauri-apps/api/core' ? { invoke, Channel: class {} } : { confirm: async () => true },
    crypto: { randomUUID }, clearTimeout: id => timers.delete(id),
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; } },
    document: { querySelectorAll: () => [], querySelector: () => null },
  });
  const ai = new Ai(() => {}, text => notices.push(text), () => {}, () => notes, async () => {});
  await ai.initialize();
  const flush = async () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await tick(); };
  return { ai, saved, calls, notices, flush, catalog, listeners };
}

test('AI page masks controls without a selected usable key and links directly to configuration', async () => {
  const empty = await fixture({ profiles: [] });
  assert.match(empty.ai.settingsView(), /id="ai-primary-model"[^>]*disabled/);
  assert.match(empty.ai.view(), /inert aria-hidden="true"/);
  assert.match(empty.ai.view(), /data-action="ai-configure"/);
  empty.ai.openConfiguration();
  assert.match(empty.ai.settingsView(), /ai-api-key/);
  const cloud = await fixture({ config: { baseUrl: 'https://example.org/v1', hasKey: false } });
  assert.match(cloud.ai.view(), /ai-key-mask/);
  cloud.catalog.profiles[0].hasKey = true;
  await cloud.ai.reloadSettings();
  assert.doesNotMatch(cloud.ai.view(), /ai-key-mask/);
  const local = await fixture();
  assert.doesNotMatch(local.ai.view(), /ai-key-mask/, 'configured local password-free services remain usable');
});

test('changing the primary AI persists the binding and the next translation uses that model', async () => {
  const f=await fixture();
  f.catalog.profiles.push({...f.catalog.profiles[0],id:'translator',name:'翻译助手',model:'translation-model',vision:false});
  await f.ai.reloadSettings();
  const generated=[];
  const {translateCaptureText}=load(translationCode,{
    crypto:{randomUUID},require:name=>name==='./i18n'?i18n:{Channel:class{},invoke:async(name,args)=>{
      if(name==='ai_settings')return plain(f.catalog);
      if(name==='ai_generate'){generated.push(args);return 'Translation';}
      throw Error('Unexpected '+name);
    }},
  });
  await translateCaptureText('你好',new AbortController().signal);
  assert.equal(generated[0].profileId,'primary');
  await f.ai.change({id:'ai-primary-model',value:'translator'});
  assert.equal(f.catalog.activeId,'translator');
  assert.equal(f.calls.filter(c=>c.name==='ai_select_model').at(-1).args.id,'translator');
  await translateCaptureText('第二次翻译',new AbortController().signal);
  assert.equal(generated[1].profileId,'translator');
  await f.ai.reloadSettings();
  assert.match(f.ai.settingsView(),/<option value="translator" selected>/);
  assert.equal(f.calls.filter(c=>c.name==='ai_save_settings'||c.name==='ai_workspace_save_contact').length,0);
});

test('failed primary AI changes retain the previous binding and selection',async()=>{
  const f=await fixture({handler:name=>{if(name==='ai_select_model')throw Error('cannot save');}});
  f.catalog.profiles.push({...f.catalog.profiles[0],id:'other',name:'Other'});
  await f.ai.reloadSettings();
  await assert.rejects(f.ai.change({id:'ai-primary-model',value:'other'}),/cannot save/);
  assert.equal(f.catalog.activeId,'primary');
  assert.match(f.ai.settingsView(),/<option value="primary" selected>/);
  assert.equal(f.ai.hasActiveModel(),true);
});

test('testing a draft never saves or selects a model; explicit save and switching preserve the chat draft', async () => {
  const f = await fixture();
  f.ai.input(input('保留草稿'));
  await f.ai.action('ai-add-model', button());
  await f.ai.change({ id: 'ai-provider', value: 'deepseek' });
  f.ai.input({ id: 'ai-config-name', value: '第二模型', dataset: {} });
  await f.ai.action('ai-test', button());
  assert.equal(f.catalog.profiles.length, 1);
  assert.equal(f.calls.filter(c => c.name === 'ai_save_settings' || c.name === 'ai_generate').length, 0);
  assert.equal(f.calls.find(c => c.name === 'ai_test_connection').args.settings.baseUrl, 'https://api.deepseek.com');
  assert.match(f.ai.settingsView(), /连接测试成功/);
  assert.doesNotMatch(f.ai.settingsView(), /保存并测试/);
  await f.ai.submit({ id: 'ai-settings-form' });
  const second = f.catalog.profiles[1];
  assert.equal(f.catalog.activeId, 'primary');
  assert.equal(second.baseUrl, 'https://api.deepseek.com');
  await f.ai.action('ai-use-model', button(undefined, { profile: second.id }));
  assert.match(f.ai.view(), /保留草稿/);
  await f.ai.submit({ id: 'ai-chat-form' });
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').at(-1).args.profileId, second.id);
  assert.equal(f.saved.get('s1').messages.at(-1).modelLabel, `第二模型 · ${second.model}`);
});

test('model mappings preserve legacy models, select actual IDs and persist aliases without mutating saved profiles', async () => {
  const f = await fixture();
  assert.doesNotMatch(f.ai.settingsView(), /id="ai-settings-form"/);
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  assert.match(f.ai.settingsView(), /模型映射/);
  await f.ai.action('ai-add-mapping', button());
  f.ai.input({ value: '翻译助手', dataset: { mappingName: '1' } });
  f.ai.input({ value: 'real-model-b', dataset: { mappingModel: '1' } });
  f.ai.input({ checked: true, dataset: { mappingActive: '1' } });
  assert.equal(f.catalog.profiles[0].model, 'test');
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.equal(f.catalog.profiles[0].model, 'real-model-b');
  assert.equal(f.catalog.profiles[0].modelMappings[1].name, '翻译助手');
  f.ai.input(input('问题')); await f.ai.submit({ id: 'ai-chat-form' });
  assert.match(f.saved.get('s1').messages.at(-1).modelLabel, /翻译助手 · real-model-b/);
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  await f.ai.action('ai-remove-mapping', button(undefined, { index: '1' }));
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.equal(f.catalog.profiles[0].model, 'test');
});

test('fetching models does not save or select; picker replaces only its row and language selection persists', async () => {
  const f = await fixture({ handler: name => name === 'ai_list_models' ? ['model-a', 'model-b'] : undefined });
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  f.ai.input({ id: 'ai-api-key', value: 'test-only-key', dataset: {} });
  assert.doesNotMatch(f.ai.settingsView(), /class="ai-model-dropdown"/);
  await f.ai.action('ai-fetch-models', button());
  assert.match(f.ai.settingsView(), /class="ai-model-dropdown"/);
  assert.equal(f.calls.find(c => c.name === 'ai_list_models').args.apiKey, 'test-only-key');
  assert.equal(f.calls.filter(c => c.name === 'ai_save_settings' || c.name === 'ai_generate').length, 0);
  await f.ai.action('ai-add-mapping', button());
  f.ai.input({ value: '翻译助手', dataset: { mappingName: '1' } });
  await f.ai.action('ai-open-models', button(undefined, { index: '1' }));
  await f.ai.action('ai-choose-model', button(undefined, { model: 'model-b' }));
  f.ai.input({ id: 'ai-language', value: '英语', dataset: {} });
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.deepEqual(plain(f.catalog.profiles[0].modelMappings.map(m => m.model)), ['test', 'model-b']);
  assert.equal(f.catalog.profiles[0].model, 'test');
  assert.equal(f.catalog.profiles[0].modelMappings[1].name, '翻译助手');
  assert.equal(f.catalog.profiles[0].language, '英语');
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  await f.ai.action('ai-fetch-models', button());
  await f.ai.action('ai-open-models', button(undefined, { index: '0' }));
  await f.ai.action('ai-choose-model', button(undefined, { model: 'model-a' }));
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.equal(f.catalog.profiles[0].model, 'model-a');
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  await f.ai.action('ai-fetch-models', button());
  f.ai.input({ id: 'ai-base-url', value: 'https://changed.example/v1', dataset: {} });
  assert.doesNotMatch(f.ai.settingsView(), /popover="auto"/);
  assert.doesNotMatch(f.ai.settingsView(), /class="ai-model-dropdown"/);
  assert.doesNotMatch(f.ai.settingsView(), /test-only-key/);
});

test('quick mapping setup keeps existing selections and does not duplicate presets; list failure leaves edits intact', async () => {
  const f = await fixture({ handler: name => { if (name === 'ai_list_models') throw new Error('该服务不支持模型列表接口，请手动添加模型映射'); } });
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  await f.ai.change({ id: 'ai-provider', value: 'deepseek' });
  await f.ai.action('ai-preset-mappings', button());
  await f.ai.action('ai-preset-mappings', button());
  await f.ai.action('ai-fetch-models', button());
  assert.match(f.ai.settingsView(), /不支持模型列表接口/);
  assert.doesNotMatch(f.ai.settingsView(), /class="ai-model-dropdown"/);
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.equal(f.catalog.profiles[0].modelMappings.length, 2);
  assert.equal(f.catalog.profiles[0].model, presets.providerPresets.find(p => p.id === 'deepseek').models[0].id);
});

test('provider or endpoint changes discard the pending key and separate new configurations', async () => {
  const f = await fixture({ config: { hasKey: true } });
  f.ai.input({ id: 'ai-api-key', value: 'test-secret', dataset: {} });
  await f.ai.action('ai-add-model', button());
  await f.ai.change({ id: 'ai-provider', value: 'kimi' });
  assert.doesNotMatch(f.ai.settingsView(), /test-secret|已保存在系统凭据库/);
  f.ai.input({ id: 'ai-api-key', value: 'new-secret', dataset: {} });
  f.ai.input({ id: 'ai-base-url', value: 'https://example.org/v1', dataset: {} });
  await f.ai.submit({ id: 'ai-settings-form' });
  assert.equal(f.calls.find(c => c.name === 'ai_save_settings').args.apiKey, null);
  assert.notEqual(f.catalog.profiles[0].id, f.catalog.profiles[1].id);
});

test('save failures identify the model and field, preserve the editor and never start a connection test', async () => {
  const f = await fixture({ handler: async name => { if (name === 'ai_save_settings') throw '模型 ID：请输入 1～200 个字符'; } });
  await f.ai.action('ai-edit-model', button(undefined, { profile: 'primary' }));
  f.ai.input({ id: 'ai-config-name', value: '<工作模型>', dataset: {} });
  await assert.rejects(f.ai.submit({ id: 'ai-settings-form' }), /保存模型「<工作模型>」失败：模型 ID：/);
  assert.match(f.ai.settingsView(), /保存模型「&lt;工作模型&gt;」失败：模型 ID：/);
  assert.match(f.ai.settingsView(), /value="&lt;工作模型&gt;"/);
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').length, 0);
  assert.equal(f.catalog.profiles[0].name, '主模型');
});

test('GLM plan diagnostics preserve the draft key and tests never save failed configurations', async () => {
  const f=await fixture({handler:async name=>{if(name==='ai_test_connection')throw {kind:'balance',status:429,code:'1113'};}});
  await f.ai.action('ai-add-model',button());
  await f.ai.change({id:'ai-provider',value:'glm-coding'});
  f.ai.input({id:'ai-api-key',value:'unit-test-only',dataset:{}});
  await f.ai.action('ai-test',button());
  assert.match(f.ai.settingsView(),/余额不足.*Coding Plan.*HTTP 429.*1113/);
  assert.match(f.ai.settingsView(),/value="unit-test-only"/);
  assert.equal(f.calls.filter(c=>c.name==='ai_save_settings').length,0);
  assert.equal(f.calls.find(c=>c.name==='ai_test_connection').args.settings.baseUrl,'https://open.bigmodel.cn/api/coding/paas/v4');
  assert.equal(f.catalog.profiles.length,1);
});

test('cancel can stop an in-progress connection test and close without saving', async () => {
  const gate=deferred();
  const f=await fixture({handler:async name=>{if(name==='ai_test_connection')return gate.promise;if(name==='ai_cancel')gate.resolve({elapsedMs:99});}});
  await f.ai.action('ai-add-model',button());
  await f.ai.change({id:'ai-provider',value:'glm-coding'});
  const pending=f.ai.action('ai-test',button());await tick();
  assert.match(f.ai.settingsView(),/测试中…/);
  await f.ai.action('ai-close-editor',button());await pending;
  assert.ok(f.calls.some(c=>c.name==='ai_cancel'));
  assert.equal(f.calls.filter(c=>c.name==='ai_save_settings').length,0);
  assert.doesNotMatch(f.ai.settingsView(),/ai-settings-form/);
});

test('connection diagnostics are localized and GLM presets keep standard and plan endpoints separate',()=>{
  try {
    for(const locale of ['en','es']) {
      i18n.setLocale(locale);
      for(const kind of ['configuration','glmProtocol','credentials','authentication','balance','quota','expired','model','endpoint','parameters','response','timeout','network','provider','cancelled']) {
        assert.doesNotMatch(connection.connectionError({kind,status:429,code:'1113'}),/[\u4e00-\u9fff]/);
      }
    }
  } finally {i18n.setLocale('zh-CN');}
  assert.equal(presets.providerPresets.find(p=>p.id==='glm').baseUrl,'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(presets.providerPresets.find(p=>p.id==='glm-coding').baseUrl,'https://open.bigmodel.cn/api/coding/paas/v4');
});

test('model switching is blocked during generation and last-profile deletion preserves history', async () => {
  const gate = deferred();
  const f = await fixture({ handler: async name => { if (name === 'ai_generate') { await gate.promise; return '完成'; } } });
  f.ai.input(input('问题'));
  const pending = f.ai.submit({ id: 'ai-chat-form' });
  await tick();
  await assert.rejects(f.ai.action('ai-use-model', button(undefined, { profile: 'other' })), /等待生成/);
  gate.resolve(); await pending;
  await f.ai.action('ai-delete-model', button(undefined, { profile: 'primary' }));
  assert.equal(f.saved.get('s1').messages.at(-1).text, '完成');
  assert.equal(f.catalog.profiles.length, 0);
  f.ai.input(input('未发送'));
  await assert.rejects(f.ai.submit({ id: 'ai-chat-form' }), /配置 AI/);
});

test('model context contains only selected attachments and completed assistant replies', () => {
  const messages = model.modelMessages([
    { id: 'u', role: 'user', text: '解释', attachments: [{ id: 'a', name: '选中资料', text: '内容' }, { id: 'b', name: '截图', image: 'data:image/png;base64,AA==' }] },
    { id: 'e', role: 'assistant', text: '未完成的回复', status: 'error' },
    { id: 'g', role: 'assistant', text: '正在生成', status: 'generating' },
    { id: 'd', role: 'assistant', text: '完成的回复', status: 'done' },
  ]);
  assert.equal(messages.length, 3);
  assert.match(messages[1].content[0].text, /选中资料.*\n内容/s);
  assert.equal(messages[1].content[1].image_url.url, 'data:image/png;base64,AA==');
  assert.equal(messages[2].content, '完成的回复');
});

test('task extraction deduplicates, validates limits and rejects non-list responses', () => {
  assert.deepEqual(plain(model.parseTasks('```json\n[" 写测试 ","写测试","检查保存"]\n```')), [{ text: '写测试', checked: true }, { text: '检查保存', checked: true }]);
  for (const value of ['{}', '[1]', '[""]', JSON.stringify(['字'.repeat(201)]), JSON.stringify(Array(51).fill('任务'))]) assert.throws(() => model.parseTasks(value));
  assert.equal(model.parseTasks(JSON.stringify(['🙂'.repeat(200)]))[0].text.length, 400);
  assert.deepEqual(plain(model.parseTasks('[]')), []);
});

test('submitting without configuration preserves the input and attachment draft', async () => {
  const s = session('s1'); s.attachments.push({ id: 'a', name: '资料', text: '不要丢失' });
  const f = await fixture({ config: { model: '' }, sessions: [s] });
  f.ai.input(input('未发送的问题'));
  await assert.rejects(f.ai.submit({ id: 'ai-chat-form' }), /配置 AI/);
  await f.flush();
  assert.equal(f.saved.get('s1').draft, '未发送的问题');
  assert.equal(f.saved.get('s1').attachments.length, 1);
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').length, 0);
});

test('switching conversations does not cancel the other draft save', async () => {
  const f = await fixture({ sessions: [session('s1'), session('s2')] });
  f.ai.input(input('第一份草稿'));
  await f.ai.action('ai-select', button('s2'));
  f.ai.input(input('第二份草稿'));
  await f.flush();
  assert.equal(f.saved.get('s1').draft, '第一份草稿');
  assert.equal(f.saved.get('s2').draft, '第二份草稿');
});

test('stop during initial persistence prevents a late model request; retry keeps one user message', async () => {
  const gate = deferred(); let first = true;
  const f = await fixture({ handler: async name => { if (name === 'ai_save_session' && first) { first = false; await gate.promise; } } });
  f.ai.input(input('问题'));
  const pending = f.ai.submit({ id: 'ai-chat-form' });
  await tick();
  await f.ai.action('ai-stop', button('s1'));
  gate.resolve(); await pending;
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').length, 0);
  assert.match(f.saved.get('s1').messages.at(-1).error, /已停止/);
  await f.ai.action('ai-retry', button('s1'));
  assert.equal(f.saved.get('s1').messages.filter(m => m.role === 'user').length, 1);
  assert.equal(f.saved.get('s1').messages.at(-1).text, '测试回答');
  assert.equal(f.saved.get('s1').messages.at(-1).status, 'done');
});

test('generation continues in its originating conversation after switching and prevents duplicate sends', async () => {
  const gate = deferred();
  const f = await fixture({ sessions: [session('s1'), session('s2')], handler: async name => { if (name === 'ai_generate') { await gate.promise; return '原会话回答'; } } });
  f.ai.input(input('问题'));
  const pending = f.ai.submit({ id: 'ai-chat-form' });
  await tick();
  await f.ai.submit({ id: 'ai-chat-form' });
  await f.ai.action('ai-select', button('s2'));
  gate.resolve(); await pending;
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').length, 1);
  assert.equal(f.saved.get('s1').messages.at(-1).text, '原会话回答');
  assert.equal(f.saved.get('s2').messages.length, 0);
  assert.doesNotMatch(f.ai.view(), /原会话回答/);
});

test('deletion cancels only the deleted draft and queued saves cannot resurrect it', async () => {
  const f = await fixture({ sessions: [session('s1'), session('s2')] });
  f.ai.input(input('保留'));
  await f.ai.action('ai-select', button('s2'));
  f.ai.input(input('删除'));
  await f.ai.action('ai-delete', button('s2'));
  await f.flush();
  assert.equal(f.saved.get('s1').draft, '保留');
  assert.equal(f.saved.has('s2'), false);
});

test('extracted tasks stay pending until explicit selection and repeated addition does not duplicate', async () => {
  const s = session('s1'); s.tasks = [{ text: '任务一', checked: true }, { text: '任务二', checked: false }];
  const f = await fixture({ sessions: [s] });
  assert.equal(f.calls.filter(c => c.name === 'ai_add_todos').length, 0);
  await f.ai.action('ai-add-todos', button('s1'));
  assert.deepEqual(plain(f.calls.find(c => c.name === 'ai_add_todos').args.texts), ['任务一']);
  await assert.rejects(f.ai.action('ai-add-todos', button('s1')), /勾选待办/);
  assert.equal(f.calls.filter(c => c.name === 'ai_add_todos').length, 1);
});

test('restart marks interrupted responses retryable and model output is escaped in the UI', async () => {
  const s = session('s1'); s.messages = [{ id: 'm', role: 'assistant', text: '<img src=x onerror=alert(1)>', status: 'generating' }];
  const f = await fixture({ sessions: [s] });
  assert.match(f.ai.view(), /上次生成已中断/);
  assert.match(f.ai.view(), /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(f.ai.view(), /<img src=x/);
});

const runEvent = (name = 'assistant_create_todo', state = 'success', data = { id: 7, text: '<img src=x onerror=1>' }) => ({ callId: '0:call_1', name, title: '创建待办', state, result: state === 'running' ? null : { ok: true, data, error: null, reused: false } });

test('ordinary chat opts into tools and persists escaped execution records', async () => {
  const f = await fixture({ handler: async (name, args) => {
    if (name !== 'ai_generate') return;
    assert.equal(args.allowTools, true); assert.ok(args.toolScope.startsWith('s1:'));
    args.onTool.onmessage(runEvent(undefined, 'running'));
    args.onTool.onmessage(runEvent()); return '已创建';
  }});
  f.ai.input(input('新增待办')); await f.ai.submit({ id: 'ai-chat-form' }); await f.flush();
  const last = f.saved.get('s1').messages.at(-1);
  assert.equal(last.toolRuns.length, 1); assert.equal(last.toolRuns[0].state, 'success');
  assert.match(f.ai.view(), /&lt;img src=x onerror=1&gt;/); assert.doesNotMatch(f.ai.view(), /<img src=x/);
});

test('tool opt-out and content extraction keep operations disabled', async () => {
  const f = await fixture();
  await f.ai.change({ id: 'ai-tools-enabled', checked: false });
  f.ai.input(input('只聊天')); await f.ai.submit({ id: 'ai-chat-form' });
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').at(-1).args.allowTools, false);
  await f.ai.change({ id: 'ai-tools-enabled', checked: true });
  const s = f.saved.get('s1'); s.messages.at(-1).text = '任务列表';
  // Extraction invokes a separate read-only generation regardless of the chat toggle.
  await f.ai.action('ai-extract', button('s1', { message: s.messages.at(-1).id }));
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').at(-1).args.allowTools, false);
});

test('retry preserves successful actions, their scope, and the model execution context', async () => {
  let count = 0; const scopes = [];
  const f = await fixture({ handler: async (name, args) => {
    if (name !== 'ai_generate') return;
    scopes.push(args.toolScope);
    if (++count === 1) { args.onTool.onmessage(runEvent()); throw new Error('接收中断'); }
    assert.match(JSON.stringify(args.messages), /assistant_create_todo/);
    assert.match(JSON.stringify(args.messages), /success/); return '已读取执行结果';
  }});
  f.ai.input(input('创建任务')); await f.ai.submit({ id: 'ai-chat-form' });
  await f.ai.action('ai-retry', button('s1')); await f.flush();
  assert.equal(scopes[0], scopes[1]);
  assert.equal(f.saved.get('s1').messages.filter(m => m.toolRuns?.length).length, 1);
  assert.equal(f.saved.get('s1').messages.at(-1).status, 'done');
});

test('capture completion before the tool reply is reconciled without uploading images', async () => {
  let f;
  f = await fixture({ handler: async (name, args) => {
    if (name !== 'ai_generate') return;
    f.listeners.get('native-capture-finished')({ payload: { id: 'capture1', kind: 'screenshot', result: { action: 'cancelled' } } });
    args.onTool.onmessage(runEvent('assistant_screenshot', 'awaiting_user', { operationId: 'capture1', state: 'awaiting_user' }));
    return '已请求框选';
  }});
  f.ai.input(input('截图')); await f.ai.submit({ id: 'ai-chat-form' }); await f.flush();
  assert.equal(f.saved.get('s1').messages.at(-1).toolRuns[0].state, 'cancelled');
  assert.equal(f.calls.filter(c => c.name === 'ai_image').length, 0);
});

test('recording start arriving before its tool reply is reflected as started', async () => {
  let f;
  f = await fixture({ handler: async (name, args) => {
    if (name !== 'ai_generate') return;
    f.listeners.get('tools-recording')({ payload: { active: true } });
    args.onTool.onmessage(runEvent('assistant_start_recording', 'awaiting_user', { operationId: 'record1', state: 'awaiting_user' })); return '等待操作';
  }});
  f.ai.input(input('录屏')); await f.ai.submit({ id: 'ai-chat-form' }); await f.flush();
  assert.equal(f.saved.get('s1').messages.at(-1).toolRuns[0].result.data.state, 'recording');
});

test('late tool completion after cancellation or navigation updates the originating message', async () => {
  const gate = deferred(); let channel;
  const f = await fixture({ sessions: [session('s1'), session('s2')], handler: async (name, args) => {
    if (name !== 'ai_generate') return;
    channel = args.onTool; channel.onmessage(runEvent(undefined, 'running')); await gate.promise; throw new Error('已停止生成');
  }});
  f.ai.input(input('创建任务')); const pending = f.ai.submit({ id: 'ai-chat-form' }); await tick();
  await f.ai.action('ai-select', button('s2')); gate.resolve(); await pending;
  channel.onmessage(runEvent()); await f.flush();
  assert.equal(f.saved.get('s1').messages.at(-1).toolRuns[0].state, 'success');
  assert.equal(f.saved.get('s2').messages.length, 0);
});
