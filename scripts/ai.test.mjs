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
function load(code, bindings = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, ...bindings });
  return exports;
}
const model = load(modelCode);
const presets = load(presetsCode);
const localeData = load(await compile('locales'));
const i18n = load(await compile('i18n'), { require: () => localeData });
const plain = value => JSON.parse(JSON.stringify(value));
const session = id => ({ id, title: id, updatedAt: 1, messages: [], attachments: [] });
const button = (session, extra = {}) => ({ dataset: { session, ...extra } });
const input = value => ({ id: 'ai-input', value, dataset: {} });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function fixture({ config = {}, profiles, sessions = [session('s1')], handler, notes = [] } = {}) {
  const catalog = { profiles: profiles ?? [{ id: 'primary', name: '主模型', provider: 'custom', baseUrl: 'http://localhost:11434/v1', model: 'test', vision: true, language: '中文', hasKey: false, ...config }], activeId: profiles?.[0]?.id ?? 'primary' };
  const saved = new Map(sessions.map(s => [s.id, plain(s)]));
  const calls = [], notices = [], timers = new Map();
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
    if (name === 'ai_cancel' || name === 'ai_add_todos') return null;
    throw new Error(`Unexpected command ${name}`);
  };
  const { Ai } = load(uiCode, {
    structuredClone,
    require: name => name === './i18n' ? i18n : name === './ai-model' ? model : name === './ai-presets' ? presets : name === './ai.css' ? {} : name === '@tauri-apps/api/core' ? { invoke, Channel: class {} } : { confirm: async () => true },
    crypto: { randomUUID }, clearTimeout: id => timers.delete(id),
    window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; } },
    document: { querySelectorAll: () => [], querySelector: () => null },
  });
  const ai = new Ai(() => {}, text => notices.push(text), () => {}, () => notes, async () => {});
  await ai.initialize();
  const flush = async () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await tick(); };
  return { ai, saved, calls, notices, flush, catalog };
}

test('adding and testing a second model keeps active selection; switching preserves draft and uses selected profile', async () => {
  const f = await fixture();
  f.ai.input(input('保留草稿'));
  await f.ai.action('ai-add-model', button());
  await f.ai.change({ id: 'ai-provider', value: 'deepseek' });
  f.ai.input({ id: 'ai-config-name', value: '第二模型', dataset: {} });
  await f.ai.action('ai-test', button());
  const second = f.catalog.profiles[1];
  assert.equal(f.catalog.activeId, 'primary');
  assert.equal(second.baseUrl, 'https://api.deepseek.com');
  assert.equal(f.calls.find(c => c.name === 'ai_generate').args.profileId, second.id);
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
  await f.ai.action('ai-fetch-models', button());
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
  await assert.rejects(f.ai.action('ai-test', button()), /保存模型「<工作模型>」失败：模型 ID：/);
  assert.match(f.ai.settingsView(), /保存模型「&lt;工作模型&gt;」失败：模型 ID：/);
  assert.match(f.ai.settingsView(), /value="&lt;工作模型&gt;"/);
  assert.equal(f.calls.filter(c => c.name === 'ai_generate').length, 0);
  assert.equal(f.catalog.profiles[0].name, '主模型');
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
