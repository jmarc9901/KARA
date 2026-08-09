import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Minimal LSP client over stdio for testing. */
function connect() {
  const server = spawn(process.execPath, [path.join(HERE, '..', 'src', 'lsp.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = Buffer.alloc(0);
  let seq = 0;
  const pending = new Map();
  const notifications = [];

  function send(msg) {
    const body = JSON.stringify(msg);
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }
  function request(method, params) {
    return new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });
  }
  server.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = buf.slice(0, idx).toString('utf8');
      const m = /Content-Length: (\d+)/i.exec(head);
      buf = buf.slice(idx + 4);
      if (!m) continue;
      const len = Number(m[1]);
      if (buf.length < len) return;
      const body = buf.slice(0, len).toString('utf8');
      buf = buf.slice(len);
      const msg = JSON.parse(body);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      } else if (msg.method) {
        notifications.push(msg);
      }
    }
  });
  // Never hang the suite: if the server dies, settle every pending request.
  server.on('exit', () => {
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  });
  return { server, send, request, notifications };
}

async function shutdown(c) {
  await c.request('shutdown', {});
  c.send({ jsonrpc: '2.0', method: 'exit', params: {} });
  c.server.kill();
}

const uri = 'file:///tmp/demo.kara';
const BAD = 'App { title: "T" size: (400, 300) state n = 0 Column { Text { value: "\u0024{n}" } Button { id: "b" text: "+" onClick: n = missing + 1 } } }';
const GOOD = 'App { title: "T" size: (400, 300) state n = 0 derived d = n * 2 Column { Text { value: "\u0024{n}" } Button { id: "b" text: "+" onClick: n = n + 1 } } }';

test('LSP: initialize, live diagnostics, hover and completion', async () => {
  const c = connect();

  const init = await c.request('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  assert.equal(init.capabilities.textDocumentSync, 1, 'full sync advertised');
  assert.equal(init.capabilities.hoverProvider, true);
  assert.ok(init.capabilities.completionProvider, 'completion advertised');
  c.send({ jsonrpc: '2.0', method: 'initialized', params: {} });

  // Bad file → a diagnostic arrives.
  c.send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: { textDocument: { uri, languageId: 'kara', version: 1, text: BAD } },
  });
  await new Promise((r) => setTimeout(r, 400));
  const diag1 = c.notifications.find((n) => n.method === 'textDocument/publishDiagnostics');
  assert.ok(diag1, 'diagnostics published on didOpen');
  assert.ok(
    diag1.params.diagnostics.some((d) => d.message.includes('missing')),
    'reports the unknown variable'
  );

  // Fixed file → diagnostics cleared.
  c.send({
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: GOOD }] },
  });
  await new Promise((r) => setTimeout(r, 400));
  const last = c.notifications.filter((n) => n.method === 'textDocument/publishDiagnostics').at(-1);
  assert.deepEqual(last.params.diagnostics, [], 'diagnostics cleared after fix');

  // Hover on `n` → inferred type.
  const hover = await c.request('textDocument/hover', {
    textDocument: { uri },
    position: { line: 0, character: 40 },
  });
  assert.ok(hover?.contents?.value.includes('Int'), `hover shows Int, got: ${hover?.contents?.value}`);

  // Completion → keywords/builtins offered.
  const comp = await c.request('textDocument/completion', {
    textDocument: { uri },
    position: { line: 0, character: 2 },
  });
  assert.ok(comp?.items?.length > 10, 'completion returns items');
  assert.ok(comp.items.some((i) => i.label === 'App'), 'App keyword suggested');

  await shutdown(c);
});
