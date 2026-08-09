import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/parser.js';
import { lex } from '../src/lexer.js';

/**
 * In-memory import resolver: `files` maps normalized ids ("dir/file.kara")
 * to their source text.
 */
function memResolver(files) {
  const norm = (p) => p.split('/').filter((x) => x && x !== '.').join('/');
  return (spec, fromDir) => {
    const id = norm(fromDir === '.' ? spec : `${fromDir}/${spec}`);
    if (files[id] !== undefined) return { source: files[id], id };
    return null;
  };
}

/** imports + App wrapper. */
const MAIN = (imports, body) => `${imports}App { title: "T" size: (1, 1) ${body} }`;

test('lexer: dotted builtins lex as a single identifier', () => {
  const { tokens, errors } = lex('File.Read("a.txt")');
  assert.equal(errors.length, 0);
  assert.equal(tokens[0].kind, 'ident');
  assert.equal(tokens[0].value, 'File.Read');
});

test('import merges component definitions from another file', () => {
  const files = {
    'comp.kara': [
      'component Card(title, initial) {',
      '  state n = initial',
      '  Column { Text { value: "\u0024{title}: \u0024{n}" } }',
      '}',
    ].join('\n'),
  };
  const res = compile(
    MAIN('import "./comp.kara"\n', 'Card { title: "A", initial: 1 }'),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.equal(res.program.components.length, 1);
  assert.equal(res.program.components[0].name, 'Card');
  // The instance was expanded into mangled per-instance state.
  assert.ok('n$c0' in res.program.state, 'component state should be expanded');
});

test('import merges fn definitions', () => {
  const files = {
    'util.kara': 'fn triple(x) { return x * 3 }',
  };
  const res = compile(
    MAIN('import "./util.kara"\n', [
      'state result = 0',
      'Button { id: "b" text: "B" onClick: result = triple(5) }',
    ].join('\n')),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.ok(res.program.fns.some((f) => f.name === 'triple'));
});

test('nested imports are resolved relative to the importing module', () => {
  const files = {
    'shared.kara': 'fn helper() { return 42 }',
    'comp.kara': [
      'import "./shared.kara"',
      'component Card() { Column { Text { value: "\u0024{helper()}" } } }',
    ].join('\n'),
  };
  const res = compile(
    MAIN('import "./comp.kara"\n', 'Card {}'),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.ok(res.program.fns.some((f) => f.name === 'helper'));
});

test('importing the same module twice dedupes', () => {
  const files = {
    'c.kara': 'component C() { Column { Text { value: "c" } } }',
  };
  const res = compile(
    MAIN('import "./c.kara"\nimport "./c.kara"\n', 'C {}'),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  assert.equal(res.program.components.length, 1);
});

test('circular imports are safe (no infinite loop)', () => {
  const files = {
    'a.kara': 'import "./b.kara"\ncomponent A() { Column { Text { value: "a" } } }',
    'b.kara': 'import "./a.kara"\ncomponent B() { Column { Text { value: "b" } } }',
  };
  const res = compile(
    MAIN('import "./a.kara"\n', 'A {} B {}'),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const names = res.program.components.map((c) => c.name).sort();
  assert.deepEqual(names, ['A', 'B']);
});

test('unresolved import is an error', () => {
  const res = compile(
    MAIN('import "./missing.kara"\n', ''),
    { resolveImport: memResolver({}) }
  );
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('cannot resolve import')));
});

test('module files cannot contain an App block', () => {
  const files = {
    'bad.kara': 'App { title: "x" size: (1, 1) }',
  };
  const res = compile(
    MAIN('import "./bad.kara"\n', ''),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('cannot contain an App block')));
});

test('module files cannot contain top-level state', () => {
  const files = {
    'bad.kara': 'state x = 1',
  };
  const res = compile(
    MAIN('import "./bad.kara"\n', ''),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('not allowed in a module file')));
});

test('import without a resolver is a helpful error', () => {
  const res = compile(MAIN('import "./c.kara"\n', ''));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('file resolver')));
});

test('duplicate component name across imports is an error', () => {
  const files = {
    'x.kara': 'component Card() { Column { Text { value: "x" } } }',
    'y.kara': 'component Card() { Column { Text { value: "y" } } }',
  };
  const res = compile(
    MAIN('import "./x.kara"\nimport "./y.kara"\n', ''),
    { resolveImport: memResolver(files) }
  );
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('duplicate component')));
});

// --- new widgets -----------------------------------------------------------

test('Select parses options and Slider parses min/max/step', () => {
  const res = compile([
    'App { title: "T" size: (1, 1)',
    '  state rol = "dev"',
    '  state nivel = 3',
    '  Select { id: "r" bind: rol label: "Rol" options: ["dev", "design", "pm"] }',
    '  Slider { id: "n" bind: nivel label: "Nivel" min: 1 max: 10 step: 0.5 }',
    '}',
  ].join('\n'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const sel = res.program.ui.children[0];
  assert.deepEqual(sel.props.options, ['dev', 'design', 'pm']);
  const slider = res.program.ui.children[1];
  assert.equal(slider.props.min, 1);
  assert.equal(slider.props.max, 10);
  assert.equal(slider.props.step, 0.5);
});

test('Select without options is an error', () => {
  const res = compile([
    'App { title: "T" size: (1, 1)',
    '  state rol = "dev"',
    '  Select { id: "r" bind: rol }',
    '}',
  ].join('\n'));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('options')));
});

test('options must be a list of strings', () => {
  const res = compile([
    'App { title: "T" size: (1, 1)',
    '  state rol = "dev"',
    '  Select { id: "r" bind: rol options: "dev" }',
    '}',
  ].join('\n'));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('list of strings')));
});

test('onChange is accepted on bound widgets and parsed as a handler', () => {
  const res = compile([
    'App { title: "T" size: (1, 1)',
    '  state name = ""',
    '  state saved = ""',
    '  TextInput { id: "i" bind: name onChange: saved = name }',
    '}',
  ].join('\n'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
  const input = res.program.ui.children[0];
  assert.equal(input.onChange[0].type, 'Assign');
});

test('onChange is rejected on non-bound widgets', () => {
  const res = compile([
    'App { title: "T" size: (1, 1)',
    '  Text { value: "x" onChange: 1 }',
    '}',
  ].join('\n'));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.message.includes('onChange is only supported')));
});

test('dotted builtins typecheck', () => {
  const ok = compile([
    'App { title: "T" size: (1, 1)',
    '  state s = File.Read("a.txt")',
    '  Button { id: "b" text: "B" onClick: File.Write("b.txt", s) }',
    '}',
  ].join('\n'));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors, null, 2));
});
