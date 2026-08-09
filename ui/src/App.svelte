<script>
  import Component from './lib/Component.svelte';

  let program = null;
  let state = {};
  let errors = [];
  let alertMessage = null;
  let logs = [];
  let connected = false;
  let showLogs = false;
  let ws;

  function connect() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.onopen = () => {
      connected = true;
    };
    ws.onclose = () => {
      connected = false;
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'program') {
        program = msg.program;
        state = msg.state ?? {};
      } else if (msg.type === 'state') {
        state = msg.state;
      } else if (msg.type === 'error') {
        errors = msg.errors ?? [];
        if (msg.errors?.[0]?.kind === 'RuntimeError') {
          logs = [...logs, `[runtime] ${msg.errors[0].message}`];
        }
      } else if (msg.type === 'alert') {
        alertMessage = msg.message;
      } else if (msg.type === 'log') {
        logs = [...logs, msg.line];
      }
    };
  }

  function onEvent(name, extra) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'event', name, ...extra }));
    }
  }

  const theme = () => (program?.theme === 'dark' ? 'dark' : 'light');

  connect();
</script>

<svelte:head>
  <title>{program?.title ?? 'KARA'}</title>
</svelte:head>

<main class={`shell theme-${theme()}`}>
  <div
    class="window"
    style="max-width:{program?.size?.[0] ?? 420}px; min-height:{program?.size?.[1] ?? 520}px;"
  >
    <header class="titlebar">
      <div class="traffic">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
      </div>
      <span class="title">{program?.title ?? 'KARA'}</span>
      <div class="status">
        <span
          class={`conn ${connected ? 'on' : 'off'}`}
          title={connected ? 'Runtime connected' : 'Runtime disconnected'}
        ></span>
        <button class="log-toggle" on:click={() => (showLogs = !showLogs)} title="Consola">≣</button>
      </div>
    </header>

    <section class="body">
      {#if !program}
        <div class="loading">Connecting to runtime…</div>
      {:else}
        {#each program.ui?.children ?? [] as node, i (i)}
          <Component node={node} {state} {onEvent} />
        {/each}
      {/if}
    </section>

    {#if showLogs}
      <section class="logs">
        <div class="logs-head">Console</div>
        <div class="logs-body">
          {#if logs.length === 0}
            <div class="log-empty">No output yet</div>
          {/if}
          {#each logs as line, i (i)}
            <div class="log-line">{line}</div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</main>

{#if errors.length > 0}
  <div class="error-overlay">
    <div class="error-card">
      <h3>⚠ Compilation error</h3>
      <ul>
        {#each errors as e, i (i)}
          <li>
            <code>{e.message}</code>
            {#if e.line}
              <span class="err-loc">— line {e.line}, col {e.col}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <button class="btn btn-ghost" on:click={() => (errors = [])}>Close</button>
    </div>
  </div>
{/if}

{#if alertMessage !== null}
  <div class="alert-overlay">
    <div class="alert-card">
      <h3>KARA</h3>
      <p>{alertMessage}</p>
      <button class="btn btn-primary" on:click={() => (alertMessage = null)}>OK</button>
    </div>
  </div>
{/if}

{#if !connected}
  <div class="disconnected">
    Runtime unavailable — run <code>kara dev</code> from the project root.
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg, #0f1218);
  }

  .shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: linear-gradient(145deg, var(--bg), var(--bg-2));
    transition: background 0.3s ease;
  }
  .theme-light {
    --bg: #eef1f6;
    --bg-2: #e2e7f0;
    --window: #ffffff;
    --titlebar: #f4f6fa;
    --border: #e3e7ef;
    --text: #1c2333;
    --text-dim: #6b7686;
    --accent: #4f6ef7;
    --accent-hover: #3d5ce0;
    --accent-soft: #eef1fe;
    --danger: #e5484d;
    --shadow: rgba(30, 41, 59, 0.18);
  }
  .theme-dark {
    --bg: #0f1218;
    --bg-2: #171c26;
    --window: #1b2130;
    --titlebar: #202738;
    --border: #2c3448;
    --text: #e8ecf5;
    --text-dim: #8b95ab;
    --accent: #6c8bff;
    --accent-hover: #5474f0;
    --accent-soft: #232c4a;
    --danger: #ff6369;
    --shadow: rgba(0, 0, 0, 0.5);
  }

  .window {
    width: 100%;
    background: var(--window);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 24px 60px var(--shadow), 0 2px 8px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: background 0.3s ease, border-color 0.3s ease;
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--titlebar);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }
  .traffic {
    display: flex;
    gap: 6px;
  }
  .dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
  }
  .dot.red {
    background: #ff5f57;
  }
  .dot.yellow {
    background: #febc2e;
  }
  .dot.green {
    background: #28c840;
  }

  .title {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: 0.2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .conn {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .conn.on {
    background: #28c840;
    box-shadow: 0 0 8px #28c84088;
  }
  .conn.off {
    background: var(--danger);
  }
  .log-toggle {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .log-toggle:hover {
    color: var(--text);
    border-color: var(--accent);
  }

  .body {
    flex: 1;
    padding: 22px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .loading {
    color: var(--text-dim);
    font-size: 14px;
    text-align: center;
    padding: 40px 0;
  }

  .logs {
    border-top: 1px solid var(--border);
    background: var(--titlebar);
    max-height: 180px;
    display: flex;
    flex-direction: column;
  }
  .logs-head {
    padding: 8px 14px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }
  .logs-body {
    overflow-y: auto;
    padding: 8px 14px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .log-line {
    color: var(--text);
    padding: 1px 0;
  }
  .log-empty {
    color: var(--text-dim);
    font-style: italic;
  }

  .error-overlay,
  .alert-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    backdrop-filter: blur(3px);
    animation: fade 0.15s ease;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .error-card,
  .alert-card {
    background: var(--window);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    max-width: 480px;
    width: 90%;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    animation: pop 0.18s ease;
  }
  @keyframes pop {
    from {
      transform: scale(0.94);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .error-card h3,
  .alert-card h3 {
    margin: 0 0 12px 0;
    font-size: 15px;
  }
  .error-card ul {
    margin: 0 0 16px 0;
    padding-left: 20px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .error-card code {
    background: var(--accent-soft);
    border-radius: 4px;
    padding: 1px 5px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
  }
  .err-loc {
    color: var(--text-dim);
    font-size: 12px;
  }
  .alert-card p {
    margin: 0 0 18px 0;
    font-size: 14px;
    line-height: 1.5;
  }

  .disconnected {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--danger);
    color: #fff;
    font-size: 12.5px;
    padding: 8px 14px;
    border-radius: 999px;
    box-shadow: 0 8px 24px rgba(229, 72, 77, 0.4);
    z-index: 60;
    white-space: nowrap;
  }
  .disconnected code {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 0 4px;
  }
</style>
