/**
 * Shared rendering helpers for the KARA UI.
 * These mirror the runtime interpreter for interpolation previews.
 */

export function fmt(v) {
  if (Array.isArray(v)) return v.map(fmt).join(', ');
  if (v === null || v === undefined) return '';
  return String(v);
}

export function evalExpr(expr, st) {
  switch (expr?.type) {
    case 'Int':
    case 'Float':
      return Number(expr.value);
    case 'Bool':
      return Boolean(expr.value);
    case 'Str':
      return (expr.parts ?? []).map((p) => (p.expr ? fmt(evalExpr(p.expr, st)) : p.text)).join('');
    case 'Array':
      return (expr.items ?? []).map((i) => evalExpr(i, st));
    case 'Var':
      return st[expr.name] ?? '';
    case 'Unary':
      return expr.op === '-' ? -evalExpr(expr.operand, st) : !evalExpr(expr.operand, st);
    case 'Binary': {
      if (expr.op === '&&') return evalExpr(expr.left, st) && evalExpr(expr.right, st);
      if (expr.op === '||') return evalExpr(expr.left, st) || evalExpr(expr.right, st);
      const l = evalExpr(expr.left, st);
      const r = evalExpr(expr.right, st);
      switch (expr.op) {
        case '+': return typeof l === 'string' || typeof r === 'string' ? fmt(l) + fmt(r) : l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '==': return Array.isArray(l) && Array.isArray(r) ? JSON.stringify(l) === JSON.stringify(r) : l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        default: return '';
      }
    }
    default:
      return '';
  }
}

/** Find any widget by id in the UI tree (TextInput, Checkbox…). */
export function findWidget(node, id) {
  if (!node) return null;
  if (node.props?.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findWidget(child, id);
    if (found) return found;
  }
  return null;
}

/** Truthiness mirroring the runtime interpreter (null/undefined/empty array → false). */
export function truthy(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function renderText(parts, state) {
  // Acepta tanto un array de partes (value/text) como un string plano
  // (label, placeholder, color…) emitido por el compiler.
  if (typeof parts === 'string') return parts;
  return (parts ?? []).map((p) => (p.expr ? fmt(evalExpr(p.expr, state)) : p.text)).join('');
}

export function containerStyle(node) {
  const p = node.props ?? {};
  const alignMap = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
  const style = {
    display: 'flex',
    flexDirection: node.type === 'Row' ? 'row' : 'column',
    alignItems: alignMap[p.align] ?? 'stretch',
  };
  if (p.spacing != null) style.gap = `${p.spacing}px`;
  if (p.padding != null) style.padding = `${p.padding}px`;
  return style;
}

export function textStyle(node) {
  const p = node.props ?? {};
  const style = {};
  if (p.fontSize != null) style.fontSize = `${p.fontSize}px`;
  if (p.color) style.color = p.color;
  if (p.bold) style.fontWeight = 700;
  if (p.align) style.textAlign = p.align;
  return style;
}

export function buttonClass(variant) {
  return `btn btn-${variant ?? 'primary'}`;
}
