import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../../compiler/src/parser.js';
import { createContext, evalInitialState, runHandler } from '../src/interpreter.js';
import { OS_BUILTINS } from '../src/builtins.js';

function prog(src, extraBuiltins) {
  const res = compile(src);
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const p = res.program;
  if (extraBuiltins) p.extraBuiltins = extraBuiltins;
  return p;
}

test('File.Write and File.Read roundtrip via program.extraBuiltins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kara-'));
  const file = path.join(dir, 'out.txt').replace(/\\/g, '/');
  const p = prog(
    `App { title: "T" size: (1, 1)
      state text = ""
      Button { id: "b" text: "B" onClick: {
        File.Write("${file}", "hola kara")
        text = File.Read("${file}")
      } }
    }`,
    OS_BUILTINS
  );
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state);
  assert.equal(state.text, 'hola kara');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runtime errors from OS builtins carry the statement location', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kara-'));
  const missing = path.join(dir, 'nope.txt').replace(/\\/g, '/');
  const p = prog(
    `App { title: "T" size: (1, 1)
      state text = ""
      Button { id: "b" text: "B" onClick: {
        text = File.Read("${missing}")
      } }
    }`,
    OS_BUILTINS
  );
  const state = evalInitialState(p);
  assert.throws(
    () => runHandler(p, p.ui.children[0].onClick, state),
    (e) => {
      assert.ok(e.__karaLoc, 'error should carry __karaLoc');
      assert.equal(e.__karaLoc.line, 4, 'line should point at the File.Read statement');
      return true;
    }
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Log builtin emits to onLog', () => {
  const p = prog(`App { title: "T" size: (1, 1)
    state n = 3
    Button { id: "b" text: "B" onClick: Log("n=", n) }
  }`);
  const logs = [];
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state, { onLog: (l) => logs.push(l) });
  assert.deepEqual(logs, ['n= 3']);
});

test('extraBuiltins can be injected per-call via createContext opts', () => {
  const p = prog(`App { title: "T" size: (1, 1) state x = 0 }`);
  const ctx = createContext(p, { extraBuiltins: { 'Test.Fn': () => 42 } });
  assert.equal(typeof ctx.builtins.get('Test.Fn'), 'function');
});

test('OS builtins are unavailable without injection (browser playground)', () => {
  const p = prog(`App { title: "T" size: (1, 1)
    state x = ""
    Button { id: "b" text: "B" onClick: x = File.Read("a.txt") }
  }`);
  const calls = [];
  const state = evalInitialState(p);
  runHandler(p, p.ui.children[0].onClick, state, { onUnknownCall: (n) => calls.push(n) });
  assert.deepEqual(calls, ['File.Read']);
  assert.equal(state.x, null);
});
