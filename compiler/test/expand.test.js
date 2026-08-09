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
// component expansion
// ---------------------------------------------------------------------------
test('component with props, state, derived and fn expands per instance', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component Item(title, initial) {
        state n = initial
        derived doble = n * 2
        fn siguiente() { return n + 1 }
        Column {
          Text { value: "\${title}:\${n}" }
          Button { id: "plus" text: "+" onClick: n = siguiente() }
        }
      }
      Column {
        Item { title: "A", initial: 1 }
        Item { title: "B", initial: 2 }
      }
    }
  `);
  const col = p.ui.children[0];
  assert.equal(col.children.length, 2);

  // per-instance state
  assert.ok('n$c0' in p.state, 'missing n$c0');
  assert.ok('n$c1' in p.state, 'missing n$c1');
  assert.ok('doble$c0' in p.derived, 'missing doble$c0');
  assert.ok('doble$c1' in p.derived, 'missing doble$c1');

  // widget ids mangled per instance
  assert.equal(col.children[0].children[1].props.id, 'plus$c0');
  assert.equal(col.children[1].children[1].props.id, 'plus$c1');

  // handlers reference mangled state and hoisted fn
  const onClick = col.children[0].children[1].onClick[0];
  assert.equal(onClick.target, 'n$c0');
  assert.equal(onClick.expr.name, 'siguiente$c0');

  // prop expressions substituted (title → string literal)
  const text = col.children[1].children[0];
  assert.equal(text.props.value[0].expr.parts[0].text, 'B');

  // fn hoisted with mangled name
  assert.ok(p.fns.some((f) => f.name === 'siguiente$c0'));
});

test('component state initialisers can reference app state via props', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component C(v) { state n = v }
      state extra = 7
      C { v: extra }
    }
  `);
  assert.equal(p.state['n$c0'].expr.type, 'Var');
  assert.equal(p.state['n$c0'].expr.name, 'extra');
});

test('unknown component is an error', () => {
  const errs = errorsOf('App { title: "x" size: (1, 1) Foo { a: 1 } }');
  assert.ok(errs.some((e) => e.message.includes('unknown component "Foo"')));
});

test('missing required prop is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C(x) { Text { value: "\${x}" } }
      C { }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('requires prop "x"')));
});

test('unknown prop on a component is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C(x) { Text { value: "\${x}" } }
      C { x: 1, bogus: 2 }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('unknown prop "bogus"')));
});

test('circular component reference is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component A() { B { } }
      component B() { A { } }
      A { }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('circular component reference')));
});

test('duplicate component definition is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C() { }
      component C() { }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('duplicate component "C"')));
});

test('cannot redefine a built-in component', () => {
  const errs = errorsOf('App { title: "x" size: (1, 1) component Column() { } }');
  assert.ok(errs.some((e) => e.message.includes('cannot redefine built-in component "Column"')));
});

test('assigning to a component parameter is an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C(x) { Button { id: "b" text: "B" onClick: x = 1 } }
      C { x: 1 }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('cannot assign to component parameter "x"')));
});

test('nested custom components expand recursively', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component Inner(v) { Text { value: "\${v}" } }
      component Outer(v) {
        Column { Inner { v: v } }
      }
      Column { Outer { v: 42 } }
    }
  `);
  const inner = p.ui.children[0].children[0].children[0];
  assert.equal(inner.type, 'Text');
  assert.equal(inner.props.value[0].expr.type, 'Int');
  assert.equal(inner.props.value[0].expr.value, 42);
});

test('component inside a for loop expands once (state shared across iterations)', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component C() { state n = 0 }
      Column {
        for (x in [1, 2]) { C { } }
      }
    }
  `);
  const forNode = p.ui.children[0].children[0];
  assert.equal(forNode.type, 'For');
  assert.ok('n$c0' in p.state);
});

test('unused component definitions are still validated', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      component C(x) { Text { value: "\${missing}" } }
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('unknown variable "missing"')));
});

test('component body can bind a TextInput to its local state', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      component Field() {
        state name = "KARA"
        TextInput { id: "f" bind: name }
      }
      Field { }
    }
  `);
  const input = p.ui.children[0];
  assert.equal(input.props.id, 'f$c0');
  assert.equal(input.props.bind, 'name$c0');
});

// ---------------------------------------------------------------------------
// derived dependency graph
// ---------------------------------------------------------------------------
test('derived forward references are ordered by the dependency graph', () => {
  const p = prog(`
    App { title: "x" size: (1, 1)
      state base = 2
      derived a = b + 1
      derived b = c * 2
      derived c = base + 1
    }
  `);
  assert.deepEqual(p.derivedOrder, ['c', 'b', 'a']);
});

test('derived cycles are an error', () => {
  const errs = errorsOf(`
    App { title: "x" size: (1, 1)
      derived a = b + 1
      derived b = a + 1
    }
  `);
  assert.ok(errs.some((e) => e.message.includes('circular derived dependency')));
});

test('self-referencing derived is an error', () => {
  const errs = errorsOf('App { title: "x" size: (1, 1) derived a = a + 1 }');
  assert.ok(errs.some((e) => e.message.includes('circular derived dependency')));
});

test('derived with no dependencies keeps order', () => {
  const p = prog('App { title: "x" size: (1, 1) derived d = 5 }');
  assert.deepEqual(p.derivedOrder, ['d']);
});
