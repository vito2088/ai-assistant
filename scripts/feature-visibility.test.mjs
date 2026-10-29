import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const source = await readFile(new URL('../src/feature-visibility.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { featureGroups, parseVisibility, groupState, setFeatureVisible, visiblePages, availablePage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const orderSource = await readFile(new URL('../src/feature-order.ts', import.meta.url), 'utf8');
const orderExports = {};
vm.runInNewContext(ts.transpileModule(orderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports:orderExports, require:()=>({featureGroups}), structuredClone });
const {parseFeatureOrder, orderedGroups, moveFeature} = orderExports;

test('ordering restores defaults, repairs duplicate/unknown ids and keeps children in their own groups', () => {
  const defaults=parseFeatureOrder(null);
  const moved=moveFeature(defaults,'tools','ai');
  assert.equal(moved.groups[0],'tools');
  const child=moveFeature(moved,'reminder','screenshot');
  assert.equal(orderedGroups(child)[0].children[0].id,'reminder');
  assert.equal(JSON.stringify(moveFeature(child,'reminder','note')),JSON.stringify(child));
  assert.equal(JSON.stringify(parseFeatureOrder(JSON.stringify(child))),JSON.stringify(child));
  const repaired=parseFeatureOrder('{"groups":["tools","tools","settings"],"children":{"document":["note","note","reminder"]}}');
  assert.equal(repaired.groups.length,defaults.groups.length);
  assert.equal(repaired.children.document.join(','),'note,todo');
  assert.equal(parseFeatureOrder('{broken').groups.join(','),defaults.groups.join(','));
});

test('legacy timer and reminder visibility merge into one reminder entry', () => {
  assert.equal(parseVisibility('{"timer":true,"reminder":false}').reminder, true);
  assert.equal(parseVisibility('{"timer":false,"reminder":false}').reminder, false);
  assert.equal(parseVisibility('{"timer":false}').reminder, false);
  assert.equal(parseVisibility('{"reminder":false}').reminder, false);
  assert.equal(Object.hasOwn(parseVisibility('{"timer":true}'), 'timer'), false);
});

test('existing users and invalid preferences retain available features', () => {
  for (const value of [null, '', '{broken', 'null', '[]', 'false']) {
    assert.equal(Object.values(parseVisibility(value)).every(Boolean), true);
  }
  const restored = parseVisibility('{"todo":false,"note":"false","unknown":false}');
  assert.equal(restored.todo, false);
  assert.equal(restored.note, true);
  assert.equal(restored.recording, true);
  assert.equal(Object.hasOwn(restored, 'unknown'), false);
});

test('parent selection, partial selection, and child restoration stay consistent', () => {
  for (const group of featureGroups) {
    const original = parseVisibility(null);
    const partial = setFeatureVisible(original, group.children[0].id, false);
    assert.deepEqual(groupState(partial, group.id), { checked: false, partial: group.children.length > 1, visible: group.children.length > 1 });
    assert.equal(original[group.children[0].id], true);
    const hidden = setFeatureVisible(partial, group.id, false);
    assert.equal(visiblePages(hidden).includes(group.id), false);
    const restored = setFeatureVisible(hidden, group.children[0].id, true);
    assert.equal(visiblePages(restored).includes(group.id), true);
    assert.deepEqual(setFeatureVisible(hidden, group.id, true), original);
  }
});

test('settings cannot be hidden, including when every feature is disabled', () => {
  let state = parseVisibility(null);
  for (const group of featureGroups) state = setFeatureVisible(state, group.id, false);
  assert.deepEqual(visiblePages(state), ['settings']);
  assert.equal(availablePage(state, 'document'), 'settings');
  assert.deepEqual(setFeatureVisible(state, 'settings', false), state);
  assert.equal(featureGroups.some(group => group.id === 'settings'), false);
  assert.deepEqual(parseVisibility(JSON.stringify(state)), state);
  state = setFeatureVisible(state, 'app', true);
  assert.equal(availablePage(state, 'document'), 'workbench');
  assert.equal(availablePage(state, 'settings'), 'settings');
});
