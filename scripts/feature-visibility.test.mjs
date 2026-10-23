import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/feature-visibility.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { featureGroups, parseVisibility, groupState, setFeatureVisible, visiblePages, availablePage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
    assert.deepEqual(groupState(partial, group.id), { checked: false, partial: true, visible: true });
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
