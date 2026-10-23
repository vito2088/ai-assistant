/** Small arithmetic parser: no eval, scripts or property access. Percent is postfix / 100. */
export function calculate(expression: string): number {
  const source = expression.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-').replace(/\s+/g, '');
  if (!source || source.length > 256) throw new Error(source ? '算式过长' : '请输入算式');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/%\-]/gi) ?? [];
  if (tokens.join('') !== source) throw new Error('仅支持数字、括号和四则运算');
  let index = 0;
  let depth = 0;
  const finite = (value: number) => { if (!Number.isFinite(value)) throw new Error('计算结果超出范围'); return value; };
  function primary(): number {
    if (++depth > 32) throw new Error('括号或符号嵌套过多');
    let value: number;
    const token = tokens[index++];
    if (token === '+' || token === '-') value = (token === '-' ? -1 : 1) * primary();
    else if (token === '(') { value = sum(); if (tokens[index++] !== ')') throw new Error('括号不匹配'); }
    else if (token && /^(?:\d|\.)/.test(token)) value = Number(token);
    else throw new Error('算式不完整');
    while (tokens[index] === '%') { index++; value /= 100; }
    depth--;
    return finite(value);
  }
  function product(): number {
    let value = primary();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++]; const right = primary();
      if (operator === '/' && right === 0) throw new Error('不能除以零');
      value = finite(operator === '*' ? value * right : value / right);
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++]; const right = product();
      value = finite(operator === '+' ? value + right : value - right);
    }
    return value;
  }
  const value = sum();
  if (index !== tokens.length) throw new Error('算式格式有误');
  return Object.is(value, -0) ? 0 : Number(value.toPrecision(12));
}
