import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

async function moduleUrl(name, dependencies = {}) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [path, url] of Object.entries(dependencies)) outputText = outputText.replace(`'${path}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const i18nUrl = await moduleUrl('i18n', { './locales': await moduleUrl('locales') });
const { CaptureShortcuts, defaultShortcuts, shortcutFromEvent, validShortcut } = await import(await moduleUrl('capture-shortcuts', { './i18n': i18nUrl }));

function fixture() {
  const registered = new Map(), triggered = [];
  const backend = {
    occupied: new Set(), failSave: false, saved: null,
    async reset() { registered.clear(); },
    async register(key, handler) {
      if (this.occupied.has(key) || registered.has(key)) throw new Error('occupied');
      registered.set(key, handler);
    },
    async unregister(key) { registered.delete(key); },
    async save(values) { if (this.failSave) throw new Error('disk failure'); this.saved = { ...values }; },
  };
  return { manager: new CaptureShortcuts(backend, kind => triggered.push(kind)), backend, registered, triggered };
}

test('records canonical combinations and rejects plain keys or modifier-only input', () => {
  const event = { code: 'KeyS', ctrlKey: true, altKey: true, shiftKey: true, metaKey: false };
  assert.equal(shortcutFromEvent(event), 'Ctrl+Alt+Shift+KeyS');
  assert.equal(shortcutFromEvent({ ...event, code: 'Digit5' }), 'Ctrl+Alt+Shift+Digit5');
  assert.equal(shortcutFromEvent({ ...event, code: 'ControlLeft' }), null);
  assert.equal(shortcutFromEvent({ ...event, ctrlKey: false, altKey: false }), null);
  for (const value of ['Ctrl+KeyA', 'Alt+F12', 'Super+Shift+KeyA']) {
    assert.equal(validShortcut(value), value !== 'Super+Shift+KeyA');
  }
  assert.equal(validShortcut('Shift+Super+KeyA'), true);
  assert.equal(validShortcut('Ctrl+KeyA+KeyB'), false);
});

test('defaults trigger, replacement releases old key, and disabled settings survive restart', async () => {
  const { manager, backend, registered, triggered } = fixture();
  await manager.initialize(null);
  registered.get(defaultShortcuts.screenshot)();
  assert.deepEqual(triggered, ['screenshot']);
  await manager.update('screenshot', 'Ctrl+Shift+KeyS');
  assert.equal(registered.has(defaultShortcuts.screenshot), false);
  registered.get('Ctrl+Shift+KeyS')();
  assert.deepEqual(triggered, ['screenshot', 'screenshot']);
  await manager.update('recording', '');
  assert.equal(registered.has(defaultShortcuts.recording), false);
  const restarted = fixture();
  await restarted.manager.initialize(JSON.stringify(backend.saved));
  assert.deepEqual([...restarted.registered.keys()], ['Ctrl+Shift+KeyS']);
});

test('duplicate or occupied combinations leave the previous binding and settings intact', async () => {
  const { manager, backend, registered } = fixture();
  await manager.initialize(null);
  await assert.rejects(manager.update('screenshot', defaultShortcuts.recording), /不能相同/);
  backend.occupied.add('Ctrl+KeyX');
  await assert.rejects(manager.update('screenshot', 'Ctrl+KeyX'), /occupied/);
  assert.equal(registered.has(defaultShortcuts.screenshot), true);
  assert.deepEqual(manager.values, defaultShortcuts);
  assert.equal(backend.saved, null);
});

test('persistence failure restores old binding and removes replacement', async () => {
  const { manager, backend, registered, triggered } = fixture();
  await manager.initialize(null);
  backend.failSave = true;
  await assert.rejects(manager.update('screenshot', 'Ctrl+KeyX'), /disk failure/);
  assert.match(manager.errors.screenshot, /设置保存失败/);
  assert.doesNotMatch(manager.errors.screenshot, /占用|其他程序/);
  assert.equal(registered.has('Ctrl+KeyX'), false);
  registered.get(defaultShortcuts.screenshot)();
  assert.deepEqual(triggered, ['screenshot']);
  assert.deepEqual(manager.values, defaultShortcuts);
});

test('webview reload replaces stale callbacks and removes bindings disabled in storage', async () => {
  const { manager, backend, registered, triggered } = fixture();
  await manager.initialize(null);
  const events = [];
  const reloaded = new CaptureShortcuts(backend, kind => events.push(kind));
  await reloaded.initialize(JSON.stringify({ ...defaultShortcuts, recording: '' }));
  assert.deepEqual(reloaded.errors, {});
  assert.equal(registered.has(defaultShortcuts.recording), false);
  registered.get(defaultShortcuts.screenshot)();
  assert.deepEqual(events, ['screenshot']);
  assert.deepEqual(triggered, []);
});

test('registration and release failures identify the key and operation', async () => {
  const { manager, backend } = fixture();
  await manager.initialize(null);
  backend.occupied.add('Ctrl+KeyX');
  await assert.rejects(manager.update('screenshot', 'Ctrl+KeyX'), /Ctrl \+ X.*注册失败/);
  backend.unregister = async () => { throw new Error('release denied'); };
  await assert.rejects(manager.update('screenshot', ''), /无法释放原快捷键 Ctrl \+ Alt \+ A.*release denied/);
  assert.doesNotMatch(manager.errors.screenshot, /占用|其他程序/);
  assert.equal(manager.active.screenshot, defaultShortcuts.screenshot);
});

test('startup conflicts are reported independently and can be corrected', async () => {
  const { manager, backend, registered } = fixture();
  backend.occupied.add(defaultShortcuts.screenshot);
  await manager.initialize('{broken');
  assert.match(manager.errors.screenshot, /occupied/);
  assert.equal(registered.has(defaultShortcuts.recording), true);
  await manager.update('screenshot', 'Alt+KeyS');
  assert.equal(manager.errors.screenshot, undefined);
  assert.equal(registered.has('Alt+KeyS'), true);
});
