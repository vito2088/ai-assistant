import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
const { outputText } = ts.transpileModule(await readFile(new URL('../src/capture-translation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function load(invoke) {
  const exports = {};
  vm.runInNewContext(outputText, { exports, crypto: { randomUUID }, require: name => name === './i18n' ? { t: key => key } : { invoke, Channel: class {} } });
  return exports;
}
test('Chinese and English translate in opposite directions, including mixed text', () => {
  const { translationTarget } = load();
  assert.equal(translationTarget('你好，欢迎使用截图功能'), 'en');
  assert.equal(translationTarget('Hello world, please try again.'), 'zh-CN');
  assert.equal(translationTarget('连接 API 失败，请重试'), 'en');
});
test('translation sends only recognized text through the active model, without requiring vision', async () => {
  const calls = [];
  const { translateCaptureText } = load(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'ai_settings') return { activeId: 'selected', profiles: [{ id: 'other', model: 'old' }, { id: 'selected', model: 'text-only', vision: false }] };
    if (cmd === 'ai_generate') return 'Hello';
  });
  assert.equal(await translateCaptureText('你好', new AbortController().signal), 'Hello');
  const request = calls.find(c => c.cmd === 'ai_generate').args;
  assert.equal(request.profileId, 'selected');
  assert.equal(request.messages.length, 2);
  assert.match(request.messages[0].content, /English/);
  assert.equal(request.messages[1].content, '你好');
  assert.ok(request.messages.every(m => typeof m.content === 'string'));
});
test('closing before model lookup completes prevents any generation request', async () => {
  let finish; const lookup = new Promise(resolve => { finish = resolve; }); const calls = [];
  const { translateCaptureText } = load(async cmd => { calls.push(cmd); return lookup; });
  const controller = new AbortController(); const result = translateCaptureText('Hello', controller.signal);
  controller.abort(); finish({ activeId: 'one', profiles: [{ id: 'one', model: 'text' }] });
  await assert.rejects(result, /Cancelled/);
  assert.deepEqual(calls, ['ai_settings']);
});
test('closing an active translation cancels its exact request', async () => {
  const calls = []; let finish;
  const { translateCaptureText } = load(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'ai_settings') return { activeId: 'one', profiles: [{ id: 'one', model: 'text' }] };
    if (cmd === 'ai_generate') return new Promise(resolve => { finish = resolve; });
  });
  const controller = new AbortController(); const result = translateCaptureText('Hello', controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal(calls.find(c => c.cmd === 'ai_cancel').args.requestId, calls.find(c => c.cmd === 'ai_generate').args.requestId);
  finish('你好'); await result;
});
test('missing model and excessive text fail without generating', async () => {
  const calls = [];
  const { translateCaptureText } = load(async cmd => { calls.push(cmd); return { activeId: '', profiles: [] }; });
  await assert.rejects(translateCaptureText('Hello', new AbortController().signal), /选择一个 AI 模型/);
  await assert.rejects(translateCaptureText('a'.repeat(12_001), new AbortController().signal), /文字过长/);
  assert.deepEqual(calls, ['ai_settings']);
});
