// Tiny arithmetic expression evaluator. Used by property-value inputs so the
// user can type things like "2 * 12 + 4" or "(40 - 6) / 2" instead of doing
// the math in their head. Returns a finite number or NaN on syntax error.
//
// Supports: literal numbers (decimal + scientific notation), unary +/-,
// binary + - * / %, parentheses, exponent **, and Math.* unary calls
// (sqrt, abs, round, ceil, floor, min, max, sin, cos, tan). Anything else
// — names, assignments, semicolons — is a syntax error.
//
// Why a custom parser instead of eval(): eval would happily run "fetch(...)",
// "process.exit()", or any other JS available in the context. This stays
// confined to arithmetic. Tested against simple fuzzing in the unit specs.

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round,
  ceil: Math.ceil, floor: Math.floor,
  min: Math.min, max: Math.max,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  pow: Math.pow,
};

export function evalExpression(text) {
  if (text == null) return NaN;
  const s = String(text).trim();
  if (s === '') return NaN;

  // Fast path: plain number ("12", "0.5", "-3.4e-2")
  const direct = Number(s);
  if (!Number.isNaN(direct)) return direct;

  // Otherwise parse it.
  try {
    const p = new Parser(s);
    const v = p.expression();
    p.expect('eof');
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

class Parser {
  constructor(src) { this.src = src; this.i = 0; }

  // -- lexer --
  peek() {
    while (this.src[this.i] === ' ' || this.src[this.i] === '\t') this.i++;
    if (this.i >= this.src.length) return { kind: 'eof' };
    const c = this.src[this.i];
    if (c === '(' || c === ')' || c === ',') { return { kind: c, ch: c }; }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      // ** as exponent
      if (c === '*' && this.src[this.i + 1] === '*') return { kind: '**', ch: '**' };
      return { kind: 'op', ch: c };
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = this.i;
      while (j < this.src.length && /[0-9.eE+\-]/.test(this.src[j])) {
        // Stop at + or - unless we're right after e/E
        if ((this.src[j] === '+' || this.src[j] === '-') &&
            !(this.src[j - 1] === 'e' || this.src[j - 1] === 'E')) break;
        j++;
      }
      const tok = this.src.slice(this.i, j);
      const n = Number(tok);
      if (Number.isNaN(n)) throw new Error('bad number');
      return { kind: 'num', val: n, len: tok.length };
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      let j = this.i;
      while (j < this.src.length && /[a-zA-Z]/.test(this.src[j])) j++;
      const name = this.src.slice(this.i, j).toLowerCase();
      return { kind: 'ident', name, len: name.length };
    }
    throw new Error('unexpected ' + c);
  }
  consume() {
    const t = this.peek();
    if (t.kind === 'eof') return t;
    if (t.kind === 'num' || t.kind === 'ident') this.i += t.len;
    else if (t.kind === '**') this.i += 2;
    else this.i += 1;
    return t;
  }
  expect(kind) {
    const t = this.consume();
    if (t.kind !== kind) throw new Error('expected ' + kind);
    return t;
  }

  // -- grammar (precedence climbing) --
  expression() { return this.addsub(); }
  addsub() {
    let lhs = this.muldiv();
    while (true) {
      const t = this.peek();
      if (t.kind === 'op' && (t.ch === '+' || t.ch === '-')) {
        this.consume();
        const rhs = this.muldiv();
        lhs = t.ch === '+' ? lhs + rhs : lhs - rhs;
      } else break;
    }
    return lhs;
  }
  muldiv() {
    let lhs = this.pow();
    while (true) {
      const t = this.peek();
      if (t.kind === 'op' && (t.ch === '*' || t.ch === '/' || t.ch === '%')) {
        this.consume();
        const rhs = this.pow();
        lhs = t.ch === '*' ? lhs * rhs : t.ch === '/' ? lhs / rhs : lhs % rhs;
      } else break;
    }
    return lhs;
  }
  pow() {
    const lhs = this.unary();
    const t = this.peek();
    if (t.kind === '**') {
      this.consume();
      return Math.pow(lhs, this.unary());
    }
    return lhs;
  }
  unary() {
    const t = this.peek();
    if (t.kind === 'op' && (t.ch === '+' || t.ch === '-')) {
      this.consume();
      const v = this.unary();
      return t.ch === '-' ? -v : v;
    }
    return this.primary();
  }
  primary() {
    const t = this.peek();
    if (t.kind === 'num') { this.consume(); return t.val; }
    if (t.kind === '(') {
      this.consume();
      const v = this.expression();
      this.expect(')');
      return v;
    }
    if (t.kind === 'ident') {
      this.consume();
      // Bare identifier with no opening paren = unknown variable.
      const nxt = this.peek();
      if (nxt.kind !== '(') throw new Error('unknown name ' + t.name);
      this.consume(); // (
      const args = [];
      // Empty arg list?
      if (this.peek().kind !== ')') {
        args.push(this.expression());
        while (this.peek().kind === ',') { this.consume(); args.push(this.expression()); }
      }
      this.expect(')');
      const fn = FUNCS[t.name];
      if (!fn) throw new Error('unknown function ' + t.name);
      return fn(...args);
    }
    throw new Error('expected number or (');
  }
}
