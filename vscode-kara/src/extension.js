/**
 * KARA for VS Code — minimal LSP client (zero dependencies).
 *
 * Spawns the KARA language server (compiler/src/lsp.js) as a child process and
 * speaks JSON-RPC 2.0 over stdio:
 *   - live diagnostics while typing (textDocument/publishDiagnostics)
 *   - hover with inferred types (textDocument/hover)
 *   - completion (textDocument/completion)
 *
 * Also adds two commands:
 *   - "KARA: Run"         → opens an integrated terminal with `kara dev <file>`
 *   - "KARA: New project" → `kara new <name>`
 */

'use strict';

const vscode = require('vscode');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

let server = null;
let outBuf = Buffer.alloc(0);
let seq = 0;
const pending = new Map();
let diagnostics = null;
let disposed = false;
let restartTimer = null;

function isKara(doc) {
  return doc.languageId === 'kara' || doc.uri.fsPath.endsWith('.kara');
}

/** Locate compiler/src/lsp.js — dev layout (repo) or bundled layout (package). */
function resolveLspPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'compiler', 'src', 'lsp.js'),
    path.join(__dirname, '..', 'compiler', 'src', 'lsp.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function write(msg) {
  if (!server || server.exitCode !== null) return;
  const body = JSON.stringify(msg);
  server.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function sendRequest(method, params) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    write({ jsonrpc: '2.0', id, method, params });
  });
}

function onMessage(msg) {
  if (msg.id != null && pending.has(msg.id)) {
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
    return;
  }
  if (msg.method === 'textDocument/publishDiagnostics') {
    const uri = vscode.Uri.parse(msg.params.uri);
    diagnostics.set(
      uri,
      (msg.params.diagnostics ?? []).map((d) => {
        const range = new vscode.Range(
          new vscode.Position(d.range.start.line, d.range.start.character),
          new vscode.Position(d.range.end.line, d.range.end.character)
        );
        const severity =
          d.severity === 1
            ? vscode.DiagnosticSeverity.Error
            : d.severity === 2
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Information;
        return new vscode.Diagnostic(range, d.message, severity);
      })
    );
  }
}

function onData(chunk) {
  outBuf = Buffer.concat([outBuf, chunk]);
  for (;;) {
    const idx = outBuf.indexOf('\r\n\r\n');
    if (idx === -1) return;
    const head = outBuf.slice(0, idx).toString('utf8');
    const m = /Content-Length: (\d+)/i.exec(head);
    outBuf = outBuf.slice(idx + 4);
    if (!m) continue;
    const len = Number(m[1]);
    if (outBuf.length < len) return;
    const body = outBuf.slice(0, len).toString('utf8');
    outBuf = outBuf.slice(len);
    try {
      onMessage(JSON.parse(body));
    } catch {
      // ignore malformed frames
    }
  }
}

function startServer(context) {
  const lspPath = resolveLspPath();
  if (!lspPath) {
    vscode.window.showWarningMessage(
      'KARA: compiler/src/lsp.js not found. Run the extension from the repo or bundle the compiler into the extension.'
    );
    return;
  }
  server = spawn(process.execPath, [lspPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  server.stdout.on('data', onData);
  server.stderr.on('data', (d) => console.error('[kara-lsp]', String(d)));
  server.on('exit', () => {
    // Never leave requests hanging: reject them so hovers/completions settle.
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
    // Drop any partial frame left over from the dead server — otherwise it
    // would corrupt the framing of the restarted server's first responses.
    outBuf = Buffer.alloc(0);
    server = null;
    // Restart the server so diagnostics keep working after a crash.
    if (!disposed) restartTimer = setTimeout(() => startServer(context), 1000);
  });

  write({
    jsonrpc: '2.0',
    id: ++seq,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: vscode.workspace.workspaceFolders?.[0]
        ? vscode.workspace.workspaceFolders[0].uri.toString()
        : null,
      capabilities: {},
    },
  });
  write({ jsonrpc: '2.0', method: 'initialized', params: {} });

  // Sync already-open documents (also covers the restart path).
  for (const doc of vscode.workspace.textDocuments) {
    if (isKara(doc)) sendDidOpen(doc);
  }

  context.subscriptions.push({
    dispose: () => {
      disposed = true;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        if (server && server.exitCode === null) {
          write({ jsonrpc: '2.0', id: ++seq, method: 'shutdown', params: {} });
          server.kill();
        }
      } catch {
        // already gone
      }
    },
  });
}

function sendDidOpen(doc) {
  write({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: { textDocument: { uri: doc.uri.toString(), languageId: 'kara', version: 1, text: doc.getText() } },
  });
}

function sendDidChange(doc) {
  write({
    jsonrpc: '2.0',
    method: 'textDocument/didChange',
    params: { textDocument: { uri: doc.uri.toString(), version: doc.version }, contentChanges: [{ text: doc.getText() }] },
  });
}

function sendDidClose(uri) {
  write({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } });
  diagnostics.delete(vscode.Uri.parse(uri));
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function runKara() {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const terminal = vscode.window.createTerminal({ name: 'KARA', cwd });
  terminal.show();
  const doc = vscode.window.activeTextEditor?.document;
  if (doc && isKara(doc)) {
    const rel = path.relative(cwd, doc.uri.fsPath).replace(/\\/g, '/');
    terminal.sendText(`kara dev ${JSON.stringify(rel)}`);
  } else {
    terminal.sendText('kara dev');
  }
}

async function newProject() {
  const name = await vscode.window.showInputBox({
    prompt: 'KARA project name',
    placeHolder: 'mi-app',
    validateInput: (v) => (v && /^[a-zA-Z0-9_-]+$/.test(v) ? null : 'Use only letters, numbers and dashes'),
  });
  if (!name) return;
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const terminal = vscode.window.createTerminal({ name: 'KARA', cwd });
  terminal.show();
  terminal.sendText(`kara new ${name}`);
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
  disposed = false;
  diagnostics = vscode.languages.createDiagnosticCollection('kara');
  context.subscriptions.push(diagnostics);

  startServer(context);

  // Keep the server's document store in sync.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isKara(doc)) sendDidOpen(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isKara(e.document)) sendDidChange(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (isKara(doc)) sendDidClose(doc.uri.toString());
    })
  );

  // Hover: ask the LSP, render the markdown result.
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('kara', {
      provideHover(doc, pos) {
        if (!server) return null;
        return sendRequest('textDocument/hover', {
          textDocument: { uri: doc.uri.toString() },
          position: { line: pos.line, character: pos.character },
        }).then((res) => {
          if (!res || !res.contents?.value) return null;
          return new vscode.Hover(new vscode.MarkdownString(res.contents.value));
        });
      },
    }),
    // Completion: let the LSP decide (keywords/builtins/widgets/props).
    vscode.languages.registerCompletionItemProvider(
      'kara',
      {
        provideCompletionItems(doc, pos) {
          if (!server) return [];
          return sendRequest('textDocument/completion', {
            textDocument: { uri: doc.uri.toString() },
            position: { line: pos.line, character: pos.character },
          }).then((res) =>
            (res?.items ?? []).map((it) => {
              const item = new vscode.CompletionItem(it.label, kindOf(it.kind));
              if (it.insertText) item.insertText = it.insertText;
              if (it.detail) item.detail = it.detail;
              return item;
            })
          );
        },
      },
      ':', '.', ' ', '"'
    ),
    vscode.commands.registerCommand('kara.run', runKara),
    vscode.commands.registerCommand('kara.newProject', newProject)
  );
}

function kindOf(k) {
  const map = {
    1: vscode.CompletionItemKind.Text,
    2: vscode.CompletionItemKind.Method,
    3: vscode.CompletionItemKind.Function,
    5: vscode.CompletionItemKind.Field,
    7: vscode.CompletionItemKind.Class,
    14: vscode.CompletionItemKind.Keyword,
  };
  return map[k] ?? vscode.CompletionItemKind.Text;
}

function deactivate() {
  if (server && server.exitCode === null) server.kill();
}

module.exports = { activate, deactivate };
