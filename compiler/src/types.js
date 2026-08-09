/**
 * KARA static type checking.
 *
 * The language is dynamically typed at runtime, but the compiler performs a
 * static pre-pass (like the one promised in docs/en/language-spec.md §4):
 *   let x = 5        // Int
 *   let y = "hola"   // Str
 *   let z = x + y    // → error: cannot add Int and Str
 *
 * Types: 'Int' | 'Float' | 'Bool' | 'Str' | 'Array' | 'Null' | 'Any' | 'Unknown'
 * - 'Any' is the explicit dynamic escape hatch.
 * - 'Unknown' means "not statically known" (e.g. a for-loop item) — never an
 *   error, used to stay permissive for dynamic values.
 */

const TYPES = {
  Int: 'Int',
  Float: 'Float',
  Bool: 'Bool',
  Str: 'Str',
  Array: 'Array',
  Null: 'Null',
  Any: 'Any',
  Unknown: 'Unknown',
};

/** Builtin signatures: param types (variadic ⇒ repeat last) and return type. */
const BUILTIN_SIGNATURES = {
  Print: { params: ['Any'], variadic: true, ret: TYPES.Null },
  Alert: { params: ['Any'], variadic: true, ret: TYPES.Null },
  Random: { params: [TYPES.Int, TYPES.Int], variadic: false, ret: TYPES.Int },
  Now: { params: [], variadic: false, ret: TYPES.Int },
  Length: { params: [TYPES.Any], variadic: false, ret: TYPES.Int },
  Push: { params: [TYPES.Array, TYPES.Any], variadic: true, ret: TYPES.Array },
  Log: { params: ['Any'], variadic: true, ret: TYPES.Null },
  'File.Read': { params: [TYPES.Str], variadic: false, ret: TYPES.Str },
  'File.Write': { params: [TYPES.Str, TYPES.Any], variadic: false, ret: TYPES.Null },
};

const NUMERIC = new Set([TYPES.Int, TYPES.Float]);

function isNumeric(t) {
  return NUMERIC.has(t);
}

/** Int + Int → Int; anything else numeric → Float. */
function numJoin(a, b) {
  if (a === TYPES.Int && b === TYPES.Int) return TYPES.Int;
  return TYPES.Float;
}

/** Merge several return types into one (used for fn return analysis). */
function joinRets(types) {
  const clean = types.filter((t) => t !== TYPES.Null);
  if (clean.length === 0) return TYPES.Null;
  const unique = new Set(clean);
  if (unique.size === 1) return clean[0];
  const allNumeric = clean.every(isNumeric);
  if (allNumeric) return TYPES.Float;
  return TYPES.Any;
}

/**
 * Run the static type pass over a compiled program.
 * @param {object} program output of the parser
 * @param {{ builtins?: string[] }} [opts]
 * @returns {object[]} type errors (empty when the program is sound)
 */
export function typecheck(program, { builtins = [] } = {}) {
  const errors = [];
  const addErr = (message, loc) =>
    errors.push({ kind: 'TypeError', message, line: loc?.line ?? 0, col: loc?.col ?? 0, index: loc?.index ?? 0 });

  // --- environment ---------------------------------------------------------
  const stateEnv = new Map();
  for (const name of Object.keys(program.state ?? {})) {
    const t = inferExpr(program.state[name].expr, { env: stateEnv, loc: program.state[name].loc, addErr });
    stateEnv.set(name, t);
  }
  const derivedEnv = new Map(stateEnv);
  for (const name of Object.keys(program.derived ?? {})) {
    const t = inferExpr(program.derived[name].expr, { env: derivedEnv, loc: program.derived[name].loc, addErr });
    derivedEnv.set(name, t);
  }

  // --- functions -----------------------------------------------------------
  const fns = new Map(program.fns.map((f) => [f.name, f]));
  const retTypes = new Map();
  for (const fn of program.fns) {
    retTypes.set(fn.name, analyzeFnReturn(fn, { env: derivedEnv, fns, addErr }));
  }

  for (const fn of program.fns) {
    const env = new Map(derivedEnv);
    fn.params.forEach((p) => env.set(p.name, TYPES.Unknown));
    const ctx = { env, loc: null, addErr, fns, retTypes };
    for (const stmt of fn.body ?? []) walkStmtTypes(stmt, ctx);
  }

  // --- UI tree -------------------------------------------------------------
  walkNodeTypes(program.ui, { env: derivedEnv, loc: null, addErr, fns, retTypes });

  // --- custom components ---------------------------------------------------
  for (const def of program.components ?? []) {
    typecheckComponentDef(def, program, addErr);
  }

  return errors;
}

/** Static type pass over one custom component definition. */
function typecheckComponentDef(def, program, addErr) {
  const env = new Map();
  for (const p of def.params ?? []) env.set(p.name, TYPES.Unknown);
  for (const name of Object.keys(def.states ?? {})) {
    const t = inferExpr(def.states[name].expr, { env, loc: def.states[name].loc, addErr });
    env.set(name, t);
  }
  for (const name of Object.keys(def.derived ?? {})) {
    const t = inferExpr(def.derived[name].expr, { env, loc: def.derived[name].loc, addErr });
    env.set(name, t);
  }

  const fns = new Map([
    ...(program.fns ?? []).map((f) => [f.name, f]),
    ...(def.fns ?? []).map((f) => [f.name, f]),
  ]);
  const retTypes = new Map();
  for (const fn of def.fns ?? []) retTypes.set(fn.name, analyzeFnReturn(fn, { env, fns, addErr }));
  for (const fn of def.fns ?? []) {
    const fenv = new Map(env);
    fn.params.forEach((p) => fenv.set(p.name, TYPES.Unknown));
    for (const stmt of fn.body ?? []) walkStmtTypes(stmt, { env: fenv, loc: null, addErr, fns, retTypes });
  }

  walkNodeTypes({ type: 'App', children: def.children ?? [] }, { env, loc: null, addErr, fns, retTypes });
}

function walkStmtTypes(stmt, ctx) {
  if (!stmt) return;
  const here = { ...ctx, loc: stmt.loc };
  switch (stmt.type) {
    case 'Let': {
      const t = inferExpr(stmt.expr, here);
      ctx.env.set(stmt.name, t);
      break;
    }
    case 'Assign': {
      const t = inferExpr(stmt.expr, here);
      const target = ctx.env.get(stmt.target);
      if (target && target !== TYPES.Unknown && t !== TYPES.Unknown && t !== target) {
        ctx.addErr(`cannot assign ${t} to variable "${stmt.target}" of type ${target}`, stmt.loc);
      }
      break;
    }
    case 'If': {
      inferExpr(stmt.cond, here);
      walkStmtsTypes(stmt.then, ctx);
      walkStmtsTypes(stmt.else, ctx);
      break;
    }
    case 'While': {
      inferExpr(stmt.cond, here);
      walkStmtsTypes(stmt.body, ctx);
      break;
    }
    case 'For': {
      const it = inferExpr(stmt.iterable, here);
      if (it && it !== TYPES.Unknown && it !== TYPES.Any && it !== TYPES.Array) {
        ctx.addErr(`"for" expects an array, found ${it}`, stmt.loc);
      }
      const itemType = inferArrayItemType(stmt.iterable, here);
      const inner = { ...ctx, env: new Map(ctx.env).set(stmt.item, itemType) };
      walkStmtsTypes(stmt.body, inner);
      break;
    }
    case 'Return':
      if (stmt.expr) inferExpr(stmt.expr, here);
      break;
    case 'Call':
      inferExpr(stmt, here);
      break;
    case 'Block':
      walkStmtsTypes(stmt.body, ctx);
      break;
    default:
      break;
  }
}

function walkStmtsTypes(stmts, ctx) {
  for (const stmt of stmts ?? []) walkStmtTypes(stmt, ctx);
}

/** Infer the element type of an Array literal (Unknown otherwise). */
function inferArrayItemType(expr, ctx) {
  if (expr?.type !== 'Array') return TYPES.Unknown;
  const items = expr.items ?? [];
  if (items.length === 0) return TYPES.Unknown;
  const types = items.map((i) => inferExpr(i, ctx));
  const unique = new Set(types.filter((t) => t !== TYPES.Unknown));
  if (unique.size === 1) return types[0];
  return TYPES.Unknown;
}

function walkNodeTypes(node, ctx) {
  if (!node) return;
  if (node.type === 'If') {
    inferExpr(node.cond, ctx);
    for (const child of node.children ?? []) walkNodeTypes(child, ctx);
    for (const child of node.else ?? []) walkNodeTypes(child, ctx);
    return;
  }
  if (node.type === 'For') {
    const it = inferExpr(node.iterable, ctx);
    if (it && it !== TYPES.Unknown && it !== TYPES.Any && it !== TYPES.Array) {
      ctx.addErr(`"for" expects an array, found ${it}`, node.loc);
    }
    const itemType = inferArrayItemType(node.iterable, ctx);
    const inner = { ...ctx, env: new Map(ctx.env).set(node.item, itemType) };
    for (const child of node.children ?? []) walkNodeTypes(child, inner);
    return;
  }
  for (const child of node.children ?? []) walkNodeTypes(child, ctx);
  if (node.onClick) walkStmtsTypes(node.onClick, { ...ctx, env: new Map(ctx.env) });
  if (node.onChange) walkStmtsTypes(node.onChange, { ...ctx, env: new Map(ctx.env) });

  // Interpolation parts inside string props (e.g. Text value: "Hola ${name}")
  for (const v of Object.values(node.props ?? {})) {
    if (Array.isArray(v)) {
      for (const part of v) {
        if (part && typeof part === 'object' && part.expr) inferExpr(part.expr, ctx);
      }
    }
  }
}

function analyzeFnReturn(fn, ctx) {
  const rets = [];
  const env = new Map(ctx.env);
  fn.params.forEach((p) => env.set(p.name, TYPES.Unknown));
  const inner = { ...ctx, env, loc: null };
  collectReturns(fn.body ?? [], inner, rets);
  return joinRets(rets);
}

function collectReturns(stmts, ctx, rets) {
  for (const stmt of stmts ?? []) {
    if (!stmt) continue;
    switch (stmt.type) {
      case 'Return':
        rets.push(stmt.expr ? inferExpr(stmt.expr, ctx) : TYPES.Null);
        break;
      case 'If':
        collectReturns(stmt.then, ctx, rets);
        collectReturns(stmt.else, ctx, rets);
        break;
      case 'While':
        collectReturns(stmt.body, ctx, rets);
        break;
      case 'For':
        collectReturns(stmt.body, ctx, rets);
        break;
      case 'Block':
        collectReturns(stmt.body, ctx, rets);
        break;
      default:
        break;
    }
  }
}

function inferExpr(expr, ctx) {
  if (!expr) return TYPES.Unknown;
  switch (expr.type) {
    case 'Int':
      return TYPES.Int;
    case 'Float':
      return TYPES.Float;
    case 'Bool':
      return TYPES.Bool;
    case 'Str':
      for (const part of expr.parts ?? []) {
        if (part.expr) inferExpr(part.expr, ctx);
      }
      return TYPES.Str;
    case 'Array':
      for (const item of expr.items ?? []) inferExpr(item, ctx);
      return TYPES.Array;
    case 'Var':
      return ctx.env.get(expr.name) ?? TYPES.Unknown;
    case 'Unary': {
      const t = inferExpr(expr.operand, ctx);
      if (expr.op === '!') return TYPES.Bool;
      if (isNumeric(t) || t === TYPES.Unknown || t === TYPES.Any) return t === TYPES.Float ? TYPES.Float : TYPES.Int;
      ctx.addErr(`unary "-" requires a number, found ${t}`, ctx.loc);
      return TYPES.Unknown;
    }
    case 'Binary':
      return inferBinary(expr, ctx);
    case 'Call':
      return inferCall(expr, ctx);
    default:
      return TYPES.Unknown;
  }
}

function inferBinary(expr, ctx) {
  const op = expr.op;
  if (op === '&&' || op === '||') {
    inferExpr(expr.left, ctx);
    inferExpr(expr.right, ctx);
    return TYPES.Bool;
  }
  if (op === '==' || op === '!=') {
    inferExpr(expr.left, ctx);
    inferExpr(expr.right, ctx);
    return TYPES.Bool;
  }

  const l = inferExpr(expr.left, ctx);
  const r = inferExpr(expr.right, ctx);
  const loose = l === TYPES.Unknown || r === TYPES.Unknown || l === TYPES.Any || r === TYPES.Any;

  switch (op) {
    case '+':
      if (l === TYPES.Str || r === TYPES.Str) return TYPES.Str;
      if (loose) return TYPES.Unknown;
      if (isNumeric(l) && isNumeric(r)) return numJoin(l, r);
      ctx.addErr(`cannot add ${l} and ${r}`, ctx.loc);
      return TYPES.Unknown;
    case '-':
    case '*':
    case '%':
      if (loose) return TYPES.Unknown;
      if (isNumeric(l) && isNumeric(r)) return numJoin(l, r);
      ctx.addErr(`cannot apply "${op}" to ${l} and ${r}`, ctx.loc);
      return TYPES.Unknown;
    case '/':
      if (loose) return TYPES.Unknown;
      if (isNumeric(l) && isNumeric(r)) return TYPES.Float;
      ctx.addErr(`cannot apply "/" to ${l} and ${r}`, ctx.loc);
      return TYPES.Unknown;
    case '<':
    case '<=':
    case '>':
    case '>=':
      if (loose || (isNumeric(l) && isNumeric(r)) || (l === TYPES.Str && r === TYPES.Str)) return TYPES.Bool;
      ctx.addErr(`cannot compare ${l} and ${r}`, ctx.loc);
      return TYPES.Unknown;
    default:
      return TYPES.Unknown;
  }
}

function inferCall(call, ctx) {
  const args = (call.args ?? []).map((a) => inferExpr(a, ctx));
  const name = call.name;

  const sig = BUILTIN_SIGNATURES[name];
  if (sig) {
    checkArity(name, sig.params, sig.variadic, args.length, ctx);
    return sig.ret;
  }

  const fn = ctx.fns?.get(name);
  if (fn) {
    checkArity(name, fn.params.map(() => TYPES.Unknown), false, args.length, ctx);
    return ctx.retTypes?.get(name) ?? TYPES.Unknown;
  }

  return TYPES.Unknown;
}

function checkArity(name, params, variadic, got, ctx) {
  if (variadic) {
    if (got < params.length) {
      ctx.addErr(`function "${name}" expects at least ${params.length} argument(s), got ${got}`, ctx.loc);
    }
    return;
  }
  if (got !== params.length) {
    ctx.addErr(`function "${name}" expects ${params.length} argument(s), got ${got}`, ctx.loc);
  }
}

/**
 * Static type summary for tooling (LSP hover/completions).
 * @returns {{ vars: Map<string,string>, fns: Map<string,string> }}
 */
export function inferTypeMap(program) {
  const vars = new Map();
  const addErr = () => {};
  const env = new Map();
  for (const name of Object.keys(program.state ?? {})) {
    const t = inferExpr(program.state[name].expr, { env, loc: program.state[name].loc, addErr });
    env.set(name, t);
    vars.set(name, t);
  }
  for (const name of Object.keys(program.derived ?? {})) {
    const t = inferExpr(program.derived[name].expr, { env, loc: program.derived[name].loc, addErr });
    env.set(name, t);
    vars.set(name, t);
  }
  const fns = new Map();
  const fnsMap = new Map(program.fns.map((f) => [f.name, f]));
  for (const fn of program.fns) {
    fns.set(fn.name, analyzeFnReturn(fn, { env, fns: fnsMap, addErr }));
  }
  return { vars, fns };
}
