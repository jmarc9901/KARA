/**
 * KARA component expansion + derived ordering.
 *
 * Custom components are expanded at compile time into plain AST nodes:
 *   - every instance gets a unique id (`c0`, `c1`, …)
 *   - component-local `state`/`derived`/`fn` names are mangled with that id
 *   - widget `id` props inside the body are mangled too, so each instance
 *     routes its events to itself
 *   - prop expressions are substituted (cloned) wherever the parameter is used
 *
 * The output is a regular program (no `Component` nodes) that sema, the type
 * checker and the runtime consume unchanged.
 *
 * `sortDerived` topologically orders `derived` variables from their real
 * dependency graph (forward references now work) and reports cycles.
 */

function err(message, loc) {
  return {
    kind: 'SemanticError',
    message,
    line: loc?.line ?? 0,
    col: loc?.col ?? 0,
    index: loc?.index ?? 0,
  };
}

/** Clone a JSON-safe AST value. */
function clone(x) {
  return x == null ? x : JSON.parse(JSON.stringify(x));
}

/**
 * Expand every custom component instance in `program.ui` (and in component
 * bodies) into plain AST nodes. Returns the expanded program plus errors.
 */
export function expand(program) {
  const errors = [];
  const compMap = new Map((program.components ?? []).map((c) => [c.name, c]));
  const state = { ...(program.state ?? {}) };
  const derived = { ...(program.derived ?? {}) };
  const fns = [...(program.fns ?? [])];
  let uid = 0;

  // -------------------------------------------------------------------------
  // Substitution (params → prop exprs, local names → mangled names)
  // -------------------------------------------------------------------------
  const mangle = (name, id) => `${name}$${id}`;

  function substituteExpr(expr, subs, shadow) {
    if (!expr) return expr;
    switch (expr.type) {
      case 'Var': {
        if (shadow.has(expr.name)) return expr;
        if (subs.params.has(expr.name)) return clone(subs.params.get(expr.name));
        if (subs.locals.has(expr.name)) return { type: 'Var', name: subs.locals.get(expr.name) };
        return expr;
      }
      case 'Str':
        return {
          ...expr,
          parts: (expr.parts ?? []).map((p) =>
            p.expr ? { ...p, expr: substituteExpr(p.expr, subs, shadow) } : p
          ),
        };
      case 'Array':
        return { ...expr, items: (expr.items ?? []).map((i) => substituteExpr(i, subs, shadow)) };
      case 'Unary':
        return { ...expr, operand: substituteExpr(expr.operand, subs, shadow) };
      case 'Binary':
        return {
          ...expr,
          left: substituteExpr(expr.left, subs, shadow),
          right: substituteExpr(expr.right, subs, shadow),
        };
      case 'Call':
        return {
          ...expr,
          name: !shadow.has(expr.name) && subs.locals.has(expr.name) ? subs.locals.get(expr.name) : expr.name,
          args: (expr.args ?? []).map((a) => substituteExpr(a, subs, shadow)),
        };
      default:
        return expr;
    }
  }

  function substituteStmts(stmts, subs, shadow, into, errors) {
    for (const stmt of stmts ?? []) {
      const out = substituteStmt(stmt, subs, shadow, errors);
      if (out) into.push(out);
    }
    return into;
  }

  function substituteStmt(stmt, subs, shadow, errors) {
    if (!stmt) return null;
    switch (stmt.type) {
      case 'Let': {
        let name = stmt.name;
        if (shadow.has(name)) return { ...stmt, expr: substituteExpr(stmt.expr, subs, shadow) };
        if (subs.params.has(name)) {
          errors.push(err(`"let" cannot shadow component parameter "${name}"`, stmt.loc));
        } else if (subs.locals.has(name)) {
          name = subs.locals.get(name);
        }
        return { ...stmt, name, expr: substituteExpr(stmt.expr, subs, shadow) };
      }
      case 'Assign': {
        let target = stmt.target;
        if (!shadow.has(target)) {
          if (subs.params.has(target)) {
            errors.push(err(`cannot assign to component parameter "${target}"`, stmt.loc));
          } else if (subs.locals.has(target)) {
            target = subs.locals.get(target);
          }
        }
        return { ...stmt, target, expr: substituteExpr(stmt.expr, subs, shadow) };
      }
      case 'If': {
        const innerShadow = new Set(shadow);
        return {
          ...stmt,
          cond: substituteExpr(stmt.cond, subs, shadow),
          then: substituteStmts(stmt.then, subs, innerShadow, [], errors),
          else: substituteStmts(stmt.else, subs, innerShadow, [], errors),
        };
      }
      case 'While':
        return {
          ...stmt,
          cond: substituteExpr(stmt.cond, subs, shadow),
          body: substituteStmts(stmt.body, subs, shadow, [], errors),
        };
      case 'For': {
        // The loop item shadows any same-named outer variable inside the body.
        const innerShadow = new Set(shadow);
        innerShadow.add(stmt.item);
        return {
          ...stmt,
          iterable: substituteExpr(stmt.iterable, subs, shadow),
          body: substituteStmts(stmt.body, subs, innerShadow, [], errors),
        };
      }
      case 'Return':
        return { ...stmt, expr: stmt.expr ? substituteExpr(stmt.expr, subs, shadow) : null };
      case 'Call':
        return {
          ...stmt,
          name: !shadow.has(stmt.name) && subs.locals.has(stmt.name) ? subs.locals.get(stmt.name) : stmt.name,
          args: (stmt.args ?? []).map((a) => substituteExpr(a, subs, shadow)),
        };
      case 'Block':
        return { ...stmt, body: substituteStmts(stmt.body, subs, shadow, [], errors) };
      default:
        return stmt;
    }
  }

  function substituteNodes(nodes, subs, shadow, errors) {
    const out = [];
    for (const node of nodes ?? []) {
      const n = substituteNode(node, subs, shadow, errors);
      if (n) out.push(n);
    }
    return out;
  }

  function substituteNode(node, subs, shadow, errors) {
    if (!node) return null;
    switch (node.type) {
      case 'If':
        return {
          ...node,
          cond: substituteExpr(node.cond, subs, shadow),
          children: substituteNodes(node.children, subs, shadow, errors),
          else: substituteNodes(node.else, subs, shadow, errors),
        };
      case 'For': {
        const innerShadow = new Set(shadow);
        innerShadow.add(node.item);
        return {
          ...node,
          iterable: substituteExpr(node.iterable, subs, shadow),
          children: substituteNodes(node.children, subs, innerShadow, errors),
        };
      }
      case 'Component':
        // Nested instance: its prop expressions live in the caller scope.
        return {
          ...node,
          props: Object.fromEntries(
            Object.entries(node.props ?? {}).map(([k, e]) => [k, substituteExpr(e, subs, shadow)])
          ),
        };
      default: {
        const out = { ...node };
        if (node.onClick) out.onClick = substituteStmts(node.onClick, subs, shadow, [], errors);
        if (node.onChange) out.onChange = substituteStmts(node.onChange, subs, shadow, [], errors);
        const props = { ...(node.props ?? {}) };
        for (const k of Object.keys(props)) {
          const v = props[k];
          if (Array.isArray(v)) {
            // Interpolation parts (e.g. Text value / Button text)
            props[k] = v.map((p) => (p && p.expr ? { ...p, expr: substituteExpr(p.expr, subs, shadow) } : p));
          } else if (k === 'id' && typeof v === 'string') {
            props[k] = mangle(v, subs.id);
          } else if (k === 'bind' && typeof v === 'string' && !shadow.has(v) && subs.locals.has(v)) {
            props[k] = subs.locals.get(v);
          }
        }
        out.props = props;
        if (node.children) out.children = substituteNodes(node.children, subs, shadow, errors);
        return out;
      }
    }
  }

  function substituteFn(fn, subs, shadow, errors) {
    const name = !shadow.has(fn.name) && subs.locals.has(fn.name) ? subs.locals.get(fn.name) : fn.name;
    const innerShadow = new Set(shadow);
    for (const p of fn.params ?? []) innerShadow.add(p.name);
    return { ...fn, name, body: substituteStmts(fn.body, subs, innerShadow, [], errors) };
  }

  // -------------------------------------------------------------------------
  // Instantiation
  // -------------------------------------------------------------------------
  function instantiate(node, stack) {
    const def = compMap.get(node.name);
    if (!def) {
      errors.push(err(`unknown component "${node.name}"`, node.loc));
      return null;
    }
    if (stack.includes(node.name)) {
      errors.push(err(`circular component reference: ${[...stack, node.name].join(' → ')}`, node.loc));
      return null;
    }

    const id = `c${uid++}`;
    const locals = new Map();
    for (const k of Object.keys(def.states ?? {})) locals.set(k, mangle(k, id));
    for (const k of Object.keys(def.derived ?? {})) locals.set(k, mangle(k, id));
    for (const f of def.fns ?? []) locals.set(f.name, mangle(f.name, id));

    const subs = { id, params: new Map(), locals };
    for (const p of def.params ?? []) {
      const pe = node.props[p.name];
      if (pe === undefined) {
        errors.push(err(`component "${node.name}" requires prop "${p.name}"`, node.loc));
        return null;
      }
      subs.params.set(p.name, pe);
    }
    for (const k of Object.keys(node.props ?? {})) {
      if (!(def.params ?? []).some((p) => p.name === k)) {
        errors.push(err(`unknown prop "${k}" on component "${node.name}"`, node.loc));
      }
    }

    // Component-local state/derived initialisers join the program (mangled).
    for (const [name, { expr, loc }] of Object.entries(def.states ?? {})) {
      state[mangle(name, id)] = { expr: substituteExpr(expr, subs, new Set()), loc };
    }
    for (const [name, { expr, loc }] of Object.entries(def.derived ?? {})) {
      derived[mangle(name, id)] = { expr: substituteExpr(expr, subs, new Set()), loc };
    }
    for (const fn of def.fns ?? []) {
      fns.push(substituteFn(fn, subs, new Set(), errors));
    }

    const body = substituteNodes(def.children ?? [], subs, new Set(), errors);
    return walkChildren(body, [...stack, node.name], []);
  }

  // -------------------------------------------------------------------------
  // Tree walk
  // -------------------------------------------------------------------------
  function walkChildren(children, stack, into) {
    for (const child of children ?? []) {
      if (!child) continue;
      if (child.type === 'Component') {
        const expanded = instantiate(child, stack);
        if (expanded) into.push(...expanded);
      } else if (child.type === 'If') {
        into.push({
          ...child,
          children: walkChildren(child.children, stack, []),
          else: walkChildren(child.else, stack, []),
        });
      } else if (child.type === 'For') {
        into.push({ ...child, children: walkChildren(child.children, stack, []) });
      } else if (child.children) {
        into.push({ ...child, children: walkChildren(child.children, stack, []) });
      } else {
        into.push(child);
      }
    }
    return into;
  }

  const ui = { ...program.ui, children: walkChildren(program.ui.children ?? [], [], []) };

  return {
    program: { ...program, state, derived, fns, ui },
    errors,
  };
}

// ---------------------------------------------------------------------------
// Derived dependency ordering
// ---------------------------------------------------------------------------

function collectVars(expr, out) {
  if (!expr) return;
  switch (expr.type) {
    case 'Var':
      out.add(expr.name);
      break;
    case 'Str':
      for (const p of expr.parts ?? []) if (p.expr) collectVars(p.expr, out);
      break;
    case 'Array':
      for (const i of expr.items ?? []) collectVars(i, out);
      break;
    case 'Unary':
      collectVars(expr.operand, out);
      break;
    case 'Binary':
      collectVars(expr.left, out);
      collectVars(expr.right, out);
      break;
    case 'Call':
      for (const a of expr.args ?? []) collectVars(a, out);
      break;
    default:
      break;
  }
}

/**
 * Topologically sort `derived` by their real dependencies (only derived→derived
 * edges matter; state is always computed first). Rewrites `program.derivedOrder`
 * and returns errors for cycles.
 */
export function sortDerived(program) {
  const errors = [];
  const derived = program.derived ?? {};
  const names = new Set(Object.keys(derived));
  if (names.size === 0) return errors;

  const graph = new Map();
  for (const [name, entry] of Object.entries(derived)) {
    const deps = new Set();
    collectVars(entry.expr, deps);
    graph.set(name, { deps, loc: entry.loc });
  }

  const order = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(name) {
    if (visited.has(name)) return true;
    if (visiting.has(name)) return false; // cycle
    visiting.add(name);
    for (const d of graph.get(name).deps) {
      if (!names.has(d)) continue;
      if (!visit(d)) return false;
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
    return true;
  }

  for (const name of names) {
    if (!visit(name)) {
      errors.push(
        err(`circular derived dependency detected (cycle through "${name}")`, graph.get(name).loc)
      );
      break;
    }
  }

  if (errors.length === 0) program.derivedOrder = order;
  return errors;
}
