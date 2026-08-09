/**
 * KARA interpreter — evaluates the AST program produced by the compiler.
 *
 * The interpreter is a pure module (no I/O) so it can be unit-tested and
 * reused by the server and (for interpolation previews) by future tooling.
 */

export class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

export function formatValue(v) {
  if (Array.isArray(v)) return v.map(formatValue).join(', ');
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  return String(v);
}

/** Evaluate a Str-with-parts node to a plain JS string. */
export function evalStrParts(parts, ctx) {
  let out = '';
  for (const part of parts ?? []) {
    if (part.expr) out += formatValue(evalExpr(part.expr, ctx));
    else out += part.text ?? '';
  }
  return out;
}

export function evalExpr(expr, ctx) {
  switch (expr?.type) {
    case 'Int':
    case 'Float':
      return Number(expr.value);
    case 'Bool':
      return Boolean(expr.value);
    case 'Str':
      return evalStrParts(expr.parts, ctx);
    case 'Array':
      return (expr.items ?? []).map((item) => evalExpr(item, ctx));
    case 'Var': {
      if (expr.name in ctx.locals) return ctx.locals[expr.name];
      return ctx.state[expr.name] ?? null;
    }
    case 'Unary': {
      const v = evalExpr(expr.operand, ctx);
      if (expr.op === '-') return -v;
      if (expr.op === '!') return !v;
      return v;
    }
    case 'Binary':
      return evalBinary(expr, ctx);
    case 'Call':
      return callFunction(expr, ctx);
    default:
      return null;
  }
}

function evalBinary(expr, ctx) {
  const op = expr.op;
  if (op === '&&') return evalExpr(expr.left, ctx) && evalExpr(expr.right, ctx);
  if (op === '||') return evalExpr(expr.left, ctx) || evalExpr(expr.right, ctx);

  const l = evalExpr(expr.left, ctx);
  const r = evalExpr(expr.right, ctx);

  switch (op) {
    case '+':
      // String concatenation when either side is a string.
      if (typeof l === 'string' || typeof r === 'string') {
        return formatValue(l) + formatValue(r);
      }
      return l + r;
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      if (r === 0) throw new Error('division by zero');
      return l / r;
    case '%':
      if (r === 0) throw new Error('modulo by zero');
      return l % r;
    case '==':
      return equal(l, r);
    case '!=':
      return !equal(l, r);
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    case '>=':
      return l >= r;
    default:
      return null;
  }
}

function equal(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  }
  return a === b;
}

function callFunction(call, ctx) {
  const fn = ctx.fns.get(call.name);
  const args = (call.args ?? []).map((a) => evalExpr(a, ctx));
  if (fn) return invokeUserFn(fn, args, ctx);
  const builtin = ctx.builtins.get(call.name);
  if (builtin) return builtin(args, ctx);
  ctx.onUnknownCall?.(call.name);
  return null;
}

export function invokeUserFn(fn, args, ctx) {
  const locals = { __proto__: null };
  fn.params.forEach((p, i) => {
    locals[p.name] = args[i] ?? null;
  });
  const fnCtx = { ...ctx, locals };
  try {
    execStmts(fn.body, fnCtx);
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    throw e;
  }
  return null;
}

export function execStmts(stmts, ctx) {
  for (const stmt of stmts ?? []) {
    try {
      execStmt(stmt, ctx);
    } catch (e) {
      // Annotate runtime errors with the statement's source location so the
      // server/playground can report `line X, col Y` in the .kara source.
      if (e instanceof ReturnSignal) throw e;
      if (e && !e.__karaLoc && stmt?.loc) e.__karaLoc = stmt.loc;
      throw e;
    }
  }
}

export function execStmt(stmt, ctx) {
  switch (stmt?.type) {
    case 'Let': {
      ctx.locals[stmt.name] = evalExpr(stmt.expr, ctx);
      break;
    }
    case 'Assign': {
      const value = evalExpr(stmt.expr, ctx);
      if (stmt.target in ctx.locals) ctx.locals[stmt.target] = value;
      else ctx.state[stmt.target] = value;
      break;
    }
    case 'If': {
      if (truthy(evalExpr(stmt.cond, ctx))) execStmts(stmt.then, ctx);
      else execStmts(stmt.else, ctx);
      break;
    }
    case 'While': {
      let guard = 0;
      while (truthy(evalExpr(stmt.cond, ctx))) {
        execStmts(stmt.body, ctx);
        guard += 1;
        if (guard > 1_000_000) throw new Error('while loop exceeded 1,000,000 iterations');
      }
      break;
    }
    case 'For': {
      const iterable = evalExpr(stmt.iterable, ctx) ?? [];
      if (!Array.isArray(iterable)) throw new Error('"for" expects an array');
      for (const item of iterable) {
        const itemCtx = { ...ctx, locals: { ...ctx.locals, [stmt.item]: item } };
        execStmts(stmt.body, itemCtx);
      }
      break;
    }
    case 'Call': {
      callFunction(stmt, ctx);
      break;
    }
    case 'Return': {
      throw new ReturnSignal(stmt.expr ? evalExpr(stmt.expr, ctx) : null);
    }
    case 'Block': {
      execStmts(stmt.body, ctx);
      break;
    }
    default:
      break;
  }
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

// ---------------------------------------------------------------------------
// Default builtins
// ---------------------------------------------------------------------------
const printImpl = (args, ctx) => {
  ctx.onLog?.(args.map(formatValue).join(' '));
  return null;
};

export const DEFAULT_BUILTINS = {
  Print: printImpl,
  Log: printImpl,
  Alert: (args, ctx) => {
    ctx.onAlert?.(args.map(formatValue).join(' '));
    return null;
  },
  Random: (args) => {
    const [a, b] = args;
    const lo = Math.min(Number(a ?? 0), Number(b ?? 0));
    const hi = Math.max(Number(a ?? 0), Number(b ?? 0));
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  },
  Now: () => Date.now(),
  Length: (args) => {
    const v = args[0];
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'string') return v.length;
    return 0;
  },
  Push: (args) => {
    const list = Array.isArray(args[0]) ? [...args[0]] : [];
    return [...list, ...args.slice(1)];
  },
};

/**
 * Build an interpreter context for a program.
 * @param {object} program the compiled program
 * @param {object} [opts] { state?, onLog?, onAlert?, onUnknownCall? }
 */
export function createContext(program, opts = {}) {
  const fns = new Map((program.fns ?? []).map((f) => [f.name, f]));
  const builtins = new Map(Object.entries(DEFAULT_BUILTINS));
  // Environment-specific builtins (e.g. File.Read/Write in the desktop
  // runtime) can be attached to the program or passed per-call.
  const extra = program.extraBuiltins ?? opts.extraBuiltins;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) builtins.set(k, v);
  }
  return {
    state: opts.state ?? {},
    locals: { __proto__: null },
    fns,
    builtins,
    onLog: opts.onLog ?? (() => {}),
    onAlert: opts.onAlert ?? (() => {}),
    onUnknownCall: opts.onUnknownCall,
  };
}

/** Evaluate a program's state initialisers in dependency order. */
export function evalInitialState(program) {
  const state = {};
  const ctx = { ...createContext(program), state };
  for (const name of Object.keys(program.state ?? {})) {
    state[name] = evalExpr(program.state[name].expr, ctx);
  }
  for (const name of derivedOrderOf(program)) {
    state[name] = evalExpr(program.derived[name].expr, ctx);
  }
  return state;
}

/** Derived names in evaluation order (topologically sorted by the compiler). */
function derivedOrderOf(program) {
  return program.derivedOrder ?? Object.keys(program.derived ?? {});
}

/**
 * Recompute derived variables against a (possibly mutated) state snapshot.
 * Returns only the derived values: { name: value, … }.
 */
export function computeDerived(program, state) {
  const ctx = { ...createContext(program), state };
  const out = {};
  for (const name of derivedOrderOf(program)) {
    out[name] = evalExpr(program.derived[name].expr, ctx);
  }
  return out;
}

/** Run a handler (e.g. a Button onClick) against the interpreter. */
export function runHandler(program, stmts, state, opts = {}) {
  const ctx = createContext(program, { state, ...opts });
  execStmts(stmts, ctx);
  return state;
}
