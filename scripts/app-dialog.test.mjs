import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

test('confirmation callers use the application dialog and await the user decision', async () => {
  const root = new URL('../src/', import.meta.url);
  for (const name of (await readdir(root)).filter(name => name.endsWith('.ts'))) {
    const source = ts.createSourceFile(name, await readFile(new URL(name, root), 'utf8'), ts.ScriptTarget.Latest, true);
    const confirmations = new Set();
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node)) continue;
      const bindings = node.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const item of bindings.elements) {
        const imported = (item.propertyName ?? item.name).text;
        if (node.moduleSpecifier.text === '@tauri-apps/plugin-dialog') assert.ok(!['confirm', 'ask'].includes(imported), `${name}: native confirmation import`);
        if (node.moduleSpecifier.text === './app-dialog' && imported === 'confirm') confirmations.add(item.name.text);
      }
    }
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression) && (expression.text === 'confirm' || confirmations.has(expression.text))) {
          assert.ok(confirmations.has(expression.text), `${name}: browser confirmation`);
          assert.ok(ts.isAwaitExpression(node.parent) || ts.isReturnStatement(node.parent), `${name}: action proceeds without awaiting confirmation`);
        }
        if (ts.isPropertyAccessExpression(expression) && ['confirm', 'alert'].includes(expression.name.text)) {
          assert.ok(!['window', 'globalThis'].includes(expression.expression.getText(source)), `${name}: browser dialog`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test('the actual todo deletion handler never deletes before approval or after cancellation', async () => {
  const source = ts.createSourceFile('main', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const handler = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'runAction');
  const code = ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  let decide;
  const context = vm.createContext({
    ai: { action: async () => false }, tools: { action: async () => false },
    todos: [{ id: 7, text: 'keep until approved' }], todoRevision: 0,
    tr: text => text, confirmDialog: () => new Promise(resolve => { decide = resolve; }),
    invoke: async (name, args) => { calls.push({ name, args }); }, render() {}, toast() {},
  });
  vm.runInContext(code, context);
  const action = () => context.runAction('delete-todo', { dataset: { id: '7' } });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let pending = action(); await tick();
  assert.equal(calls.length, 0); assert.equal(context.todos.length, 1);
  decide(false); await pending;
  assert.equal(calls.length, 0); assert.equal(context.todos.length, 1);
  pending = action(); await tick();
  assert.equal(calls.length, 0);
  decide(true); await pending;
  assert.deepEqual(calls.map(call => call.name), ['delete_todo']);
  assert.equal(calls[0].args.id, 7); assert.equal(context.todos.length, 0);
});
