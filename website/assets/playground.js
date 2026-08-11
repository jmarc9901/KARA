/**
 * KARA static playground — compiles, interprets and renders .kara entirely in
 * the browser using the bundled `Kara` global (assets/kara.js).
 * Zero dependencies.
 */
(function () {
  'use strict';

  const { compile, COMPONENT_SCHEMA, BUILTIN_NAMES, evalInitialState, computeDerived, runHandler } = window.Kara;

  // -------------------------------------------------------------------------
  // Presets
  // -------------------------------------------------------------------------
  // NOTE: `${` inside the KARA source strings is escaped as \${ so the JS
  // template literal keeps it verbatim — KARA interpolation stays in KARA.
  const PRESETS = {
    contador: `App {
  title: "Counter"
  size: (360, 420)

  state count = 0
  derived even = count % 2 == 0

  Column {
    padding: 20
    spacing: 14
    Text { value: "Value: \${count}" fontSize: 26 bold: true }
    if (even) {
      Text { value: "Even" color: "#28c840" }
    } else {
      Text { value: "Odd" color: "#ff6369" }
    }
    Button { id: "inc" text: "Increment" onClick: count = count + 1 }
    Button { id: "dec" text: "Decrement" variant: "secondary" onClick: count = count - 1 }
    Button { id: "reset" text: "Reset" variant: "ghost" onClick: count = 0 }
  }
}`,
    formulario: `App {
  title: "Form"
  size: (400, 560)
  theme: "dark"

  state name = "KARA"
  state ok = false
  state level = 3
  state role = "dev"
  derived greeting = "Hello, " + name + "!"
  derived levelLabel = "Level: " + level
  derived roleLabel = "Role: " + role

  Column {
    padding: 20
    spacing: 14
    TextInput { id: "nameInput" bind: name label: "Name" placeholder: "Enter your name" }
    Select { id: "role" bind: role label: "Role" options: ["dev", "design", "pm"] }
    Slider { id: "level" bind: level label: "Level" min: 1 max: 10 }
    Checkbox { id: "agree" bind: ok label: "I agree to the terms" }
    if (ok) {
      Text { value: "\${greeting} · \${roleLabel} · \${levelLabel}" fontSize: 16 bold: true color: "#6c8bff" }
    } else {
      Text { value: "Check the box to say hello" color: "#8b95ab" }
    }
    Button { id: "go" text: "Greet" variant: "secondary" onClick: Alert(greeting) }
  }
}`,
    lista: `App {
  title: "Reactive list"
  size: (380, 520)

  state items = ["Study KARA", "Write docs", "Publish example"]
  state newTask = ""
  derived total = Length(items)

  Column {
    padding: 20
    spacing: 12
    Text { value: "Tasks (\${total})" fontSize: 20 bold: true }
    for (item in items) {
      Text { value: "• \${item}" }
    }
    if (total == 0) {
      Text { value: "No tasks 🎉" color: "#28c840" }
    }
    TextInput { id: "newInput" bind: newTask placeholder: "New task" }
    Button {
      id: "add"
      text: "Add"
      onClick: {
        if (Length(newTask) > 0) {
          items = Push(items, newTask)
          newTask = ""
        }
      }
    }
    Button { id: "clear" text: "Clear all" variant: "ghost" onClick: items = [] }
  }
}`,
    componentes: `App {
  title: "Components"
  size: (400, 520)

  component Item(title, initial) {
    state n = initial
    derived double = n * 2
    fn next() { return n + 1 }

    Column {
      padding: 14
      spacing: 8
      Text { value: "🎯 \${title}" bold: true fontSize: 17 }
      Text { value: "n = \${n} · double = \${double}" }
      Button { id: "plus" text: "+1" variant: "secondary" onClick: n = next() }
    }
  }

  state extra = 10

  Column {
    padding: 20
    spacing: 14
    Text { value: "Each card keeps its own state" color: "#8b95ab" fontSize: 14 }
    Item { title: "Card A", initial: 1 }
    Item { title: "Card B", initial: extra }
  }
}`,
    tareas: `App {
  title: "Todos"
  size: (380, 520)

  state newTask = ""
  state tasks = ["Learn the compiler", "Publish on npm", "Record the demo"]
  state minLen = 0

  fn add() {
    tasks = Push(tasks, newTask)
    newTask = ""
  }

  fn short(t) {
    return Length(t) <= minLen
  }

  fn count(total, t) {
    return total + 1
  }

  fn shout(t) {
    return t + "!"
  }

  derived n = Length(tasks)
  derived visible = Filter(tasks, "short")
  derived visibleCount = Reduce(visible, "count", 0)
  derived shoutList = Map(tasks, "shout")

  Column {
    padding: 20
    spacing: 12

    Text { value: "📋 \${n} tasks" fontSize: 20 bold: true }

    Row {
      spacing: 8
      TextInput { id: "newInput" bind: newTask placeholder: "New task…" }
      Button { id: "addBtn" text: "Add" onClick: add() }
    }

    Text { value: "Show tasks with ≤ \${minLen} letters" }
    Slider { id: "minSlider" bind: minLen min: 0 max: 40 }

    if (visibleCount > 0) {
      for (t in visible) {
        Text { value: "• \${t}" }
      }
    } else {
      Text { value: "(no tasks match that filter)" color: "gray" }
    }

    Text { value: "Shout: \${shoutList}" color: "gray" fontSize: 12 }
  }
}`,
  };

  const PRESET_NAMES = [
    ['contador', 'Counter'],
    ['formulario', 'Form'],
    ['lista', 'Reactive list'],
    ['componentes', 'Components'],
    ['tareas', 'Todos'],
  ];

  // -------------------------------------------------------------------------
  // Expression evaluation mirror (for rendering interpolations client-side)
  // -------------------------------------------------------------------------
  function fmt(v) {
    if (Array.isArray(v)) return v.map(fmt).join(', ');
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function truthy(v) {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v);
  }

  function evalExpr(expr, st) {
    switch (expr && expr.type) {
      case 'Int':
      case 'Float':
        return Number(expr.value);
      case 'Bool':
        return Boolean(expr.value);
      case 'Str':
        return (expr.parts || []).map((p) => (p.expr ? fmt(evalExpr(p.expr, st)) : p.text)).join('');
      case 'Array':
        return (expr.items || []).map((i) => evalExpr(i, st));
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
          case '/': return r === 0 ? NaN : l / r;
          case '%': return r === 0 ? NaN : l % r;
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

  function renderText(parts, st) {
    if (typeof parts === 'string') return parts;
    return (parts || []).map((p) => (p.expr ? fmt(evalExpr(p.expr, st)) : p.text ?? '')).join('');
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const els = {
    src: document.getElementById('src'),
    mirror: document.getElementById('mirror'),
    errors: document.getElementById('pg-errors'),
    status: document.getElementById('pg-status'),
    tabs: document.querySelectorAll('.pg-tabs button'),
    pane: document.getElementById('pg-pane'),
    preset: document.getElementById('pg-preset'),
  };

  let source = PRESETS.contador;
  let program = null;
  let errors = [];
  let state = {};
  let logs = [];
  let alertMsg = null;
  let tab = 'preview';
  let timer = null;
  let lastFocused = null; // { id, selectionStart } to restore after re-render

  const ctx = {
    onLog: (line) => { logs = [...logs, String(line)]; if (tab === 'console') renderPane(); },
    onAlert: (m) => { alertMsg = m; renderAlert(); },
    onUnknownCall: (n) => logs = [...logs, `[playground] "${n}" is not available in the browser — run with kara dev`],
  };

  // -------------------------------------------------------------------------
  // Compile
  // -------------------------------------------------------------------------
  function compileNow() {
    const res = compile(source);
    if (res.ok) {
      program = res.program;
      errors = [];
      state = evalInitialState(program);
    } else {
      program = null;
      errors = res.errors;
      state = {};
    }
    renderAll();
  }

  function scheduleCompile() {
    clearTimeout(timer);
    timer = setTimeout(compileNow, 250);
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  function onEvent(name, extra) {
    if (!program) return;
    const node = findWidget(program.ui, extra.nodeId);
    if (!node) return;
    const bind = node.props && node.props.bind;

    try {
      if (name === 'click' && node.type === 'Button' && node.onClick) {
        runHandler(program, node.onClick, state, ctx);
      } else if (name === 'input' && bind) {
        state = { ...state, [bind]: String(extra.value ?? '') };
        if (node.onChange) runHandler(program, node.onChange, state, ctx);
      } else if (name === 'toggle' && bind) {
        state = { ...state, [bind]: Boolean(extra.checked) };
        if (node.onChange) runHandler(program, node.onChange, state, ctx);
      } else if (name === 'select' && bind) {
        state = { ...state, [bind]: String(extra.value ?? '') };
        if (node.onChange) runHandler(program, node.onChange, state, ctx);
      } else if (name === 'slider' && bind) {
        state = { ...state, [bind]: Number(extra.value) };
        if (node.onChange) runHandler(program, node.onChange, state, ctx);
      } else {
        return;
      }
      state = { ...state, ...computeDerived(program, state) };
      renderAll();
    } catch (e) {
      const loc = e && e.__karaLoc;
      logs = [...logs, `[runtime] ${String(e.message || e)}${loc ? ` (line ${loc.line}, col ${loc.col})` : ''}`];
      if (tab === 'console') renderPane();
    }
  }

  function findWidget(node, id) {
    if (!node) return null;
    if (node.props && node.props.id === id) return node;
    for (const child of node.children || []) {
      const found = findWidget(child, id);
      if (found) return found;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderAll() {
    renderMirror();
    renderStatus();
    renderErrors();
    renderPane();
  }

  function renderMirror() {
    els.mirror.innerHTML = window.highlightKara(source);
  }

  function renderStatus() {
    const s = els.status;
    s.className = 'pg-status';
    if (errors.length) {
      s.textContent = `${errors.length} error(s)`;
      s.classList.add('err');
    } else if (program) {
      s.textContent = '✓ compiles';
      s.classList.add('ok');
    } else {
      s.textContent = 'waiting…';
    }
  }

  function renderErrors() {
    els.errors.innerHTML = '';
    for (const e of errors) {
      const row = document.createElement('div');
      row.className = 'pg-error';
      const kind = document.createElement('code');
      kind.className = 'kind';
      kind.textContent = e.kind;
      const msg = document.createElement('span');
      msg.className = 'msg';
      msg.textContent = e.message;
      const loc = document.createElement('span');
      loc.className = 'loc';
      loc.textContent = `line ${e.line}, col ${e.col}`;
      row.append(kind, msg, loc);
      els.errors.appendChild(row);
    }
  }

  function renderPane() {
    const pane = els.pane;
    pane.innerHTML = '';

    if (tab === 'preview') return renderPreview(pane);
    if (tab === 'console') return renderConsole(pane);
    if (tab === 'ast') return renderAst(pane);
    if (tab === 'ref') return renderRef(pane);
  }

  function renderPreview(pane) {
    if (!program) {
      const p = document.createElement('div');
      p.className = 'placeholder';
      p.textContent = 'Fix the errors to see the preview.';
      pane.appendChild(p);
      return;
    }

    const frame = document.createElement('div');
    frame.className = `pg-frame ${program.theme === 'dark' ? 'dark' : 'light'}`;

    const title = document.createElement('div');
    title.className = 'pg-frame-title';
    title.textContent = program.title || 'KARA';
    frame.appendChild(title);

    const body = document.createElement('div');
    body.className = 'pg-frame-body';
    for (const node of program.ui.children || []) renderNode(node, state, body);
    frame.appendChild(body);
    pane.appendChild(frame);

    const hint = document.createElement('div');
    hint.className = 'pg-hint';
    hint.textContent = 'Buttons run the logic with the interpreter — no server needed.';
    pane.appendChild(hint);

    restoreFocus();
  }

  function renderNode(node, st, parent) {
    if (!node) return;
    switch (node.type) {
      case 'Column':
      case 'Row': {
        const div = document.createElement('div');
        div.className = 'k-container';
        div.style.flexDirection = node.type === 'Row' ? 'row' : 'column';
        const p = node.props || {};
        if (p.spacing != null) div.style.gap = `${p.spacing}px`;
        if (p.padding != null) div.style.padding = `${p.padding}px`;
        for (const child of node.children || []) renderNode(child, st, div);
        parent.appendChild(div);
        break;
      }
      case 'If': {
        if (truthy(evalExpr(node.cond, st))) {
          for (const child of node.children || []) renderNode(child, st, parent);
        } else {
          for (const child of node.else || []) renderNode(child, st, parent);
        }
        break;
      }
      case 'For': {
        const iterable = evalExpr(node.iterable, st);
        if (Array.isArray(iterable)) {
          for (const value of iterable) {
            const scope = { ...st, [node.item]: value };
            for (const child of node.children || []) renderNode(child, scope, parent);
          }
        }
        break;
      }
      case 'Text': {
        const div = document.createElement('div');
        div.className = 'k-text';
        const p = node.props || {};
        div.textContent = renderText(p.value, st);
        if (p.fontSize != null) div.style.fontSize = `${p.fontSize}px`;
        if (p.color) div.style.color = p.color;
        if (p.bold) div.style.fontWeight = '700';
        if (p.align) div.style.textAlign = p.align;
        parent.appendChild(div);
        break;
      }
      case 'Button': {
        const btn = document.createElement('button');
        btn.className = `k-btn k-btn-${(node.props && node.props.variant) || 'primary'}`;
        btn.textContent = renderText(node.props && node.props.text, st);
        if (node.props && node.props.color) {
          btn.style.backgroundColor = node.props.color;
          btn.style.borderColor = node.props.color;
        }
        btn.addEventListener('click', () => onEvent('click', { nodeId: node.props && node.props.id }));
        parent.appendChild(btn);
        break;
      }
      case 'TextInput': {
        const p = node.props || {};
        const label = document.createElement('label');
        label.className = 'k-field';
        if (p.label) {
          const l = document.createElement('span');
          l.className = 'k-field-label';
          l.textContent = renderText(p.label, st);
          label.appendChild(l);
        }
        const input = document.createElement('input');
        input.className = 'k-input';
        input.type = p.type === 'password' ? 'password' : 'text';
        input.placeholder = p.placeholder ? renderText(p.placeholder, st) : '';
        input.value = p.bind ? st[p.bind] ?? '' : '';
        if (p.bind) input.dataset.nid = p.bind;
        input.addEventListener('input', () => {
          lastFocused = { id: p.bind, caret: input.selectionStart };
          onEvent('input', { nodeId: p.id, value: input.value });
        });
        label.appendChild(input);
        parent.appendChild(label);
        break;
      }
      case 'Checkbox': {
        const p = node.props || {};
        const label = document.createElement('label');
        label.className = 'k-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = p.bind ? Boolean(st[p.bind]) : false;
        input.addEventListener('change', () => onEvent('toggle', { nodeId: p.id, checked: input.checked }));
        label.appendChild(input);
        if (p.label) label.appendChild(document.createTextNode(renderText(p.label, st)));
        parent.appendChild(label);
        break;
      }
      case 'Select': {
        const p = node.props || {};
        const label = document.createElement('label');
        label.className = 'k-field';
        if (p.label) {
          const l = document.createElement('span');
          l.className = 'k-field-label';
          l.textContent = renderText(p.label, st);
          label.appendChild(l);
        }
        const select = document.createElement('select');
        select.className = 'k-select';
        for (const opt of p.options || []) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          select.appendChild(o);
        }
        select.value = p.bind ? st[p.bind] ?? '' : '';
        select.addEventListener('change', () => onEvent('select', { nodeId: p.id, value: select.value }));
        label.appendChild(select);
        parent.appendChild(label);
        break;
      }
      case 'Slider': {
        const p = node.props || {};
        const label = document.createElement('label');
        label.className = 'k-field';
        if (p.label) {
          const l = document.createElement('span');
          l.className = 'k-field-label';
          l.textContent = renderText(p.label, st);
          label.appendChild(l);
        }
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'k-slider';
        input.min = p.min ?? 0;
        input.max = p.max ?? 100;
        input.step = p.step ?? 1;
        input.value = p.bind ? Number(st[p.bind] ?? 0) : 0;
        input.addEventListener('input', () => onEvent('slider', { nodeId: p.id, value: input.value }));
        label.appendChild(input);
        parent.appendChild(label);
        break;
      }
      case 'Image': {
        const p = node.props || {};
        const img = document.createElement('img');
        img.className = 'k-img';
        img.src = p.src;
        img.alt = '';
        if (p.width) img.style.width = `${p.width}px`;
        if (p.height) img.style.height = `${p.height}px`;
        parent.appendChild(img);
        break;
      }
    }
  }

  function restoreFocus() {
    if (!lastFocused) return;
    const el = document.querySelector(`[data-nid="${CSS.escape(lastFocused.id)}"]`);
    if (el) {
      el.focus();
      el.setSelectionRange(lastFocused.caret, lastFocused.caret);
    }
    lastFocused = null;
  }

  function renderConsole(pane) {
    const wrap = document.createElement('div');
    wrap.className = 'pg-console';
    if (logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pg-log-empty';
      empty.textContent = 'No output yet (use Print, Log or Alert).';
      wrap.appendChild(empty);
    }
    for (const line of logs) {
      const div = document.createElement('div');
      div.className = 'pg-log';
      div.textContent = line;
      wrap.appendChild(div);
    }
    pane.appendChild(wrap);
  }

  function renderAst(pane) {
    if (!program) {
      const p = document.createElement('div');
      p.className = 'placeholder';
      p.textContent = 'No AST.';
      pane.appendChild(p);
      return;
    }
    const pre = document.createElement('pre');
    pre.className = 'pg-ast';
    pre.textContent = JSON.stringify(program, null, 2);
    pane.appendChild(pre);
  }

  function renderRef(pane) {
    const ref = document.createElement('div');
    ref.className = 'pg-ref';

    const h4 = (t) => {
      const h = document.createElement('h4');
      h.textContent = t;
      ref.appendChild(h);
    };

    h4('Widgets');
    for (const [name, schema] of Object.entries(COMPONENT_SCHEMA)) {
      const comp = document.createElement('div');
      comp.className = 'pg-ref-comp';
      const code = document.createElement('code');
      code.textContent = name;
      const kind = document.createElement('span');
      kind.className = 'pg-ref-kind';
      kind.textContent = schema.kind === 'container' ? 'container' : 'leaf';
      comp.append(code, kind);

      const props = document.createElement('div');
      props.className = 'pg-ref-props';
      for (const [prop, def] of Object.entries(schema.props)) {
        const chip = document.createElement('span');
        chip.className = 'pg-ref-prop';
        const label = document.createElement('code');
        label.textContent = prop;
        const type = document.createElement('span');
        type.className = 'type';
        type.textContent = def.type === 'strEnum' ? `enum: ${def.allowed.join(' | ')}` : def.type === 'strArray' ? 'string[]' : def.type;
        chip.append(label, type);
        if (def.required) {
          const req = document.createElement('span');
          req.className = 'req';
          req.textContent = 'required';
          chip.appendChild(req);
        }
        props.appendChild(chip);
      }
      comp.appendChild(props);
      ref.appendChild(comp);
    }

    h4('Builtins');
    const builtins = document.createElement('div');
    builtins.className = 'pg-ref-props';
    for (const b of BUILTIN_NAMES) {
      const chip = document.createElement('span');
      chip.className = 'pg-ref-builtin';
      chip.textContent = `${b}()`;
      builtins.appendChild(chip);
    }
    ref.appendChild(builtins);

    h4('Keywords');
    const kws = document.createElement('div');
    kws.className = 'pg-ref-props';
    for (const k of ['App', 'component', 'fn', 'let', 'state', 'derived', 'if', 'else', 'while', 'for', 'in', 'return', 'import', 'true', 'false']) {
      const chip = document.createElement('span');
      chip.className = 'pg-ref-builtin';
      chip.textContent = k;
      kws.appendChild(chip);
    }
    ref.appendChild(kws);

    pane.appendChild(ref);
  }

  function renderAlert() {
    let overlay = document.getElementById('pg-alert');
    if (alertMsg === null) {
      if (overlay) overlay.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pg-alert';
      overlay.className = 'pg-alert';
      overlay.addEventListener('click', () => { alertMsg = null; renderAlert(); });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'pg-alert-card';
    const h = document.createElement('h3');
    h.textContent = 'KARA';
    const p = document.createElement('p');
    p.textContent = alertMsg;
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'OK';
    btn.addEventListener('click', () => { alertMsg = null; renderAlert(); });
    card.append(h, p, btn);
    overlay.appendChild(card);
  }

  // -------------------------------------------------------------------------
  // Editor wiring
  // -------------------------------------------------------------------------
  function applyPreset(name) {
    if (PRESETS[name]) source = PRESETS[name];
    els.src.value = source;
    lastFocused = null;
    logs = [];
    compileNow();
  }

  function init() {
    // preset selector
    if (els.preset) {
      for (const [value, label] of PRESET_NAMES) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        els.preset.appendChild(opt);
      }
      els.preset.addEventListener('change', () => applyPreset(els.preset.value));
    }

    // hash → preset (examples page links here)
    const hash = (location.hash || '').replace('#', '');
    if (PRESETS[hash]) {
      source = PRESETS[hash];
      if (els.preset) els.preset.value = hash;
    }

    els.src.value = source;

    // editor mirror: input + scroll sync
    els.src.addEventListener('input', () => {
      source = els.src.value;
      renderMirror();
      scheduleCompile();
    });
    els.src.addEventListener('scroll', () => {
      els.mirror.scrollTop = els.src.scrollTop;
      els.mirror.scrollLeft = els.src.scrollLeft;
    });

    // tabs
    els.tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        els.tabs.forEach((b) => b.classList.toggle('active', b === btn));
        renderPane();
      });
    });

    // Tab key inserts two spaces
    els.src.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = els.src.selectionStart;
        els.src.value = els.src.value.slice(0, s) + '  ' + els.src.value.slice(els.src.selectionEnd);
        els.src.selectionStart = els.src.selectionEnd = s + 2;
        source = els.src.value;
        renderMirror();
        scheduleCompile();
      }
    });

    compileNow();
  }

  init();
})();
