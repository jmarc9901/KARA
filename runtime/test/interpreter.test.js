import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../compiler/src/parser.js';
import { computeDerived, evalInitialState, runHandler, formatValue } from '../src/interpreter.js';

function prog(src) {
  const res = compile(src);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  return res.program;
}

const simple = () => prog(`
App {
  title: "T"
  size: (100, 100)
  state count = 0
  state name = "KARA"
  state pi = 3.5
  state ok = false
  state items = [10, 20, 30]
}
`);

test('state initialisers evaluate in order', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 2
      state b = a * 3 + 1
      state c = b - a
      state s = "v=\${a}"
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.a, 2);
  assert.equal(state.b, 7);
  assert.equal(state.c, 5);
  assert.equal(state.s, 'v=2');
});

test('types are preserved', () => {
  const state = evalInitialState(simple());
  assert.equal(state.count, 0);
  assert.equal(typeof state.count, 'number');
  assert.equal(state.name, 'KARA');
  assert.equal(typeof state.name, 'string');
  assert.equal(state.pi, 3.5);
  assert.equal(state.ok, false);
  assert.deepEqual(state.items, [10, 20, 30]);
});

test('assignment updates state', () => {
  const p = simple();
  const state = evalInitialState(p);
  runHandler(p, [{ type: 'Assign', target: 'count', expr: { type: 'Binary', op: '+', left: { type: 'Var', name: 'count' }, right: { type: 'Int', value: 1 } } }], state);
  assert.equal(state.count, 1);
});

test('if/else and while run correctly', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state n = 0
      state label = ""
      Button { id: "b" text: "B" onClick: {
        if (n > 5) { label = "big" } else { label = "small" }
        while (n < 5) { n = n + 1 }
      } }
    }
  `);
  const state = evalInitialState(p);
  const btn = p.ui.children[0];
  runHandler(p, btn.onClick, state);
  assert.equal(state.label, 'small');
  assert.equal(state.n, 5);
});

test('for loop over state array', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state total = 0
      state nums = [1, 2, 3, 4]
      Button { id: "b" text: "B" onClick: {
        for (x in nums) { total = total + x }
      } }
    }
  `);
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state);
  assert.equal(state.total, 10);
});

test('user functions with params and return', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state result = 0
      fn double(x) { return x * 2 }
      fn choose(a, b) {
        if (a > b) { return a } 
        return b
      }
      Button { id: "b" text: "B" onClick: {
        result = double(21)
        result = result + choose(3, 9)
      } }
    }
  `);
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state);
  assert.equal(state.result, 42 + 9);
});

test('functions have isolated locals', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 1
      fn f() { let a = 99; return a }
      Button { id: "b" text: "B" onClick: { a = f() } }
    }
  `);
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state);
  // f returns its local 99; state a becomes 99 — but its own local never leaks.
  assert.equal(state.a, 99);
});

test('string concatenation with +', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state s = "a" + "b"
      state n = "n:" + 42
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.s, 'ab');
  assert.equal(state.n, 'n:42');
});

test('comparisons and logic', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 1 < 2 && 3 >= 3
      state b = !(1 == 2)
      state c = "hi" == "hi"
      state d = 2 != 3
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.a, true);
  assert.equal(state.b, true);
  assert.equal(state.c, true);
  assert.equal(state.d, true);
});

test('builtins: Print/Alert/Random/Length/Now', () => {
  const logs = [];
  const alerts = [];
  const p = simple();
  const state = evalInitialState(p);
  runHandler(p, [
    { type: 'Call', name: 'Print', args: [{ type: 'Str', parts: [{ text: 'hello ' }, { expr: { type: 'Var', name: 'name' } }] }] },
    { type: 'Call', name: 'Alert', args: [{ type: 'Str', parts: [{ text: 'hi' }] }] },
    { type: 'Call', name: 'Length', args: [{ type: 'Var', name: 'items' }] },
  ], state, { onLog: (l) => logs.push(l), onAlert: (m) => alerts.push(m) });
  assert.deepEqual(logs, ['hello KARA']);
  assert.deepEqual(alerts, ['hi']);
});

test('Map/Filter/Reduce call user functions by name', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state nums = [1, 2, 3, 4]
      state dobles = Map(nums, "doble")
      state pares = Filter(nums, "esPar")
      state total = Reduce(nums, "suma", 0)
      fn doble(x) { return x * 2 }
      fn esPar(x) { return x % 2 == 0 }
      fn suma(a, b) { return a + b }
    }
  `);
  const state = evalInitialState(p);
  assert.deepEqual(state.dobles, [2, 4, 6, 8]);
  assert.deepEqual(state.pares, [2, 4]);
  assert.equal(state.total, 10);
});

test('Map/Filter/Reduce work inside handlers too', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state nums = [1, 2, 3]
      state out = []
      fn por10(x) { return x * 10 }
      Button { id: "b" text: "B" onClick: out = Map(nums, "por10") }
    }
  `);
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state);
  assert.deepEqual(state.out, [10, 20, 30]);
});

test('Map/Filter/Reduce fns close over outer state', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state minLen = 3
      state words = ["a", "bb", "ccc", "dddd"]
      derived visible = Filter(words, "short")
      derived visibleCount = Reduce(visible, "count", 0)
      fn short(t) { return Length(t) <= minLen }
      fn count(total, t) { return total + 1 }
    }
  `);
  const state = evalInitialState(p);
  assert.deepEqual(state.visible, ['a', 'bb', 'ccc']);
  assert.equal(state.visibleCount, 3);
});

test('division and modulo', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 10 / 4
      state b = 10 % 3
      state c = -5
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.a, 2.5);
  assert.equal(state.b, 1);
  assert.equal(state.c, -5);
});

test('division by zero throws a located runtime error', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state n = 1.0
      Button { id: "b" text: "B" onClick: n = 10 / (n - 1) }
    }
  `);
  const state = evalInitialState(p);
  const btn = p.ui.children[0];
  let caught = null;
  try {
    runHandler(p, btn.onClick, state);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, 'expected a runtime error for division by zero');
  assert.match(String(caught.message), /division by zero/);
  assert.ok(caught.__karaLoc, 'runtime errors should carry the source location');
  assert.ok(caught.__karaLoc.line >= 1, 'location should point at the dividing statement');
});

test('modulo by zero throws', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state n = 0
      Button { id: "b" text: "B" onClick: n = 7 % n }
    }
  `);
  const state = evalInitialState(p);
  assert.throws(() => runHandler(p, p.ui.children[0].onClick, state), /modulo by zero/);
});

test('formatValue handles arrays and strings', () => {
  assert.equal(formatValue([1, 'a', true]), '1, a, true');
  assert.equal(formatValue('x'), 'x');
  assert.equal(formatValue(null), 'null');
});

test('derived values evaluate after state', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 2
      derived d = a * 10
      derived s = "a=" + a
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.d, 20);
  assert.equal(state.s, 'a=2');
});

test('derived recompute after handler and computeDerived', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state a = 1
      derived d = a * 2
      Button { id: "b" text: "B" onClick: a = 10 }
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.d, 2);
  runHandler(p, p.ui.children[0].onClick, state);
  assert.equal(state.a, 10);
  assert.equal(computeDerived(p, state).d, 20);
});

test('derived forward references evaluate in dependency order', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      state base = 2
      derived a = b + 1
      derived b = c * 2
      derived c = base + 1
    }
  `);
  const state = evalInitialState(p);
  assert.equal(state.c, 3);
  assert.equal(state.b, 6);
  assert.equal(state.a, 7);
});

test('component instances have isolated state at runtime', () => {
  const p = prog(`
    App { title: "T" size: (1,1)
      component Item(initial) {
        state n = initial
        derived doble = n * 2
        fn siguiente() { return n + 1 }
        Column {
          Text { value: "n=\${n}" }
          Button { id: "plus" text: "+" onClick: n = siguiente() }
        }
      }
      Column {
        Item { initial: 1 }
        Item { initial: 10 }
      }
    }
  `);
  const col = p.ui.children[0];
  const state = evalInitialState(p);
  assert.equal(state['n$c0'], 1);
  assert.equal(state['n$c1'], 10);

  // clicking + on the first instance only moves the first
  runHandler(p, col.children[0].children[1].onClick, state);
  assert.equal(state['n$c0'], 2);
  assert.equal(state['n$c1'], 10);
  assert.equal(computeDerived(p, state)['doble$c0'], 4);
  assert.equal(computeDerived(p, state)['doble$c1'], 20);
});
