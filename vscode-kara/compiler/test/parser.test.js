import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/parser.js';
import { lex } from '../src/lexer.js';

const COUNTER = `
App {
  title: "Contador"
  size: (360, 640)

  state count = 0
  state name = "KARA"
  state pi = 3.14
  state ok = true
  state list = [1, 2, 3]

  fn double(x) {
    return x * 2
  }

  Column {
    Text { value: "Hola \${name}!" fontSize: 22 bold: true }
    Button {
      id: "inc"
      text: "Incrementar"
      onClick: count = count + 1
    }
    TextInput { id: "nameInput" bind: name placeholder: "Tu nombre" }
    Checkbox { id: "agree" bind: ok label: "Acepto" }
  }
}
`;

test('lexer produces tokens for a counter program', () => {
  const { tokens, errors } = lex('App { title: "x" size: (400, 300) }');
  assert.equal(errors.length, 0);
  assert.ok(tokens.length > 10);
  assert.equal(tokens[0].value, 'App');
  assert.equal(tokens.find((t) => t.kind === 'int').value, 400);
});

test('lexer reports unterminated string', () => {
  const { errors } = lex('App { title: "x }');
  assert.ok(errors.some((e) => e.message.includes('unterminated string')));
});

test('compiles a full program', () => {
  const res = compile(COUNTER);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const p = res.program;
  assert.equal(p.title, 'Contador');
  assert.deepEqual(p.size, [360, 640]);
  assert.equal(p.theme, 'light');
  assert.equal(p.ui.type, 'App');
  assert.equal(p.ui.children[0].type, 'Column');
  assert.equal(p.ui.children[0].children[1].type, 'Button');
  assert.equal(p.fns[0].name, 'double');
  assert.equal(p.fns[0].params[0].name, 'x');
});

test('state init values are parsed', () => {
  const res = compile(COUNTER);
  assert.equal(res.ok, true);
  assert.equal(res.program.state.count.expr.type, 'Int');
  assert.equal(res.program.state.list.expr.type, 'Array');
  assert.equal(res.program.state.list.expr.items.length, 3);
});

test('string interpolation produces parts', () => {
  const res = compile(COUNTER);
  const text = res.program.ui.children[0].children[0];
  assert.equal(text.type, 'Text');
  const parts = text.props.value;
  assert.deepEqual(parts[0], { text: 'Hola ' });
  assert.deepEqual(parts[1], { expr: { type: 'Var', name: 'name' } });
  assert.deepEqual(parts[2], { text: '!' });
});

test('missing title is an error', () => {
  const res = compile('App { size: (1, 1) Column { Text { value: "x" } } }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('title')));
});

test('missing size is an error', () => {
  const res = compile('App { title: "x" }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('size')));
});

test('unknown component is an error', () => {
  const res = compile('App { title: "x" size: (1, 1) Foo { } }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('unknown component')));
});

test('unknown prop is an error', () => {
  const res = compile('App { title: "x" size: (1, 1) Text { value: "a" bogus: 1 } }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('unknown prop')));
});

test('duplicate state variable is an error', () => {
  const res = compile('App { title: "x" size: (1, 1) state a = 1 state a = 2 }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('duplicate state')));
});

test('unknown variable reference is an error', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      state a = missing
    }
  `);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('unknown variable "missing"')));
});

test('unknown variable in onClick is an error', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      Button { id: "b" text: "B" onClick: counter = counter + 1 }
    }
  `);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('counter')));
});

test('bind must reference state', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      TextInput { id: "i" bind: nothere }
    }
  `);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('bind')));
});

test('Button without onClick is an error', () => {
  const res = compile('App { title: "x" size: (1, 1) Button { id: "b" text: "B" } }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('onClick')));
});

test('expressions: binary ops, unary, calls, parens', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      state a = (2 + 3) * 4
      state b = -a + 1
      state c = !false
      state d = 10 % 3
      state e = 2 < 3 && 4 >= 4
      fn f(x) { return x - 1 }
      state g = f(5)
      Button { id: "b" text: "B" onClick: {
        let tmp = a + b
        a = tmp * 2
        if (tmp > 5) { a = 0 } else { a = 1 }
        while (a < 10) { a = a + 1 }
        for (item in [1, 2, 3]) { Print(item) }
        Alert("done")
      } }
    }
  `);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});

test('else-if chains desugar and pass sema', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      state label = ""
      fn pick(a, b) {
        if (a > b) { return "big" }
        else if (a == b) { return "eq" }
        else { return "small" }
      }
      Button { id: "b" text: "B" onClick: { label = pick(1, 2) } }
    }
  `);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const ifStmt = res.program.fns[0].body[0];
  assert.equal(ifStmt.type, 'If');
  assert.equal(ifStmt.else[0].type, 'If');
  assert.deepEqual(ifStmt.else[0].else, [
    { type: 'Return', expr: { type: 'Str', parts: [{ text: 'small' }] }, loc: ifStmt.else[0].else[0].loc },
  ]);
});

test('expressions: unknown function is an error', () => {
  const res = compile('App { title: "x" size: (1, 1) state a = NoSuchFn(1) }');
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('unknown function')));
});

test('return outside function is an error', () => {
  const res = compile(`
    App { title: "x" size: (1, 1)
      Button { id: "b" text: "B" onClick: { return 1 } }
    }
  `);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('return')));
});

test('theme dark is accepted, unknown theme rejected', () => {
  const ok = compile('App { title: "x" size: (1, 1) theme: "dark" }');
  assert.equal(ok.ok, true);
  assert.equal(ok.program.theme, 'dark');
  const bad = compile('App { title: "x" size: (1, 1) theme: "purple" }');
  assert.equal(bad.ok, false);
});

test('errors include line and column', () => {
  const src = 'App {\n  title: "x"\n  size: (1, 1)\n  Foo { }\n}';
  const res = compile(src);
  assert.equal(res.ok, false);
  const e = res.errors.find((x) => x.message.includes('unknown component'));
  assert.equal(e.line, 4);
  assert.ok(e.col >= 1);
});
