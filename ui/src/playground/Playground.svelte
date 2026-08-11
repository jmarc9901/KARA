<script>
  import { compile, COMPONENT_SCHEMA, BUILTIN_NAMES } from '../../../compiler/src/parser.js';
  import { computeDerived, evalInitialState, runHandler } from '../../../runtime/src/interpreter.js';
  import Component from '../lib/Component.svelte';
  import { findWidget } from '../lib/kit.js';

  const PRESETS = {
    contador: `App {
  title: "Counter"
  size: (360, 420)

  state count = 0
  derived par = count % 2 == 0

  Column {
    padding: 20
    spacing: 14
    Text { value: "Value: \${count}" fontSize: 26 bold: true }
    if (par) {
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
  state nivel = 3
  state rol = "dev"
  derived saludo = "Hello, " + name + "!"
  derived nivelLabel = "Level: " + nivel
  derived rolLabel = "Role: " + rol

  Column {
    padding: 20
    spacing: 14
    TextInput { id: "nameInput" bind: name label: "Name" placeholder: "Enter your name" }
    Select { id: "rol" bind: rol label: "Role" options: ["dev", "design", "pm"] }
    Slider { id: "nivel" bind: nivel label: "Level" min: 1 max: 10 }
    Checkbox { id: "agree" bind: ok label: "I agree to the terms" }
    if (ok) {
      Text { value: "\${saludo} · \${rolLabel} · \${nivelLabel}" fontSize: 16 bold: true color: "#6c8bff" }
    } else {
      Text { value: "Check the box to say hello" color: "#8b95ab" }
    }
    Button { id: "go" text: "Greet" variant: "secondary" onClick: Alert(saludo) }
  }
}`,
    lista: `App {
  title: "Reactive list"
  size: (380, 520)

  state items = ["Study KARA", "Write docs", "Publish example"]
  state nuevo = ""
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
    TextInput { id: "newInput" bind: nuevo placeholder: "New task" }
    Button {
      id: "add"
      text: "Add"
      onClick: {
        if (Length(nuevo) > 0) {
          items = Push(items, nuevo)
          nuevo = ""
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
    derived doble = n * 2
    fn siguiente() { return n + 1 }

    Column {
      padding: 14
      spacing: 8
      Text { value: "🎯 \${title}" bold: true fontSize: 17 }
      Text { value: "n = \${n} · double = \${doble}" }
      Button { id: "plus" text: "+1" variant: "secondary" onClick: n = siguiente() }
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

  let source = PRESETS.contador;
  let presetName = 'contador';
  let program = null;
  let errors = [];
  let state = {};
  let logs = [];
  let alertMsg = null;
  let tab = 'preview'; // preview | ast | console | ref
  let astText = '';
  let compiling = false;
  let compileTimer;

  const REF = {
    components: COMPONENT_SCHEMA,
    builtins: BUILTIN_NAMES,
    keywords: ['App', 'component', 'fn', 'let', 'state', 'derived', 'if', 'else', 'while', 'for', 'in', 'return', 'import'],
  };

  function propTypeLabel(def) {
    if (def.type === 'strEnum') return `enum: ${def.allowed.join(' | ')}`;
    if (def.type === 'strArray') return 'string[]';
    return def.type;
  }

  function findLine(line, col) {
    const lines = source.split('\n');
    return { text: lines[line - 1] ?? '', line, col };
  }

  function compileNow() {
    compiling = true;
    const res = compile(source);
    if (res.ok) {
      program = res.program;
      errors = [];
      state = evalInitialState(program);
      astText = JSON.stringify(program, null, 2);
    } else {
      program = null;
      errors = res.errors;
      state = {};
      astText = '';
    }
    compiling = false;
  }

  function pushLog(line) {
    logs = [...logs, line];
  }

  const PLAY_CTX = {
    onLog: pushLog,
    onAlert: (m) => (alertMsg = m),
    onUnknownCall: (n) => pushLog(`[playground] "${n}" is not available in the browser — run with kara dev`),
  };

  function onEvent(name, extra) {
    if (!program) return;
    const node = findWidget(program.ui, extra.nodeId);
    if (!node) return;
    const bind = node.props?.bind;

    try {
      if (name === 'click' && node.type === 'Button' && node.onClick) {
        runHandler(program, node.onClick, state, PLAY_CTX);
      } else if (name === 'input' && bind) {
        state = { ...state, [bind]: String(extra.value ?? '') };
        if (node.onChange) runHandler(program, node.onChange, state, PLAY_CTX);
      } else if (name === 'toggle' && bind) {
        state = { ...state, [bind]: Boolean(extra.checked) };
        if (node.onChange) runHandler(program, node.onChange, state, PLAY_CTX);
      } else if (name === 'select' && bind) {
        state = { ...state, [bind]: String(extra.value ?? '') };
        if (node.onChange) runHandler(program, node.onChange, state, PLAY_CTX);
      } else if (name === 'slider' && bind) {
        state = { ...state, [bind]: Number(extra.value) };
        if (node.onChange) runHandler(program, node.onChange, state, PLAY_CTX);
      } else {
        return;
      }
      state = { ...state, ...computeDerived(program, state) };
    } catch (e) {
      const loc = e?.__karaLoc;
      pushLog(`[runtime] ${String(e.message ?? e)}${loc ? ` (line ${loc.line}, col ${loc.col})` : ''}`);
    }
  }

  function applyPreset(name) {
    source = PRESETS[name];
  }

  $: if (typeof source === 'string') {
    clearTimeout(compileTimer);
    compileTimer = setTimeout(compileNow, 250);
  }
</script>

<svelte:head>
  <title>KARA Playground</title>
</svelte:head>

<main class="pg">
  <header class="topbar">
    <div class="brand">
      <span class="logo">◈</span>
      <span class="brand-name">KARA Playground</span>
      <span class="sub">compile and run .kara in your browser</span>
    </div>
    <div class="tools">
      <label class="preset">
        Example
        <select bind:value={presetName} on:change={() => applyPreset(presetName)}>
          <option value="contador">Counter</option>
          <option value="formulario">Form</option>
          <option value="lista">Reactive list</option>
          <option value="componentes">Components</option>
          <option value="tareas">Todos</option>
        </select>
      </label>
      <span class={`status ${errors.length ? 'err' : program ? 'ok' : ''}`}>
        {#if compiling}
          compiling…
        {:else if errors.length}
          {errors.length} error(s)
        {:else if program}
          ✓ compiles
        {:else}
          waiting…
        {/if}
      </span>
    </div>
  </header>

  <section class="layout">
    <div class="editor-pane">
      <textarea
        class="editor"
        spellcheck="false"
        bind:value={source}
        on:keydown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart;
            source = source.slice(0, s) + '  ' + source.slice(el.selectionEnd);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = s + 2;
            });
          }
        }}
      ></textarea>

      {#if errors.length}
        <div class="errors">
          {#each errors as e, i (i)}
            <div class="error">
              <code class="kind">{e.kind}</code>
              <span class="msg">{e.message}</span>
              <span class="loc">line {e.line}, col {e.col}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="right">
      <div class="tabs">
        <button class:active={tab === 'preview'} on:click={() => (tab = 'preview')}>Preview</button>
        <button class:active={tab === 'ast'} on:click={() => (tab = 'ast')}>AST</button>
        <button class:active={tab === 'console'} on:click={() => (tab = 'console')}>
          Console {logs.length ? `(${logs.length})` : ''}
        </button>
        <button class:active={tab === 'ref'} on:click={() => (tab = 'ref')}>Reference</button>
      </div>

      <div class="pane">
        {#if tab === 'preview'}
          {#if !program}
            <div class="placeholder">
              <p>Fix the errors to see the preview.</p>
            </div>
          {:else}
            <div class="frame" style="max-width:{program.size?.[0] ?? 420}px;">
              <div class="frame-title">{program.title ?? 'KARA'}</div>
              <div class="frame-body">
                {#each program.ui?.children ?? [] as node, i (i)}
                  <Component node={node} {state} {onEvent} />
                {/each}
              </div>
            </div>
            <div class="hint">Buttons run the logic with the interpreter — no server needed.</div>
          {/if}
        {:else if tab === 'ast'}
          {#if astText}
            <pre class="ast">{astText}</pre>
          {:else}
            <div class="placeholder"><p>No AST.</p></div>
          {/if}
        {:else if tab === 'ref'}
          <div class="ref">
            <h4>Widgets</h4>
            {#each Object.entries(REF.components) as [name, schema] (name)}
              <div class="ref-comp">
                <code>{name}</code>
                <span class="ref-kind">{schema.kind === 'container' ? 'container' : 'leaf'}</span>
                <div class="ref-props">
                  {#each Object.entries(schema.props) as [prop, def] (prop)}
                    <div class="ref-prop">
                      <code>{prop}</code>
                      <span class="ref-type">{propTypeLabel(def)}</span>
                      {#if def.required}<span class="ref-req">required</span>{/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}

            <h4>Builtins</h4>
            <div class="ref-props">
              {#each REF.builtins as b (b)}
                <code class="ref-builtin">{b}()</code>
              {/each}
            </div>

            <h4>Keywords</h4>
            <div class="ref-props">
              {#each REF.keywords as k (k)}
                <code class="ref-builtin">{k}</code>
              {/each}
            </div>
          </div>
        {:else}
          <div class="console">
            {#if logs.length === 0}
              <div class="log-empty">No output yet (use Print, Log or Alert).</div>
            {/if}
            {#each logs as line, i (i)}
              <div class="log-line">{line}</div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>
</main>

{#if alertMsg !== null}
  <div class="alert-overlay">
    <div class="alert-card">
      <h3>KARA</h3>
      <p>{alertMsg}</p>
      <button class="btn" on:click={() => (alertMsg = null)}>OK</button>
    </div>
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #0d1117;
    color: #e6edf3;
  }
  .pg {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 18px;
    background: #161b22;
    border-bottom: 1px solid #262d38;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .logo {
    color: #6c8bff;
    font-size: 18px;
  }
  .brand-name {
    font-weight: 700;
    letter-spacing: 0.3px;
  }
  .sub {
    color: #8b95ab;
    font-size: 12px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .preset {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8b95ab;
  }
  select {
    background: #0d1117;
    color: #e6edf3;
    border: 1px solid #2d3748;
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 12.5px;
    outline: none;
  }
  select:focus {
    border-color: #6c8bff;
  }
  .status {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    background: #21262d;
    color: #8b95ab;
    white-space: nowrap;
  }
  .status.ok {
    background: #12261b;
    color: #3fb950;
  }
  .status.err {
    background: #3d1a1a;
    color: #ff7b72;
  }

  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    min-height: 0;
  }
  .editor-pane {
    display: flex;
    flex-direction: column;
    border-right: 1px solid #262d38;
    min-height: 0;
  }
  .editor {
    flex: 1;
    min-height: 0;
    background: #0d1117;
    color: #c9d1d9;
    border: none;
    outline: none;
    resize: none;
    padding: 16px 18px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Cascadia Mono', monospace;
    font-size: 13.5px;
    line-height: 1.6;
    tab-size: 2;
    white-space: pre;
  }
  .errors {
    border-top: 1px solid #3d1a1a;
    background: #1a1215;
    max-height: 30%;
    overflow-y: auto;
  }
  .error {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 16px;
    font-size: 12.5px;
    border-bottom: 1px solid #26161b;
  }
  .error .kind {
    color: #ff7b72;
    font-weight: 700;
    flex-shrink: 0;
  }
  .error .msg {
    color: #f0a8a4;
  }
  .error .loc {
    color: #8b95ab;
    margin-left: auto;
    white-space: nowrap;
  }

  .right {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #0d1117;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 8px 12px 0;
  }
  .tabs button {
    background: transparent;
    border: none;
    color: #8b95ab;
    font-size: 12.5px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .tabs button:hover {
    color: #e6edf3;
  }
  .tabs button.active {
    color: #6c8bff;
    border-bottom-color: #6c8bff;
  }
  .pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
  }
  .placeholder {
    color: #8b95ab;
    text-align: center;
    padding: 48px 0;
    font-size: 13.5px;
  }
  .frame {
    margin: 0 auto;
    background: #161b22;
    border: 1px solid #262d38;
    border-radius: 12px;
    overflow: hidden;
  }
  .frame-title {
    padding: 10px 14px;
    font-size: 12.5px;
    font-weight: 600;
    background: #1c232e;
    border-bottom: 1px solid #262d38;
  }
  .frame-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 120px;
  }
  .hint {
    text-align: center;
    color: #57606a;
    font-size: 11.5px;
    margin-top: 12px;
  }
  .ast {
    margin: 0;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #9da7b3;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ref h4 {
    margin: 18px 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #8b95ab;
  }
  .ref h4:first-child {
    margin-top: 0;
  }
  .ref-comp {
    background: #161b22;
    border: 1px solid #262d38;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }
  .ref-comp > code {
    color: #6c8bff;
    font-weight: 700;
    font-size: 13px;
  }
  .ref-kind {
    color: #57606a;
    font-size: 11px;
    margin-left: 6px;
  }
  .ref-props {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .ref-prop {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #0d1117;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11.5px;
  }
  .ref-prop code {
    color: #c9d1d9;
  }
  .ref-type {
    color: #8b95ab;
    font-size: 10.5px;
  }
  .ref-req {
    color: #ff7b72;
    font-size: 10px;
    font-weight: 700;
  }
  .ref-builtin {
    background: #161b22;
    border: 1px solid #262d38;
    color: #7ee787;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11.5px;
  }
  .console {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
  }
  .log-line {
    color: #c9d1d9;
    padding: 2px 0;
  }
  .log-empty {
    color: #57606a;
    font-style: italic;
  }

  .alert-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }
  .alert-card {
    background: #161b22;
    border: 1px solid #2d3748;
    border-radius: 12px;
    padding: 20px 24px;
    max-width: 380px;
    width: 90%;
  }
  .alert-card h3 {
    margin: 0 0 10px;
    font-size: 15px;
  }
  .alert-card p {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.5;
  }
  .btn {
    background: #6c8bff;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover {
    background: #5474f0;
  }
</style>
