/**
 * KARA semantic analysis.
 *
 * The parser handles syntax; this pass handles name resolution and structural
 * rules: duplicate declarations, references to unknown variables/functions,
 * invalid `bind` targets and `return` placement.
 *
 * Returns a list of errors (empty when the program is sound).
 */

export function sema(program, { builtins = [] } = {}) {
  const errors = [];
  const addErr = (message, loc) =>
    errors.push({ kind: 'SemanticError', message, line: loc?.line ?? 0, col: loc?.col ?? 0, index: loc?.index ?? 0 });

  const stateNames = new Set(Object.keys(program.state));
  const derivedNames = new Set(Object.keys(program.derived ?? {}));
  const fnNames = new Set(program.fns.map((f) => f.name));

  const baseCtx = {
    locals: new Set(),
    stateNames,
    derivedNames,
    fnNames,
    builtins: new Set(builtins),
    inFn: false,
    addErr,
  };

  // --- state initialisers --------------------------------------------------
  // Only states declared so far may be referenced (no self/forward references);
  // all derived variables are visible (they are computed after states).
  const declared = new Set();
  for (const name of Object.keys(program.state)) {
    const { expr } = program.state[name];
    walkExpr(expr, { ...baseCtx, stateNames: new Set([...declared, ...derivedNames]) });
    declared.add(name);
  }

  // --- derived initialisers ------------------------------------------------
  const derivedDeclared = new Set();
  for (const name of Object.keys(program.derived ?? {})) {
    const { expr } = program.derived[name];
    walkExpr(expr, {
      ...baseCtx,
      stateNames: new Set([...Object.keys(program.state), ...derivedDeclared]),
    });
    derivedDeclared.add(name);
  }

  // --- functions -----------------------------------------------------------
  for (const fn of program.fns) {
    const locals = new Set(fn.params.map((p) => p.name));
    walkStmts(fn.body, { ...baseCtx, locals, inFn: true });
  }

  // --- UI tree -------------------------------------------------------------
  walkNode(program.ui, baseCtx);

  // --- custom components ---------------------------------------------------
  // Definitions are validated even when never instantiated: params are visible
  // as locals, component state/derived/fn names resolve like app-level ones.
  for (const def of program.components ?? []) {
    checkComponentDef(def, program, new Set(builtins), addErr);
  }

  return errors;
}

/** Name-resolution pass over one custom component definition. */
function checkComponentDef(def, program, builtins, addErr) {
  const ctx = {
    locals: new Set((def.params ?? []).map((p) => p.name)),
    stateNames: new Set(Object.keys(def.states ?? {})),
    derivedNames: new Set(Object.keys(def.derived ?? {})),
    fnNames: new Set([
      ...(program.fns ?? []).map((f) => f.name),
      ...(def.fns ?? []).map((f) => f.name),
    ]),
    builtins,
    inFn: false,
    addErr,
  };

  // state initialisers: params + previously declared component states visible
  const declared = new Set();
  for (const name of Object.keys(def.states ?? {})) {
    walkExpr(def.states[name].expr, {
      ...ctx,
      stateNames: new Set([...declared, ...ctx.derivedNames]),
    });
    declared.add(name);
  }

  // derived initialisers
  const derivedDeclared = new Set();
  for (const name of Object.keys(def.derived ?? {})) {
    walkExpr(def.derived[name].expr, {
      ...ctx,
      stateNames: new Set([...Object.keys(def.states ?? {}), ...derivedDeclared]),
    });
    derivedDeclared.add(name);
  }

  // functions: params of the component are visible, plus the fn's own params
  for (const fn of def.fns ?? []) {
    const locals = new Set([...ctx.locals, ...fn.params.map((p) => p.name)]);
    walkStmts(fn.body, { ...ctx, locals, inFn: true });
  }

  // body UI nodes
  walkNode({ type: 'App', children: def.children ?? [] }, ctx);
}

function walkStmts(stmts, ctx) {
  for (const stmt of stmts) walkStmt(stmt, ctx);
}

function walkStmt(stmt, ctx) {
  if (!stmt) return;
  switch (stmt.type) {
    case 'Let': {
      walkExpr(stmt.expr, ctx);
      ctx.locals.add(stmt.name);
      break;
    }
    case 'Assign': {
      if (ctx.derivedNames?.has(stmt.target)) {
        ctx.addErr(`cannot assign to derived variable "${stmt.target}"`, stmt.loc);
      } else if (!ctx.locals.has(stmt.target) && !ctx.stateNames.has(stmt.target)) {
        ctx.addErr(
          `cannot assign to "${stmt.target}": not a state variable or local`,
          stmt.loc
        );
      }
      walkExpr(stmt.expr, ctx);
      break;
    }
    case 'If': {
      walkExpr(stmt.cond, ctx);
      walkStmts(stmt.then, ctx);
      walkStmts(stmt.else, ctx);
      break;
    }
    case 'While': {
      walkExpr(stmt.cond, ctx);
      walkStmts(stmt.body, ctx);
      break;
    }
    case 'For': {
      walkExpr(stmt.iterable, ctx);
      const inner = { ...ctx, locals: new Set([...ctx.locals, stmt.item]) };
      walkStmts(stmt.body, inner);
      break;
    }
    case 'Call': {
      checkCall(stmt, ctx);
      for (const arg of stmt.args ?? []) walkExpr(arg, ctx);
      break;
    }
    case 'Return': {
      if (!ctx.inFn) ctx.addErr('"return" is only allowed inside a function', stmt.loc);
      if (stmt.expr) walkExpr(stmt.expr, ctx);
      break;
    }
    case 'Block': {
      walkStmts(stmt.body, ctx);
      break;
    }
    default:
      break;
  }
}

function walkExpr(expr, ctx) {
  if (!expr) return;
  switch (expr.type) {
    case 'Int':
    case 'Float':
    case 'Bool':
      break;
    case 'Str':
      for (const part of expr.parts ?? []) {
        if (part.expr) walkExpr(part.expr, ctx);
      }
      break;
    case 'Array':
      for (const item of expr.items ?? []) walkExpr(item, ctx);
      break;
    case 'Var': {
      if (
        !ctx.locals.has(expr.name) &&
        !ctx.stateNames.has(expr.name) &&
        !ctx.derivedNames?.has(expr.name)
      ) {
        ctx.addErr(`unknown variable "${expr.name}"`, expr.loc);
      }
      break;
    }
    case 'Unary':
      walkExpr(expr.operand, ctx);
      break;
    case 'Binary':
      walkExpr(expr.left, ctx);
      walkExpr(expr.right, ctx);
      break;
    case 'Call':
      checkCall(expr, ctx);
      for (const arg of expr.args ?? []) walkExpr(arg, ctx);
      break;
    default:
      break;
  }
}

function checkCall(call, ctx) {
  const known = ctx.fnNames.has(call.name) || ctx.builtins.has(call.name);
  if (!known) ctx.addErr(`unknown function "${call.name}"`, call.loc);
}

function walkNode(node, ctx) {
  if (!node) return;

  // if / for blocks in the UI tree
  if (node.type === 'If') {
    walkExpr(node.cond, ctx);
    for (const child of node.children ?? []) walkNode(child, ctx);
    for (const child of node.else ?? []) walkNode(child, ctx);
    return;
  }
  if (node.type === 'For') {
    walkExpr(node.iterable, ctx);
    const inner = { ...ctx, locals: new Set([...ctx.locals, node.item]) };
    for (const child of node.children ?? []) walkNode(child, inner);
    return;
  }

  for (const child of node.children ?? []) walkNode(child, ctx);

  if (node.onClick) walkStmts(node.onClick, { ...ctx, locals: new Set() });
  if (node.onChange) walkStmts(node.onChange, { ...ctx, locals: new Set() });

  const bind = node.props?.bind;
  if (typeof bind === 'string' && !ctx.stateNames.has(bind)) {
    ctx.addErr(`"bind" references unknown state variable "${bind}"`, node.loc);
  }

  // Interpolation parts inside string props (e.g. Text value: "Hola ${name}")
  for (const v of Object.values(node.props ?? {})) {
    if (Array.isArray(v)) {
      for (const part of v) {
        if (part && typeof part === 'object' && part.expr) walkExpr(part.expr, ctx);
      }
    }
  }
}
