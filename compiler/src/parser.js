/**
 * KARA parser — recursive descent over tokens produced by the lexer.
 *
 * Produces a Program JSON-compatible structure:
 *   { title, size: [w,h], theme, state: {...}, fns: [...], ui: <App node> }
 *
 * Parse errors are collected (not thrown) so the CLI/UI can show several at once.
 */

import { lex } from './lexer.js';
import { sema } from './sema.js';
import { typecheck } from './types.js';
import { expand, sortDerived } from './expand.js';

// ---------------------------------------------------------------------------
// Component schema: which props each component accepts, their types and whether
// they are required. Structural keys (children containers / onClick) are handled
// separately.
// ---------------------------------------------------------------------------
const PROP_TYPES = {
  int: (v) => v.kind === 'int',
  float: (v) => v.kind === 'float' || v.kind === 'int',
  num: (v) => v.kind === 'float' || v.kind === 'int',
  str: (v) => v.kind === 'str',
  bool: (v) => v.kind === 'bool',
  strEnum: (v, allowed) => v.kind === 'str' && allowed.includes(v.value),
};

const LAYOUT_PROPS = {
  spacing: { type: 'num', label: 'spacing' },
  padding: { type: 'num', label: 'padding' },
  align: { type: 'strEnum', allowed: ['start', 'center', 'end', 'stretch'], label: 'align' },
};

export const COMPONENT_SCHEMA = {
  Column: { kind: 'container', props: { ...LAYOUT_PROPS } },
  Row: { kind: 'container', props: { ...LAYOUT_PROPS } },
  Text: {
    kind: 'leaf',
    props: {
      value: { type: 'str', label: 'value', required: true },
      fontSize: { type: 'num', label: 'fontSize' },
      color: { type: 'str', label: 'color' },
      bold: { type: 'bool', label: 'bold' },
      align: { type: 'strEnum', allowed: ['left', 'center', 'right'], label: 'align' },
    },
  },
  Button: {
    kind: 'leaf',
    props: {
      id: { type: 'str', label: 'id', required: true },
      text: { type: 'str', label: 'text', required: true },
      variant: { type: 'strEnum', allowed: ['primary', 'secondary', 'ghost'], label: 'variant' },
      color: { type: 'str', label: 'color' },
    },
  },
  TextInput: {
    kind: 'leaf',
    props: {
      id: { type: 'str', label: 'id', required: true },
      bind: { type: 'str', label: 'bind' },
      placeholder: { type: 'str', label: 'placeholder' },
      label: { type: 'str', label: 'label' },
      type: { type: 'strEnum', allowed: ['text', 'password'], label: 'type' },
    },
  },
  Checkbox: {
    kind: 'leaf',
    props: {
      id: { type: 'str', label: 'id', required: true },
      bind: { type: 'str', label: 'bind' },
      label: { type: 'str', label: 'label' },
    },
  },
  Select: {
    kind: 'leaf',
    props: {
      id: { type: 'str', label: 'id', required: true },
      bind: { type: 'str', label: 'bind' },
      label: { type: 'str', label: 'label' },
      options: { type: 'strArray', label: 'options', required: true },
    },
  },
  Slider: {
    kind: 'leaf',
    props: {
      id: { type: 'str', label: 'id', required: true },
      bind: { type: 'str', label: 'bind' },
      label: { type: 'str', label: 'label' },
      min: { type: 'num', label: 'min' },
      max: { type: 'num', label: 'max' },
      step: { type: 'num', label: 'step' },
    },
  },
  Image: {
    kind: 'leaf',
    props: {
      src: { type: 'str', label: 'src', required: true },
      width: { type: 'num', label: 'width' },
      height: { type: 'num', label: 'height' },
    },
  },
};

const COMPONENT_NAMES = new Set(Object.keys(COMPONENT_SCHEMA));
const CONTAINER_NAMES = new Set(
  Object.entries(COMPONENT_SCHEMA).filter(([, s]) => s.kind === 'container').map(([n]) => n)
);

export const BUILTIN_NAMES = ['Print', 'Alert', 'Random', 'Now', 'Length', 'Push', 'Log', 'File.Read', 'File.Write'];
const BUILTINS = new Set(BUILTIN_NAMES);

function err(message, tok) {
  return {
    kind: 'ParseError',
    message,
    line: tok?.loc?.line ?? 0,
    col: tok?.loc?.col ?? 0,
    index: tok?.loc?.index ?? 0,
  };
}

export class Parser {
  constructor(source, opts = {}) {
    const { tokens, errors } = lex(source);
    this.tokens = tokens;
    this.lexErrors = errors;
    this.pos = 0;
    this.errors = [...errors];
    // Module/import support: an optional resolver turns an import spec into
    // { source, id }. `dir` is the directory of the current file (used for
    // resolving relative imports); `importedIds` is shared across the import
    // tree so cycles and duplicate imports are skipped.
    this.resolveImport = opts.resolveImport ?? null;
    this.dir = opts.dir ?? null;
    this.importedIds = opts.importedIds ?? new Set();
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  next() {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return t;
  }

  atPunct(p) {
    const t = this.peek();
    return t.kind === 'punct' && t.value === p;
  }

  atKeyword(k) {
    const t = this.peek();
    return t.kind === 'keyword' && t.value === k;
  }

  atIdent() {
    return this.peek().kind === 'ident';
  }

  eatPunct(p) {
    if (this.atPunct(p)) return this.next();
    this.error(`expected "${p}"`, this.peek());
    return null;
  }

  eatKeyword(k) {
    if (this.atKeyword(k)) return this.next();
    this.error(`expected "${k}"`, this.peek());
    return null;
  }

  error(message, tok = this.peek()) {
    this.errors.push(err(message, tok));
    return null;
  }

  /** Skip to the next token that could start a statement/component — error recovery. */
  recover() {
    while (!this.atEnd()) {
      const t = this.peek();
      if (
        t.kind === 'eof' ||
        (t.kind === 'punct' && (t.value === '}' || t.value === ';')) ||
        (t.kind === 'ident' && COMPONENT_NAMES.has(t.value)) ||
        (t.kind === 'keyword' && ['let', 'state', 'derived', 'fn', 'if', 'while', 'for', 'return'].includes(t.value))
      ) {
        if (t.kind === 'punct' && t.value === ';') this.next();
        return;
      }
      this.next();
    }
  }

  atEnd() {
    return this.peek().kind === 'eof';
  }

  // =========================================================================
  // Program
  // =========================================================================
  parseProgram() {
    // Leading `import "..."` statements merge component/fn definitions from
    // other .kara files before the App block is parsed.
    const imports = [];
    while (this.atKeyword('import')) {
      const imp = this.parseImport();
      if (imp) imports.push(imp);
    }

    if (this.atKeyword('App')) {
      this.next();
    } else {
      this.error('a KARA program must start with "App {"', this.peek());
    }
    this.eatPunct('{');

    const program = {
      title: null,
      size: null,
      theme: 'light',
      state: {},
      derived: {},
      fns: [],
      components: [],
      imports: [],
      ui: { type: 'App', children: [] },
    };

    // Merge imported definitions (dedupe by name; imports themselves are
    // already deduped/cycle-safe via the shared importedIds set).
    for (const imp of imports) {
      program.imports.push({ spec: imp.spec, id: imp.id });
      for (const c of imp.components) {
        if (program.components.some((x) => x.name === c.name)) {
          this.error(`duplicate component "${c.name}" (already defined or imported)`, c.loc ?? this.peek());
          continue;
        }
        program.components.push(c);
      }
      for (const f of imp.fns) {
        if (program.fns.some((x) => x.name === f.name)) {
          this.error(`duplicate function "${f.name}" (already defined or imported)`, f.loc ?? this.peek());
          continue;
        }
        program.fns.push(f);
      }
    }

    const seenProps = new Set();

    while (!this.atPunct('}')) {
      if (this.atEnd()) {
        this.error('unexpected end of file: missing closing "}" for App');
        break;
      }
      const tok = this.peek();

      if (tok.kind === 'keyword' && (tok.value === 'if' || tok.value === 'for')) {
        const node = this.parseUINode();
        if (node) program.ui.children.push(node);
        continue;
      }

      if (tok.kind === 'ident' && COMPONENT_NAMES.has(tok.value)) {
        const node = this.parseComponent();
        if (node) program.ui.children.push(node);
        continue;
      }

      // Custom component instance: Name followed by "{"
      if (tok.kind === 'ident' && this.peek(1).kind === 'punct' && this.peek(1).value === '{') {
        const node = this.parseCustomComponent();
        if (node) program.ui.children.push(node);
        continue;
      }

      if (tok.kind !== 'ident' && tok.kind !== 'keyword') {
        this.error(`unexpected token "${tok.value}" in App block`, tok);
        this.recover();
        continue;
      }

      const key = tok.value;
      this.next();

      if (key === 'title' || key === 'theme') {
        if (seenProps.has(key)) this.error(`duplicate App property "${key}"`, tok);
        seenProps.add(key);
        this.eatPunct(':');
        const v = this.parseValue();
        if (v?.kind === 'str') {
          if (key === 'title') program.title = this.interpPartsToPlain(v.value, v);
          else {
            const theme = v.value;
            if (theme === 'light' || theme === 'dark') program.theme = theme;
            else this.error('theme must be "light" or "dark"', tok);
          }
        } else {
          this.error(`App.${key} must be a string`, tok);
        }
      } else if (key === 'size') {
        if (seenProps.has('size')) this.error('duplicate App property "size"', tok);
        seenProps.add('size');
        this.eatPunct(':');
        this.eatPunct('(');
        const w = this.parseValue();
        this.eatPunct(',');
        const h = this.parseValue();
        this.eatPunct(')');
        if (w?.kind === 'int' && h?.kind === 'int') program.size = [w.value, h.value];
        else this.error('size must be (width: Int, height: Int)', tok);
      } else if (key === 'state') {
        const nameTok = this.next();
        if (nameTok.kind !== 'ident') { this.error('expected a state variable name', nameTok); this.recover(); continue; }
        if (nameTok.value in program.state) this.error(`duplicate state variable "${nameTok.value}"`, nameTok);
        this.eatPunct('=');
        const expr = this.parseExpr();
        if (expr) {
          program.state[nameTok.value] = { expr, loc: { line: nameTok.loc.line, col: nameTok.loc.col } };
        } else {
          this.recover();
        }
      } else if (key === 'derived') {
        const nameTok = this.next();
        if (nameTok.kind !== 'ident') { this.error('expected a derived variable name', nameTok); this.recover(); continue; }
        if (nameTok.value in program.derived) this.error(`duplicate derived variable "${nameTok.value}"`, nameTok);
        this.eatPunct('=');
        const expr = this.parseExpr();
        if (expr) {
          program.derived[nameTok.value] = { expr, loc: { line: nameTok.loc.line, col: nameTok.loc.col } };
        } else {
          this.recover();
        }
      } else if (key === 'fn') {
        const nameTok = this.next();
        if (nameTok.kind !== 'ident') { this.error('expected a function name', nameTok); this.recover(); continue; }
        if (program.fns.some((f) => f.name === nameTok.value)) this.error(`duplicate function "${nameTok.value}"`, nameTok);
        const params = this.parseParams();
        const body = this.parseBlock();
        program.fns.push({ name: nameTok.value, params, body });
      } else if (key === 'component') {
        this.parseComponentDef(program);
      } else if (/^[A-Z]/.test(key)) {
        this.error(`unknown component "${key}"`, tok);
        this.recover();
      } else {
        this.error(`unexpected "${key}" in App block`, tok);
        this.recover();
      }
    }
    this.eatPunct('}');

    if (program.title === null) this.error('App requires a "title" property');
    if (program.size === null) this.error('App requires a "size" property');

    // Evaluate plain state literals for the initial snapshot (expression form kept
    // so the runtime can re-evaluate in dependency order).
    program.stateOrder = Object.keys(program.state);
    program.derivedOrder = Object.keys(program.derived);

    return program;
  }

  // =========================================================================
  // Imports / modules
  // =========================================================================
  /** Parse one `import "./path.kara"` statement and merge its definitions. */
  parseImport() {
    this.next(); // 'import'
    const pathTok = this.peek();
    if (pathTok.kind !== 'str') {
      this.error('import expects a string path: import "./file.kara"', pathTok);
      this.recover();
      return null;
    }
    this.next();
    const spec = pathTok.value;
    if (this.atPunct(';')) this.next();

    if (!this.resolveImport) {
      this.error(`import "${spec}" needs a file resolver (run with the KARA CLI/runtime)`, pathTok);
      return null;
    }
    const resolved = this.resolveImport(spec, this.dir ?? '.');
    if (!resolved || typeof resolved.source !== 'string') {
      this.error(`cannot resolve import "${spec}"`, pathTok);
      return null;
    }
    const id = resolved.id ?? spec;
    // Dedupe + cycle safety: the shared set spans the whole import tree.
    if (this.importedIds.has(id)) return { id, spec, components: [], fns: [] };
    this.importedIds.add(id);

    const sub = new Parser(resolved.source, {
      resolveImport: this.resolveImport,
      dir: dirnameOf(id),
      importedIds: this.importedIds,
    });
    const mod = sub.parseModule();
    if (sub.errors.length) {
      // Tag module errors with their file so tooling can point at the real
      // source (their line/col are relative to the module file, not the entry).
      for (const e of sub.errors) e.file = id;
      this.errors.push(...sub.errors);
    }
    return { id, spec, components: mod.components, fns: mod.fns };
  }

  /**
   * Parse a module file — the target of an `import`. Only `component`/`fn`
   * definitions (and nested imports) are allowed; an App/state block is an
   * error.
   */
  parseModule() {
    const mod = { components: [], fns: [] };
    while (!this.atEnd()) {
      if (this.atKeyword('import')) {
        const imp = this.parseImport();
        if (imp) {
          for (const c of imp.components) {
            if (mod.components.some((x) => x.name === c.name)) {
              this.error(`duplicate component "${c.name}" in module`);
              continue;
            }
            mod.components.push(c);
          }
          for (const f of imp.fns) {
            if (mod.fns.some((x) => x.name === f.name)) {
              this.error(`duplicate function "${f.name}" in module`);
              continue;
            }
            mod.fns.push(f);
          }
        }
        continue;
      }
      const tok = this.peek();
      if (tok.kind === 'keyword' && tok.value === 'component') {
        this.next();
        this.parseComponentDef(mod);
      } else if (tok.kind === 'keyword' && tok.value === 'fn') {
        const def = this.parseFnDef();
        if (def && !mod.fns.some((x) => x.name === def.name)) mod.fns.push(def);
        else if (def) this.error(`duplicate function "${def.name}" in module`);
      } else if (tok.kind === 'keyword' && tok.value === 'App') {
        this.error('a module file cannot contain an App block (only component/fn definitions)', tok);
        this.recoverModule();
      } else if (tok.kind === 'keyword') {
        this.error(`"${tok.value}" is not allowed in a module file (only component/fn definitions)`, tok);
        this.recoverModule();
      } else if (tok.kind === 'ident') {
        this.error(`unexpected "${tok.value}" in module file`, tok);
        this.recoverModule();
      } else {
        this.error('unexpected token in module file', tok);
        this.recoverModule();
      }
    }
    return mod;
  }

  /** Module recovery: skip tokens until the next definition keyword or EOF. */
  recoverModule() {
    while (!this.atEnd()) {
      const t = this.peek();
      if (t.kind === 'keyword' && (t.value === 'component' || t.value === 'fn' || t.value === 'import')) {
        return;
      }
      this.next();
    }
  }

  /** Parse `fn name(params) { ... }` into a definition object. */
  parseFnDef() {
    const kwTok = this.next(); // 'fn'
    const nameTok = this.next();
    if (nameTok.kind !== 'ident') {
      this.error('expected a function name', nameTok);
      this.recover();
      return null;
    }
    const params = this.parseParams();
    const body = this.parseBlock();
    return { name: nameTok.value, params, body, loc: kwTok.loc };
  }

  // =========================================================================
  // Custom components
  // =========================================================================
  /** Parse `(a, b: Type, ...)` — shared by fn and component definitions. */
  parseParams() {
    const params = [];
    this.eatPunct('(');
    while (!this.atPunct(')')) {
      if (this.atEnd()) { this.error('unexpected end of file in parameter list'); break; }
      const p = this.next();
      if (p.kind !== 'ident') { this.error('expected a parameter name', p); continue; }
      const param = { name: p.value };
      // Optional type annotation (parsed, reserved for future type checking)
      if (this.atPunct(':')) {
        this.next();
        const t = this.next();
        if (t.kind !== 'ident') this.error('expected a type name after ":"', t);
        else param.type = t.value;
      }
      if (!this.atPunct(')')) this.eatPunct(',');
      params.push(param);
    }
    this.eatPunct(')');
    return params;
  }

  /**
   * Parse a component definition: `component Name(a, b) { ... }`.
   * The body may declare state/derived/fn and UI nodes (like the App block).
   * The current token must be the component name (the keyword was consumed).
   */
  parseComponentDef(program) {
    const nameTok = this.next();
    if (nameTok.kind !== 'ident') {
      this.error('expected a component name after "component"', nameTok);
      this.recover();
      return;
    }
    const name = nameTok.value;
    if (COMPONENT_NAMES.has(name)) {
      this.error(`cannot redefine built-in component "${name}"`, nameTok);
      this.recover();
      return;
    }
    if (!/^[A-Z]/.test(name)) {
      this.error('component names must start with an uppercase letter', nameTok);
    }
    if (program.components.some((c) => c.name === name)) {
      this.error(`duplicate component "${name}"`, nameTok);
      this.recover();
      return;
    }
    const params = this.parseParams();
    const body = this.parseComponentBody();
    program.components.push({ name, params, ...body, loc: nameTok.loc });
  }

  /** Parse the body of a component: state/derived/fn declarations + UI nodes. */
  parseComponentBody() {
    const comp = { states: {}, derived: {}, fns: [], children: [] };
    this.eatPunct('{');

    while (!this.atPunct('}')) {
      if (this.atEnd()) {
        this.error('missing closing "}" for component body');
        break;
      }
      const tok = this.peek();

      if (tok.kind === 'keyword' && (tok.value === 'if' || tok.value === 'for')) {
        const node = this.parseUINode();
        if (node) comp.children.push(node);
        continue;
      }
      if (tok.kind === 'ident' && COMPONENT_NAMES.has(tok.value)) {
        const node = this.parseComponent();
        if (node) comp.children.push(node);
        continue;
      }
      if (tok.kind === 'ident' && this.peek(1).kind === 'punct' && this.peek(1).value === '{') {
        const node = this.parseCustomComponent();
        if (node) comp.children.push(node);
        continue;
      }
      if (tok.kind !== 'ident' && tok.kind !== 'keyword') {
        this.error(`unexpected token "${tok.value}" in component body`, tok);
        this.recover();
        continue;
      }

      const key = tok.value;
      this.next();

      if (key === 'state' || key === 'derived') {
        const bucket = key === 'state' ? comp.states : comp.derived;
        const nameTok = this.next();
        if (nameTok.kind !== 'ident') {
          this.error(`expected a ${key} variable name`, nameTok);
          this.recover();
          continue;
        }
        if (nameTok.value in bucket) this.error(`duplicate ${key} variable "${nameTok.value}"`, nameTok);
        this.eatPunct('=');
        const expr = this.parseExpr();
        if (expr) {
          bucket[nameTok.value] = { expr, loc: { line: nameTok.loc.line, col: nameTok.loc.col } };
        } else {
          this.recover();
        }
      } else if (key === 'fn') {
        const nameTok = this.next();
        if (nameTok.kind !== 'ident') { this.error('expected a function name', nameTok); this.recover(); continue; }
        if (comp.fns.some((f) => f.name === nameTok.value)) this.error(`duplicate function "${nameTok.value}"`, nameTok);
        const params = this.parseParams();
        const body = this.parseBlock();
        comp.fns.push({ name: nameTok.value, params, body });
      } else if (/^[A-Z]/.test(key)) {
        this.error(`unknown component "${key}"`, tok);
        this.recover();
      } else {
        this.error(`unexpected "${key}" in component body`, tok);
        this.recover();
      }
    }
    this.eatPunct('}');
    return comp;
  }

  /**
   * Parse a custom component instance: `Name { prop: <expr>, ... }`.
   * Prop values are full expressions evaluated in the caller scope.
   */
  parseCustomComponent() {
    const nameTok = this.next();
    const node = { type: 'Component', name: nameTok.value, props: {}, loc: nameTok.loc };
    const seen = new Set();

    this.eatPunct('{');
    while (!this.atPunct('}')) {
      if (this.atEnd()) {
        this.error(`missing closing "}" for ${nameTok.value}`, nameTok);
        break;
      }
      const tok = this.peek();
      if (tok.kind !== 'ident') {
        this.error(`unexpected token "${tok.value}" inside ${nameTok.value}`, tok);
        this.recover();
        continue;
      }
      const key = tok.value;
      this.next();
      if (seen.has(key)) this.error(`duplicate prop "${key}"`, tok);
      seen.add(key);
      this.eatPunct(':');
      const expr = this.parseExpr();
      if (expr === null) {
        this.recover();
        continue;
      }
      node.props[key] = expr;
      if (this.atPunct(',')) this.next();
    }
    this.eatPunct('}');
    return node;
  }

  // =========================================================================
  // Components
  // =========================================================================
  parseComponent() {
    const nameTok = this.next();
    const schema = COMPONENT_SCHEMA[nameTok.value];
    if (!schema) {
      this.error(`unknown component "${nameTok.value}"`, nameTok);
      return null;
    }

    const node = { type: nameTok.value, props: {}, children: [], loc: nameTok.loc };
    const seen = new Set();

    this.eatPunct('{');

    while (!this.atPunct('}')) {
      if (this.atEnd()) {
        this.error(`missing closing "}" for ${nameTok.value}`, nameTok);
        break;
      }
      const tok = this.peek();

      // Nested component (containers only)
      if (tok.kind === 'ident' && COMPONENT_NAMES.has(tok.value)) {
        if (schema.kind !== 'container') {
          this.error(`${nameTok.value} cannot contain components`, tok);
          this.next();
          continue;
        }
        const child = this.parseComponent();
        if (child) node.children.push(child);
        continue;
      }

      // if / for blocks in the UI tree (containers only)
      if (tok.kind === 'keyword' && (tok.value === 'if' || tok.value === 'for')) {
        if (schema.kind !== 'container') {
          this.error(`${nameTok.value} cannot contain ${tok.value} blocks`, tok);
          this.skipUINode();
          continue;
        }
        const child = this.parseUINode();
        if (child) node.children.push(child);
        continue;
      }

      // Custom component instance (name followed by "{")
      if (tok.kind === 'ident' && !COMPONENT_NAMES.has(tok.value) && this.peek(1).kind === 'punct' && this.peek(1).value === '{') {
        if (schema.kind !== 'container') {
          this.error(`${nameTok.value} cannot contain components`, tok);
          this.skipUINode();
          continue;
        }
        const child = this.parseCustomComponent();
        if (child) node.children.push(child);
        continue;
      }

      if (tok.kind !== 'ident') {
        this.error(`unexpected token "${tok.value}" inside ${nameTok.value}`, tok);
        this.recover();
        continue;
      }

      const key = tok.value;
      this.next();

      if (key === 'onClick') {
        if (nameTok.value !== 'Button') this.error('onClick is only supported on Button', tok);
        if (seen.has('onClick')) this.error('duplicate prop "onClick"', tok);
        seen.add('onClick');
        this.eatPunct(':');
        node.onClick = this.parseHandler();
        continue;
      }

      if (key === 'onChange') {
        if (!['TextInput', 'Select', 'Slider', 'Checkbox'].includes(nameTok.value)) {
          this.error('onChange is only supported on TextInput, Select, Slider and Checkbox', tok);
        }
        if (seen.has('onChange')) this.error('duplicate prop "onChange"', tok);
        seen.add('onChange');
        this.eatPunct(':');
        node.onChange = this.parseHandler();
        continue;
      }

      // `bind` accepts an unquoted state variable name: bind: name
      if (key === 'bind') {
        if (seen.has('bind')) this.error('duplicate prop "bind"', tok);
        seen.add('bind');
        this.eatPunct(':');
        const t = this.peek();
        if (t.kind === 'ident') {
          this.next();
          node.props.bind = t.value;
        } else if (t.kind === 'str') {
          this.next();
          node.props.bind = t.value;
        } else {
          this.error('"bind" expects a state variable name', t);
          this.recover();
        }
        continue;
      }

      const propDef = schema.props[key];
      if (!propDef) {
        this.error(`unknown prop "${key}" on ${nameTok.value}`, tok);
        this.recover();
        continue;
      }
      if (seen.has(key)) this.error(`duplicate prop "${key}"`, tok);
      seen.add(key);

      this.eatPunct(':');
      if (propDef.type === 'strArray') {
        if (this.atPunct('[')) {
          this.next();
          const list = [];
          while (!this.atPunct(']')) {
            if (this.atEnd()) {
              this.error('missing closing "]" for list prop', tok);
              break;
            }
            const o = this.parseValue();
            if (o?.kind === 'str') list.push(o.value);
            else this.error(`"${key}" must be a list of strings: ["a", "b"]`, tok);
            if (!this.atPunct(']')) this.eatPunct(',');
          }
          this.eatPunct(']');
          node.props[key] = list;
        } else {
          this.error(`"${key}" must be a list of strings: ["a", "b"]`, tok);
        }
        continue;
      }
      const v = this.parseValue();
      if (v === null) { this.recover(); continue; }

      if (propDef.type === 'strEnum') {
        if (propDef.allowed.includes(v.kind === 'str' ? v.value : null)) {
          node.props[key] = v.value;
        } else {
          this.error(`"${key}" must be one of: ${propDef.allowed.join(', ')}`, tok);
        }
      } else if (propDef.type === 'str') {
        if (v.kind === 'str') {
          // Only display strings (value/text) keep interpolation parts; the rest
          // (id, src, label, placeholder, color) are plain strings used verbatim.
          if (key === 'value' || key === 'text') node.props[key] = this.stringToParts(v.value, v);
          else node.props[key] = v.value;
        } else {
          this.error(`"${key}" must be a string`, tok);
        }
      } else if (propDef.type === 'bool') {
        if (v.kind === 'bool') node.props[key] = v.value;
        else this.error(`"${key}" must be true or false`, tok);
      } else if (propDef.type === 'int') {
        if (v.kind === 'int') node.props[key] = v.value;
        else this.error(`"${key}" must be an integer`, tok);
      } else if (propDef.type === 'num' || propDef.type === 'float') {
        if (v.kind === 'int' || v.kind === 'float') node.props[key] = v.value;
        else this.error(`"${key}" must be a number`, tok);
      }
    }
    this.eatPunct('}');

    // Required props
    for (const [key, def] of Object.entries(schema.props)) {
      if (def.required && !(key in node.props)) {
        this.error(`${nameTok.value} requires prop "${key}"`, nameTok);
      }
    }
    if (nameTok.value === 'Button' && !node.onClick) {
      this.error('Button requires an "onClick" handler', nameTok);
    }

    return node;
  }

  /**
   * Parse a UI node: a component or an if/for block.
   * if (cond) { … } → { type: 'If', cond, children, loc }
   * for (item in list) { … } → { type: 'For', item, iterable, children, loc }
   */
  parseUINode() {
    const tok = this.peek();

    if (tok.kind === 'keyword' && tok.value === 'if') {
      this.next();
      this.eatPunct('(');
      const cond = this.parseExpr();
      this.eatPunct(')');
      const children = this.parseUIChildren(tok);
      let els = [];
      if (this.atKeyword('else')) {
        this.next();
        els = this.parseUIChildren(tok);
      }
      return { type: 'If', cond, children, else: els, loc: tok.loc };
    }

    if (tok.kind === 'keyword' && tok.value === 'for') {
      this.next();
      this.eatPunct('(');
      const itemTok = this.next();
      if (itemTok.kind !== 'ident') { this.error('expected an item name after "for ("', itemTok); return null; }
      if (!this.atKeyword('in')) this.eatKeyword('in');
      else this.next();
      const iterable = this.parseExpr();
      this.eatPunct(')');
      const children = this.parseUIChildren(tok);
      return { type: 'For', item: itemTok.value, iterable, children, loc: tok.loc };
    }

    // Custom component instance
    if (tok.kind === 'ident' && !COMPONENT_NAMES.has(tok.value) && this.peek(1).kind === 'punct' && this.peek(1).value === '{') {
      return this.parseCustomComponent();
    }

    return this.parseComponent();
  }

  /**
   * Skip an if/for block after an error (the current token is 'if' or 'for').
   * Consumes tokens up to and including the closing '}' of the block body,
   * tracking nested braces so a recovery never loops forever.
   */
  skipUINode() {
    let depth = 0;
    let inBody = false;
    while (!this.atEnd()) {
      const t = this.next();
      if (t.kind === 'punct' && t.value === '{') {
        depth += 1;
        inBody = true;
      } else if (t.kind === 'punct' && t.value === '}') {
        if (!inBody) return;
        depth -= 1;
        if (depth === 0) return;
      }
    }
  }

  /** Children of an if/for block: components and nested if/for. */
  parseUIChildren(ownerTok) {
    this.eatPunct('{');
    const children = [];
    while (!this.atPunct('}')) {
      if (this.atEnd()) { this.error(`missing closing "}" for ${ownerTok.value} block`, ownerTok); break; }
      const node = this.parseUINode();
      if (node) children.push(node);
      else this.recover();
    }
    this.eatPunct('}');
    return children;
  }

  /** onClick: either a single statement or a { block } of statements. */
  parseHandler() {
    if (this.atPunct('{')) return this.parseBlock();
    const stmt = this.parseStatement();
    return stmt ? [stmt] : [];
  }

  // =========================================================================
  // Statements
  // =========================================================================
  parseBlock() {
    this.eatPunct('{');
    const stmts = [];
    while (!this.atPunct('}')) {
      if (this.atEnd()) { this.error('missing closing "}"'); break; }
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
      else this.recover();
      if (this.atPunct(';')) this.next();
    }
    this.eatPunct('}');
    return stmts;
  }

  parseStatement() {
    const tok = this.peek();

    if (tok.kind === 'keyword') {
      switch (tok.value) {
        case 'let': {
          this.next();
          const nameTok = this.next();
          if (nameTok.kind !== 'ident') { this.error('expected a variable name after "let"', nameTok); return null; }
          this.eatPunct('=');
          const expr = this.parseExpr();
          if (!expr) return null;
          return { type: 'Let', name: nameTok.value, expr, loc: tok.loc };
        }
        case 'if': {
          this.next();
          this.eatPunct('(');
          const cond = this.parseExpr();
          this.eatPunct(')');
          const then = this.parseBlock();
          let els = [];
          if (this.atKeyword('else')) {
            this.next();
            if (this.atKeyword('if')) {
              // else-if: desugar to nested If statement
              const nested = this.parseStatement();
              els = [{ type: 'If', cond: nested.cond, then: nested.then, else: nested.else, loc: tok.loc }];
            } else {
              els = this.parseBlock();
            }
          }
          return { type: 'If', cond, then, else: els, loc: tok.loc };
        }
        case 'while': {
          this.next();
          this.eatPunct('(');
          const cond = this.parseExpr();
          this.eatPunct(')');
          const body = this.parseBlock();
          return { type: 'While', cond, body, loc: tok.loc };
        }
        case 'for': {
          this.next();
          this.eatPunct('(');
          const itemTok = this.next();
          if (itemTok.kind !== 'ident') { this.error('expected an item name after "for ("', itemTok); return null; }
          if (!this.atKeyword('in')) this.eatKeyword('in');
          else this.next();
          const iterable = this.parseExpr();
          this.eatPunct(')');
          const body = this.parseBlock();
          return { type: 'For', item: itemTok.value, iterable, body, loc: tok.loc };
        }
        case 'return': {
          this.next();
          let expr = null;
          if (!this.atPunct('}') && !this.atPunct(';') && !this.atEnd()) {
            expr = this.parseExpr();
          }
          return { type: 'Return', expr, loc: tok.loc };
        }
        default:
          this.error(`unexpected keyword "${tok.value}"`, tok);
          this.next();
          return null;
      }
    }

    if (tok.kind === 'punct' && tok.value === '{') {
      return { type: 'Block', body: this.parseBlock(), loc: tok.loc };
    }

    // Expression statement: assignment or call
    if (tok.kind === 'ident') {
      const nxt = this.peek(1);
      if (nxt.kind === 'punct' && nxt.value === '=') {
        const target = this.next();
        this.next(); // '='
        const expr = this.parseExpr();
        if (!expr) return null;
        return { type: 'Assign', target: target.value, expr, loc: tok.loc };
      }
      if (nxt.kind === 'punct' && nxt.value === ':') {
        // `name: Type = ...` — legacy typed assignment form; treat as plain assign.
        const target = this.next();
        this.next(); // ':'
        const t = this.next();
        if (t.kind !== 'ident') this.error('expected a type name', t);
        this.eatPunct('=');
        const expr = this.parseExpr();
        if (!expr) return null;
        return { type: 'Assign', target: target.value, expr, loc: tok.loc };
      }
    }

    const expr = this.parseExpr();
    if (expr?.type === 'Call') {
      return { type: 'Call', name: expr.name, args: expr.args, loc: tok.loc };
    }
    this.error('expected a statement (assignment, call, let, if, while, for, return)', tok);
    return null;
  }

  // =========================================================================
  // Expressions — precedence climbing
  // =========================================================================
  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.atPunct('||')) { this.next(); left = bin('||', left, this.parseAnd()); }
    return left;
  }
  parseAnd() {
    let left = this.parseEq();
    while (this.atPunct('&&')) { this.next(); left = bin('&&', left, this.parseEq()); }
    return left;
  }
  parseEq() {
    let left = this.parseCmp();
    while (this.atPunct('==') || this.atPunct('!=')) { const op = this.next().value; left = bin(op, left, this.parseCmp()); }
    return left;
  }
  parseCmp() {
    let left = this.parseAdd();
    while (['<', '<=', '>', '>='].some((p) => this.atPunct(p))) { const op = this.next().value; left = bin(op, left, this.parseAdd()); }
    return left;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.atPunct('+') || this.atPunct('-')) { const op = this.next().value; left = bin(op, left, this.parseMul()); }
    return left;
  }
  parseMul() {
    let left = this.parseUnary();
    while (this.atPunct('*') || this.atPunct('/') || this.atPunct('%')) { const op = this.next().value; left = bin(op, left, this.parseUnary()); }
    return left;
  }
  parseUnary() {
    if (this.atPunct('-') || this.atPunct('!')) {
      const op = this.next().value;
      return { type: 'Unary', op, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const tok = this.peek();

    if (tok.kind === 'int') { this.next(); return { type: 'Int', value: tok.value }; }
    if (tok.kind === 'float') { this.next(); return { type: 'Float', value: tok.value }; }

    if (tok.kind === 'keyword' && (tok.value === 'true' || tok.value === 'false')) {
      this.next();
      return { type: 'Bool', value: tok.value === 'true' };
    }

    if (tok.kind === 'str') {
      this.next();
      return { type: 'Str', parts: this.interpParts(tok.value, tok) };
    }

    if (tok.kind === 'punct' && tok.value === '[') {
      this.next();
      const items = [];
      while (!this.atPunct(']')) {
        if (this.atEnd()) { this.error('missing closing "]" for array'); break; }
        const item = this.parseExpr();
        if (item) items.push(item);
        if (!this.atPunct(']')) this.eatPunct(',');
      }
      this.eatPunct(']');
      return { type: 'Array', items };
    }

    if (tok.kind === 'punct' && tok.value === '(') {
      this.next();
      const expr = this.parseExpr();
      this.eatPunct(')');
      return expr;
    }

    if (tok.kind === 'ident') {
      this.next();
      if (this.atPunct('(')) {
        this.next();
        const args = [];
        while (!this.atPunct(')')) {
          if (this.atEnd()) { this.error('missing closing ")" for call'); break; }
          const arg = this.parseExpr();
          if (arg) args.push(arg);
          if (!this.atPunct(')')) this.eatPunct(',');
        }
        this.eatPunct(')');
        return { type: 'Call', name: tok.value, args };
      }
      return { type: 'Var', name: tok.value };
    }

    this.error(`expected an expression, found "${tok.value ?? 'end of file'}"`, tok);
    return null;
  }

  // =========================================================================
  // Values & string interpolation
  // =========================================================================
  parseValue() {
    const tok = this.peek();
    if (tok.kind === 'int') { this.next(); return tok; }
    if (tok.kind === 'float') { this.next(); return tok; }
    if (tok.kind === 'str') { this.next(); return tok; }
    if (tok.kind === 'keyword' && (tok.value === 'true' || tok.value === 'false')) {
      this.next();
      return { kind: 'bool', value: tok.value === 'true', loc: tok.loc };
    }
    this.error('expected a literal value (string, number, true, false)', tok);
    return null;
  }

  /**
   * Split a raw string into interpolation parts:
   *   { parts: [{ text: 'Hola ' }, { expr: {type:'Var',...} }, { text: '!' }] }
   * A string with no interpolation yields a single text part.
   */
  interpParts(raw, strTok) {
    const parts = [];
    let rest = raw;
    let text = '';
    while (true) {
      const idx = rest.indexOf('${');
      if (idx === -1) {
        const tail = text + rest;
        if (tail !== '' || parts.length === 0) parts.push({ text: tail });
        break;
      }
      text += rest.slice(0, idx);
      // find balanced closing brace
      const after = rest.slice(idx + 2);
      let depth = 0;
      let end = -1;
      for (let j = 0; j < after.length; j += 1) {
        if (after[j] === '{') depth += 1;
        else if (after[j] === '}') {
          if (depth === 0) { end = j; break; }
          depth -= 1;
        }
      }
      if (end === -1) {
        this.error('unterminated interpolation "${" — missing "}"', strTok);
        parts.push({ text: text + rest });
        break;
      }
      const inner = after.slice(0, end);
      if (text !== '') { parts.push({ text }); text = ''; }
      const expr = this.parseInterpExpr(inner, strTok);
      parts.push({ expr });
      rest = after.slice(end + 1);
    }
    return parts;
  }

  /** Parse a small expression string from an interpolation segment. */
  parseInterpExpr(src, strTok) {
    const sub = new Parser(src);
    const expr = sub.parseExpr();
    if (!expr || sub.errors.length || sub.peek().kind !== 'eof') {
      this.error(`invalid expression inside "\${...}": "${src}"`, strTok);
      return { type: 'Str', parts: [{ text: src }] };
    }
    return expr;
  }

  interpPartsToPlain(raw, strTok) {
    // strTok is the string token the parts came from, so unterminated
    // interpolation errors point at the string itself (not the token after it).
    const parts = this.interpParts(raw, strTok ?? this.peek());
    return parts.map((p) => p.text ?? '').join('');
  }

  stringToParts(raw, strTok) {
    // Only split on ${ if the string contains a real interpolation.
    if (raw.includes('${')) return this.interpParts(raw, strTok ?? this.peek());
    return [{ text: raw }];
  }
}

function bin(op, left, right) {
  return { type: 'Binary', op, left, right };
}

/** Directory of an import id (works with both / and \\ separators). */
function dirnameOf(id) {
  const i = Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\'));
  return i === -1 ? '.' : id.slice(0, i);
}

/**
 * Compile KARA source into a program object or a list of errors.
 * @param {string} source
 * @param {{ resolveImport?: (spec: string, fromDir: string) => { source: string, id: string } | null }} [opts]
 * @returns {{ ok: true, program: object } | { ok: false, errors: object[] }}
 */
export function compile(source, opts = {}) {
  const parser = new Parser(source, opts);
  const program = parser.parseProgram();

  if (parser.errors.length) {
    return { ok: false, errors: parser.errors };
  }

  const { program: expanded, errors: expandErrors } = expand(program);
  if (expandErrors.length) {
    return { ok: false, errors: expandErrors };
  }

  const derivedErrors = sortDerived(expanded);
  if (derivedErrors.length) {
    return { ok: false, errors: derivedErrors };
  }

  const semaErrors = sema(expanded, { builtins: BUILTINS });
  if (semaErrors.length) {
    return { ok: false, errors: semaErrors };
  }

  const typeErrors = typecheck(expanded, { builtins: BUILTINS });
  if (typeErrors.length) {
    return { ok: false, errors: typeErrors };
  }

  return { ok: true, program: expanded };
}
