import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/parser.js';

function prog(src) {
  const res = compile(src);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  return res.program;
}

function errorsOf(src) {
  const res = compile(src);
  assert.equal(res.ok, false, 'expected compile to fail');
  return res.errors;
}

// ---------------------------------------------------------------------------
// derived
// ---------------------------------------------------------------------------
test('derived variables are parsed and ordered', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state a = 2
      derived b = a * 2
      derived c = b + a
    }
  `);
  assert.deepEqual(p.derivedOrder, ['b', 'c']);
  assert.equal(p.derived.b.expr.type, 'Binary');
});

test('derived can be referenced in expressions', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state a = 1
      derived d = a + 1
      Text { value: "v=\${d}" }
    }
  `);
  assert.equal(p.derived.d.expr.type, 'Binary');
});

test('cannot assign to derived variable', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      state a = 1
      derived d = a + 1
      Button { id: "b" text: "B" onClick: d = 5 }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('cannot assign to derived')));
});

test('unknown variable in derived is an error', () => {
  const errs = errorsOf('App { title: "x" size: (1, 1) derived d = missing }');
  assert.ok(errs.some((e) => e.message.includes('unknown variable "missing"')));
});

// ---------------------------------------------------------------------------
// if / for in the UI tree
// ---------------------------------------------------------------------------
test('if blocks in the UI tree', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state show = true
      Column {
        if (show) {
          Text { value: "visible" }
        }
      }
    }
  `);
  const col = p.ui.children[0];
  assert.equal(col.children[0].type, 'If');
  assert.equal(col.children[0].cond.type, 'Var');
  assert.equal(col.children[0].children[0].type, 'Text');
});

test('for blocks in the UI tree', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state items = ["a", "b"]
      Column {
        for (item in items) {
          Text { value: "- \${item}" }
        }
      }
    }
  `);
  const col = p.ui.children[0];
  assert.equal(col.children[0].type, 'For');
  assert.equal(col.children[0].item, 'item');
  assert.equal(col.children[0].iterable.type, 'Var');
  assert.equal(col.children[0].children[0].type, 'Text');
});

test('if/else blocks in the UI tree', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state ok = false
      Column {
        if (ok) {
          Text { value: "yes" }
        } else {
          Text { value: "no" }
        }
      }
    }
  `);
  const iff = p.ui.children[0].children[0];
  assert.equal(iff.type, 'If');
  assert.equal(iff.children[0].type, 'Text');
  assert.equal(iff.else[0].type, 'Text');
});

test('if/for at App level', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state ok = true
      if (ok) { Text { value: "a" } }
      for (x in [1, 2]) { Text { value: "n" } }
    }
  `);
  assert.equal(p.ui.children[0].type, 'If');
  assert.equal(p.ui.children[1].type, 'For');
});

test('if/for in leaves is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      Text {
        value: "x"
        if (true) { Text { value: "y" } }
      }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('cannot contain if blocks')));
});

test('unknown variable inside UI for item scope', () => {
  const ok = prog(`
    App { title: "x" size: (1, 1)
      state items = [1]
      for (item in items) { Text { value: "\${item}" } }
    }
  `);
  assert.equal(ok.ui.children[0].type, 'For');

  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      for (item in [1]) { Text { value: "\${nope}" } }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('unknown variable "nope"')));
});

// ---------------------------------------------------------------------------
// static types
// ---------------------------------------------------------------------------
test('Int * Str is a type error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      Button { id: "b" text: "B" onClick: {
        let x = 5
        let y = "hola"
        let z = x * y
      } }
    }
  `);
  assert.ok(errs.some((e) => e.kind === 'TypeError' && e.message.includes('cannot apply "*" to Int and Str')));
});

test('Int + Str concatenates (no error)', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      Button { id: "b" text: "B" onClick: {
        let x = 5
        let y = "hola"
        let z = x + y
      } }
    }
  `);
  assert.equal(p.ui.children[0].onClick.length, 3);
});

test('arithmetic on booleans is a type error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      state a = true * 2
    }
  `);
  assert.ok(errs.some((e) => e.kind === 'TypeError'));
});

test('function arity is checked', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      fn f(a, b) { return a }
      Button { id: "b" text: "B" onClick: f(1) }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('expects 2 argument(s), got 1')));
});

test('assignment type mismatch is a type error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      state n = 0
      Button { id: "b" text: "B" onClick: n = "text" }
    }
  `);
  assert.ok(errs.some((e) => e.kind === 'TypeError' && e.message.includes('cannot assign Str to variable "n"')));
});

test('type-correct programs still compile', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state a = 1
      state b = 2.5
      state c = a + 1
      state d = "n=" + c
      state e = a < 3 && true
      state list = [1, 2]
      state len = Length(list)
      fn add(x, y) { return x + y }
      state s = add(1, 2)
      Button { id: "b" text: "B" onClick: {
        let t = 1
        t = t * 2 + a
        c = 9
        Random(1, 10)
        Print("ok", t)
      } }
      Column {
        for (x in list) { Text { value: "\${x}" } }
      }
    }
  `);
  assert.equal(p.fns.length, 1);
});

test('for-loop item type is inferred from array literal', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      Button { id: "b" text: "B" onClick: {
        for (x in [1, 2]) { let z = x * "a" }
      } }
    }
  `);
  assert.ok(errs.some((e) => e.kind === 'TypeError' && e.message.includes('cannot apply "*" to Int and Str')));
});

test('division is Float and comparisons are Bool', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state a = 10 / 4
      state b = a > 1
      state c = "a" + 1
    }
  `);
  assert.equal(p.state.a.expr.type, 'Binary');
});

// ---------------------------------------------------------------------------
// custom components (semantic checks)
// ---------------------------------------------------------------------------
test('component params are visible in the body', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component Greet(name) {
        Text { value: "Hola \${name}" }
      }
      Greet { name: "KARA" }
    }
  `);
  assert.equal(p.ui.children[0].type, 'Text');
});

test('cannot assign to a derived inside a component', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C() {
        state a = 1
        derived d = a + 1
        Button { id: "b" text: "B" onClick: d = 5 }
      }
      C { }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('cannot assign to derived')));
});

test('bind to an unknown variable inside a component is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C() {
        TextInput { id: "i" bind: nothere }
      }
      C { }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('bind')));
});

test('type errors inside component bodies are caught', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C() {
        Button { id: "b" text: "B" onClick: {
          let x = 5
          let y = "hola"
          let z = x * y
        } }
      }
      C { }
    }
  `);
  assert.ok(errs.some((e) => e.kind === 'TypeError' && e.message.includes('cannot apply "*" to Int and Str')));
});
