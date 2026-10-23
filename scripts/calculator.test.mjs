import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/calculator.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { calculate } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('arithmetic precedence, signs, decimals and percentages', () => {
  for (const [expression, expected] of [
    ['2+3*4', 14], ['(2+3)*4', 20], ['0.1+0.2', 0.3], ['.5*8', 4],
    ['-2*-3', 6], ['-(2+3)', -5], ['200*10%', 20], ['50%', 0.5],
    ['1e3/4', 250], ['8÷2×3−1', 11], ['-0', 0],
  ]) assert.equal(calculate(expression), expected, expression);
});

test('invalid expressions and unsafe input fail without executing code', () => {
  for (const expression of ['', '1/0', '1+', '(2+3', '2(3)', '1..2', '1e999',
    'globalThis.process.exit()', 'constructor.constructor("return 1")()', '2**3', '('.repeat(40) + '1' + ')'.repeat(40)]) {
    assert.throws(() => calculate(expression), undefined, expression);
  }
});
