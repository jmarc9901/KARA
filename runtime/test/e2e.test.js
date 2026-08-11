/**
 * End-to-end runtime test.
 *
 * Spawns the KARA runtime server against a throwaway project and exercises
 * the real protocol the UI uses over WebSocket, in order:
 *   - boot: server compiles the entry and pushes program + state
 *   - events: a Button click routes to the interpreter and broadcasts state
 *   - timers: SetInterval schedules a KARA function on the server event loop
 *   - hot-reload: touching the entry recompiles and rebroadcasts program/state
 *
 * It runs as ONE sequential test because the steps share server state (the
 * node test runner may parallelise separate top-level tests).
 *
 * Run: npm run test:e2e  (or: node --test runtime/test/e2e.test.js)
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER = path.join(ROOT, 'runtime', 'src', 'index.js');

// Uses SetInterval (desktop runtime only) so the test also covers timers.
const KARA = `App {
  title: "E2E"
  size: (300, 200)

  state count = 0
  state tick = 0
  state interval = SetInterval(100, "onTick")

  fn onTick() {
    tick = tick + 1
  }

  Column {
    Text { value: "n=${'${count}'}" }
    Button { id: "inc" text: "+" onClick: count = count + 1 }
  }
}`;

let dir;
let entry;
let child;
let ws;
let programCount = 0;
let state = {};

function canConnect(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
  });
}

async function pickPort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 5300 + Math.floor(Math.random() * 500);
    if (!(await canConnect(port))) return port;
  }
  throw new Error('could not find a free port');
}

async function waitPort(port, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await canConnect(port)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('runtime server did not start on port ' + port);
}

function waitFor(pred, timeout = 8000, label = 'condition') {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (pred()) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(iv);
        reject(new Error(`timeout waiting for ${label}`));
      }
    }, 25);
  });
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kara-e2e-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  entry = path.join(dir, 'src', 'main.kara');
  fs.writeFileSync(entry, KARA);
  fs.writeFileSync(
    path.join(dir, 'kara.config.json'),
    JSON.stringify({ name: 'e2e', entry: 'src/main.kara', outDir: 'build', port: 0 })
  );

  const port = await pickPort();
  child = spawn(process.execPath, [SERVER], {
    cwd: dir,
    env: {
      ...process.env,
      PORT: String(port),
      KARA_ENTRY: entry,
      KARA_PROJECT_ROOT: dir,
      KARA_CONFIG_PATH: path.join(dir, 'kara.config.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitPort(port);
  ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    if (msg.type === 'program') programCount += 1;
    if (msg.type === 'state') state = msg.state;
    if (msg.type === 'error') {
      throw new Error('runtime broadcast an error: ' + JSON.stringify(msg.errors));
    }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  await waitFor(() => programCount >= 1 && state.count !== undefined, 8000, 'boot program');
});

after(async () => {
  try {
    ws?.close();
  } catch {}
  // Kill the server and WAIT for it to exit: on Windows the temp dir is the
  // process cwd, so it cannot be removed while the child is still alive.
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
  if (dir) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
});

test('runtime flow: boot → click → timers → hot-reload', async () => {
  // 1. Boot: program + initial state pushed on connect. `count` can only
  // change via a click (none sent yet), but `tick` may already be > 0 because
  // the 100 ms interval can fire while the test is starting.
  assert.ok(programCount >= 1, 'server should push the program');
  assert.equal(state.count, 0, 'initial count should be 0');
  assert.equal(typeof state.tick, 'number', 'tick should be a number');

  // 2. Click: the event routes to the interpreter and the new state is broadcast.
  ws.send(JSON.stringify({ type: 'event', name: 'click', nodeId: 'inc' }));
  await waitFor(() => state.count === 1, 4000, 'count=1 after click');
  assert.equal(state.count, 1);

  // 3. Timers: SetInterval schedules the KARA fn on the server event loop.
  const t0 = state.tick;
  await waitFor(() => state.tick > t0, 5000, 'tick to increase');
  assert.ok(state.tick > t0, 'tick should increase from SetInterval');

  // 4. Hot-reload: touching the entry recompiles and rebroadcasts.
  fs.appendFileSync(entry, '\n// hot-reload e2e\n');
  await waitFor(() => programCount >= 2, 8000, 'program rebroadcast after file change');
  assert.ok(programCount >= 2, 'a fresh program should be broadcast after reload');
  // Timers are re-created on reload — tick must keep climbing.
  const t1 = state.tick;
  await waitFor(() => state.tick > t1, 5000, 'tick to keep increasing after reload');
  assert.ok(state.tick > t1, 'timers should be re-created after reload');
});
