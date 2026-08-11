/**
 * KARA runtime server.
 *
 * Serves:
 *   GET  /ast         → compiled program JSON (or an error report)
 *   GET  /errors      → latest parse/semantic errors
 *   GET  /            → built UI (ui/dist)
 *   GET  /assets/*    → static UI assets
 *   WS   /            → { type: 'state' | 'program' | 'error' | 'alert' | 'log' }
 *
 * Events sent by the UI:
 *   { type:'event', name:'click',  nodeId }        → run Button.onClick
 *   { type:'event', name:'input',  nodeId, value } → set TextInput.bind
 *   { type:'event', name:'toggle', nodeId, checked } → set Checkbox.bind
 *
 * Watches the entry .kara file and hot-reloads the program on change.
 */

import http from 'node:http';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { build } from '../../compiler/src/index.js';
import { computeDerived, evalInitialState, runHandler } from './interpreter.js';
import { OS_BUILTINS } from './builtins.js';

const ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));

// Project resolution: the CLI (kara dev/build) locates the nearest
// kara.config.json for the entry being run and passes it here via env vars.
const configPath = process.env.KARA_CONFIG_PATH ?? path.join(ROOT, 'kara.config.json');
const projectRoot = process.env.KARA_PROJECT_ROOT ?? ROOT;
let config = {};
try {
  config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
} catch {
  // no config — defaults below
}

const PORT = Number(process.env.PORT ?? config.port ?? 5179);
const entry = path.resolve(process.env.KARA_ENTRY ?? path.join(projectRoot, config.entry ?? 'src/main.kara'));
const outDir = path.resolve(projectRoot, config.outDir ?? 'build');
const uiDist = path.join(ROOT, 'ui', 'dist');

// ---------------------------------------------------------------------------
// Program state
// ---------------------------------------------------------------------------
let program = null;
let state = {};
let lastErrors = [];

async function reload() {
  // Timers belong to the previous program — clear them before recompiling.
  clearTimers();
  try {
    const result = await build(entry, outDir);
    if (result.ok) {
      program = result.program;
      // OS builtins (File.Read/Write) and timers (SetTimeout/SetInterval) are
      // only available in the desktop runtime; the playground reports them
      // as unavailable.
      program.extraBuiltins = { ...OS_BUILTINS, ...makeTimerBuiltins() };
      state = evalInitialState(program);
      lastErrors = [];
      return { ok: true };
    }
    lastErrors = result.errors;
    return { ok: false, errors: result.errors };
  } catch (e) {
    // A runtime error while evaluating state/derived initialisers (e.g.
    // division by zero) must never crash the server: surface it like any
    // other compile/runtime error, with a source location when available.
    const loc = e?.__karaLoc;
    lastErrors = [
      {
        kind: 'RuntimeError',
        message: String(e?.message ?? e),
        line: loc?.line ?? 0,
        col: loc?.col ?? 0,
      },
    ];
    return { ok: false, errors: lastErrors };
  }
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  serveHttp(req, res);
});

const wss = new WebSocketServer({ server });

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function findWidget(node, id) {
  if (!node) return null;
  if (node.props?.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findWidget(child, id);
    if (found) return found;
  }
  return null;
}

wss.on('connection', async (ws) => {
  if (!program) {
    const r = await reload();
    if (!r.ok) {
      ws.send(JSON.stringify({ type: 'error', errors: lastErrors }));
      return;
    }
  }
  ws.send(JSON.stringify({ type: 'program', program }));
  ws.send(JSON.stringify({ type: 'state', state }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type !== 'event') return;

    const ctx = {
      onLog: (line) => broadcast({ type: 'log', line }),
      onAlert: (message) => broadcast({ type: 'alert', message }),
    };

    // NOTE: guard nodeId before findWidget — findWidget compares with `===`,
    // so an undefined id would match a widget that has no `id` prop at all.
    const node = typeof msg.nodeId === 'string' ? findWidget(program?.ui, msg.nodeId) : null;

    // Button clicks run the onClick handler.
    if (msg.name === 'click' && node?.type === 'Button' && node.onClick) {
      try {
        runHandler(program, node.onClick, state, ctx);
        publishState();
      } catch (e) {
        broadcastRuntimeError(e);
      }
      return;
    }

    // Bound widgets: TextInput(input), Checkbox(toggle), Select(select),
    // Slider(slider). The bind is updated first, then onChange (if any) runs.
    const bind = node?.props?.bind;
    if (bind && bind in program.state) {
      const boundEvents = ['input', 'toggle', 'select', 'slider'];
      if (!boundEvents.includes(msg.name)) return;
      if (msg.name === 'toggle') state[bind] = Boolean(msg.checked);
      else if (msg.name === 'slider') state[bind] = Number(msg.value);
      else state[bind] = String(msg.value ?? '');
      try {
        if (node?.onChange) runHandler(program, node.onChange, state, ctx);
        publishState();
      } catch (e) {
        broadcastRuntimeError(e);
      }
    }
  });
});

/** Broadcast a runtime error with source location when available. */
function broadcastRuntimeError(e) {
  const loc = e?.__karaLoc;
  broadcast({
    type: 'error',
    errors: [
      {
        kind: 'RuntimeError',
        message: String(e.message ?? e),
        line: loc?.line ?? 0,
        col: loc?.col ?? 0,
      },
    ],
  });
}

/** Broadcast the current state with derived variables recomputed. */
function publishState() {
  if (program) {
    const snapshot = { ...state, ...computeDerived(program, state) };
    broadcast({ type: 'state', state: snapshot });
  }
}

// ---------------------------------------------------------------------------
// Timers — SetTimeout(ms, "fn") / SetInterval(ms, "fn")
// ---------------------------------------------------------------------------
// Desktop-runtime only: they schedule a KARA function by name on the server
// event loop and broadcast the updated state (with derived values) on fire.
const timerRegistry = new Map(); // handle -> 'timeout' | 'interval'

function makeTimerBuiltins() {
  return {
    SetTimeout: (args) => {
      const ms = Math.max(0, Number(args[0] ?? 0));
      const handle = setTimeout(() => fireTimer(String(args[1] ?? '')), ms);
      timerRegistry.set(handle, 'timeout');
      return null;
    },
    SetInterval: (args) => {
      const ms = Math.max(1, Number(args[0] ?? 0));
      const handle = setInterval(() => fireTimer(String(args[1] ?? '')), ms);
      timerRegistry.set(handle, 'interval');
      return null;
    },
  };
}

function clearTimers() {
  for (const [handle, kind] of timerRegistry) {
    if (kind === 'interval') clearInterval(handle);
    else clearTimeout(handle);
  }
  timerRegistry.clear();
}

/** Run a KARA function scheduled by a timer and broadcast the new state. */
function fireTimer(name) {
  if (!program) return;
  const fn = (program.fns ?? []).find((f) => f.name === name);
  if (!fn) {
    broadcast({
      type: 'error',
      errors: [{ kind: 'RuntimeError', message: `timer: unknown function "${name}"` }],
    });
    return;
  }
  const ctx = {
    onLog: (line) => broadcast({ type: 'log', line }),
    onAlert: (message) => broadcast({ type: 'alert', message }),
  };
  try {
    runHandler(program, fn.body, state, ctx);
    publishState();
  } catch (e) {
    broadcastRuntimeError(e);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

async function serveHttp(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (url.pathname === '/ast') {
    if (program) return send(res, 200, JSON.stringify(program), MIME['.json']);
    return send(res, 200, JSON.stringify({ error: 'no program compiled' }), MIME['.json']);
  }
  if (url.pathname === '/errors') {
    return send(res, 200, JSON.stringify(lastErrors), MIME['.json']);
  }

  // Serve built UI
  let filePath;
  if (url.pathname === '/') filePath = path.join(uiDist, 'index.html');
  else {
    filePath = path.join(uiDist, url.pathname);
    // Extensionless paths (e.g. /playground) fall back to <name>.html
    if (!fs.existsSync(filePath) && !path.extname(url.pathname)) {
      const html = path.join(uiDist, url.pathname + '.html');
      if (fs.existsSync(html)) filePath = html;
    }
  }

  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return send(res, 200, data, MIME[ext] ?? 'application/octet-stream');
  } catch {
    if (url.pathname === '/') {
      return send(
        res,
        500,
        'ui/dist not built. Run "kara dev" from the project root (or: npm --prefix ui run build).'
      );
    }
    return send(res, 404, 'Not found');
  }
}

// ---------------------------------------------------------------------------
// Hot reload
// ---------------------------------------------------------------------------
function watchSource() {
  // Watch the project root so new/renamed .kara files are picked up too.
  const dir = projectRoot;
  if (!fs.existsSync(dir)) return;
  let timer = null;
  try {
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (typeof filename === 'string' && !filename.endsWith('.kara')) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const r = await reload();
        if (r.ok) {
          console.log(`[kara] reloaded ${entry}`);
          broadcast({ type: 'program', program });
          broadcast({ type: 'state', state });
        } else {
          console.log(`[kara] compile error`);
          broadcast({ type: 'error', errors: lastErrors });
        }
      }, 120);
    });
  } catch (e) {
    console.warn(`[kara] file watching unavailable: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const boot = await reload();
if (boot.ok) {
  console.log(`[kara] loaded ${entry}`);
} else {
  console.log('[kara] failed to load the program:');
  for (const e of lastErrors) {
    console.log(`  ${e.kind ?? 'Error'}: ${e.message}${e.line ? ` (line ${e.line}, col ${e.col})` : ''}`);
  }
}

watchSource();

server.listen(PORT, () => {
  console.log(`KARA runtime → http://localhost:${PORT}`);
  console.log(`  ui dist:   ${uiDist}`);
  console.log(`  entry:     ${entry}`);
});
