import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(name, bindings = {}) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, ...bindings });
  return exports;
}
const { translations } = await load('locales');
const storage = new Map();
const document = { documentElement: { lang: '' } };
const i18n = await load('i18n', { require: () => ({ translations }), document,
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
});

test('language switching persists cache, updates document language and safely falls back', () => {
  i18n.setLocale('en');
  assert.equal(i18n.t('设置'), 'Settings');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(storage.get('ui_language'), 'en');
  i18n.setLocale('es');
  assert.equal(i18n.t('设置'), 'Ajustes');
  assert.equal(i18n.t('user-defined-model'), 'user-defined-model');
  i18n.setLocale('invalid');
  assert.equal(i18n.getLocale(), 'zh-CN');
  assert.equal(i18n.t('设置'), '设置');
});

test('interpolation preserves user text and escapes markup without recursively interpreting placeholders', () => {
  i18n.setLocale('en');
  const userText = '设置 <img src=x> {1}';
  assert.equal(i18n.t('添加{0}', [userText]), `Add ${userText}`);
  assert.equal(i18n.h('添加{0}', [userText]), 'Add 设置 &lt;img src=x&gt; {1}');
  i18n.setLocale('zh-CN');
});

test('all static UI messages have both translations and preserve interpolation arguments', async () => {
  const params = text => [...text.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  for (const [key, entry] of Object.entries(translations)) {
    for (const language of ['en', 'es']) {
      assert.ok(entry[language]?.trim(), `${key}: ${language}`);
      assert.deepEqual(params(entry[language]), params(key), `${key}: ${language}`);
    }
  }
  for (const name of ['main', 'terminal', 'app-dialog', 'ai-connection', 'tools', 'ai', 'ai-tool-state', 'ai-workspace', 'system-capture-editor', 'capture-pin', 'settings-editor', 'capture-translation']) {
    const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'tr', 'h'].includes(node.expression.text)) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key) && /[\u4e00-\u9fff]/.test(key.text)) assert.ok(translations[key.text], `${name}: ${key.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
});
