#!/usr/bin/env node
/**
 * KARA Language Server — zero-dependency LSP (JSON-RPC 2.0) over stdio.
 *
 * Features:
 *   - live diagnostics: every compile error becomes an LSP Diagnostic
 *   - hover: inferred types for state/derived variables and functions, plus
 *     widget props and custom component signatures
 *   - completion: keywords, builtins, widgets, custom components and — inside
 *     a component block — its props and handlers
 *
 * Run standalone:   node compiler/src/lsp.js
 * Or via the CLI:   kara lsp
 * (Any LSP client — VS Code, Neovim, etc. — can connect over stdio.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { compile, COMPONENT_SCHEMA, BUILTIN_NAMES } from './parser.js';
import { inferTypeMap } from './types.js';

const KEYWORDS = ['App', 'component', 'fn', 'let', 'state', 'derived', 'if', 'else', 'while', 'for', 'in', 'return', 'import'];
const COMPONENT_NAMES = Object.keys(COMPONENT_SCHEMA);
const HANDLER_PROPS = {
  Button: ['onClick'],
  TextInput: ['onChange'],
  Select: ['onChange'],
  Slider: ['onChange'],
  Checkbox: ['onChange'],
};

// ---------------------------------------------------------------------------
// Transport (stdio, Content-Length framed)
// ---------------------------------------------------------------------------
let inBuf = Buffer.alloc(0);

function send(msg) {
  const body = JSON.stringify(msg);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n${body}`
  );
}

process.stdin.on('data', (chunk) => {
  inBuf = Buffer.concat([inBuf, chunk]);
  for (;;) {
    const idx = inBuf.indexOf('\r\n\r\n');
    if (idx === -1) return;
    const head = inBuf.slice(0, idx).toString('utf8');
    const m = /Content-Length: (\d+)/i.exec(head);
    inBuf = inBuf.slice(idx + 4);
    if (!m) continue;
    const len = Number(m[1]);
    if (inBuf.length < len) return;
    const body = inBuf.slice(0, len).toString('utf8');
    inBuf = inBuf.slice(len);
    try {
      handle(JSON.parse(body));
    } catch {
      // malformed message — ignore
    }
  }
});
process.stdin.resume();

// ---------------------------------------------------------------------------
// Document store + analysis
// ---------------------------------------------------------------------------
const docs = new Map(); // uri -> text

function filePathOf(uri) {
  if (!uri.startsWith('file://')) return null;
  const p = uri.slice(7);
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

function resolveImport(entryDir) {
  return (spec, fromDir) => {
    const base = fromDir === '.' ? entryDir : fromDir;
    const id = path.resolve(base, spec);
    try {
      return { source: fs.readFileSync(id, 'utf8'), id };
    } catch {
      return null;
    }
  };
}

function analyze(uri, text) {
  const filePath = filePathOf(uri);
  const entryDir = filePath ? path.dirname(filePath) : process.cwd();
  return compile(text, { resolveImport: resolveImport(entryDir) });
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------
function publishDiagnostics(uri, text) {
  const result = analyze(uri, text);
  const diagnostics = (result.ok ? [] : result.errors).map((e) => {
    const line = Math.max(0, (e.line ?? 1) - 1);
    const col = Math.max(0, (e.col ?? 1) - 1);
    return {
      range: { start: { line, character: col }, end: { line, character: col + 1 } },
      severity: 1, // Error
      source: 'kara',
      code: e.kind ?? 'Error',
      message: e.file ? `${e.file}: ${e.message}` : e.message,
    };
  });
  send({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: { uri, diagnostics },
  });
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------
function markdown(summary, code) {
  return { contents: { kind: 'markdown', value: `${summary}\n\n\`\`\`kara\n${code}\n\`\`\`` } };
}

function wordAt(line, col) {
  const re = /[A-Za-z_][A-Za-z0-9_.]*/g;
  let best = null;
  for (const match of line.matchAll(re)) {
    if (match.index <= col && col <= match.index + match[0].length) best = match[0];
  }
  return best;
}

function computeHover(params) {
  const uri = params.textDocument.uri;
  const text = docs.get(uri);
  if (!text) return null;
  const line = (text.split('\n')[params.position.line] ?? '');
  const word = wordAt(line, params.position.character);
  if (!word) return null;

  const result = analyze(uri, text);
  if (!result.ok) return null;

  const { vars, fns } = inferTypeMap(result.program);
  if (fns.has(word)) return markdown(`**${word}** — función`, `${word}() → ${fns.get(word)}`);
  if (vars.has(word)) return markdown(`**${word}** — variable`, `${word}: ${vars.get(word)}`);

  if (BUILTIN_NAMES.includes(word)) return markdown(`**${word}** — builtin`, `${word}(...)`);
  if (COMPONENT_NAMES.includes(word)) {
    const schema = COMPONENT_SCHEMA[word];
    const props = Object.entries(schema.props)
      .map(([k, v]) => `${k}: ${v.type}${v.required ? ' · obligatorio' : ''}`)
      .join('\n');
    const handlers = HANDLER_PROPS[word] ? HANDLER_PROPS[word].join(', ') : '';
    return markdown(`**${word}** — widget`, `${props}${handlers ? `\nhandlers: ${handlers}` : ''}`);
  }
  const comp = result.program.components?.find((c) => c.name === word);
  if (comp) {
    const ps = comp.params.map((p) => p.name).join(', ');
    return markdown(`**${word}** — componente`, `component ${word}(${ps})`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------
function enclosingComponentName(lines, pos) {
  const textBefore =
    lines.slice(0, pos.line).join('\n') + '\n' + (lines[pos.line] ?? '').slice(0, pos.character);
  const re = /([A-Z][A-Za-z0-9_]*)\s*\{/g;
  let m;
  let last = null;
  while ((m = re.exec(textBefore))) last = { name: m[1], openIdx: re.lastIndex - 1 };
  if (!last) return null;
  let depth = 0;
  for (let i = last.openIdx; i < textBefore.length; i += 1) {
    const ch = textBefore[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return null;
    }
  }
  return depth > 0 ? last.name : null;
}

function computeCompletions(params) {
  const uri = params.textDocument.uri;
  const text = docs.get(uri);
  if (!text) return [];
  const lines = text.split('\n');
  const pos = params.position;

  const items = [];
  const add = (label, kind, detail, insert) =>
    items.push({ label, kind, detail, insertText: insert ?? label });

  // Inside a component block → suggest only its props/handlers.
  const compName = enclosingComponentName(lines, pos);
  if (compName) {
    const schema = COMPONENT_SCHEMA[compName];
    if (schema) {
      for (const [k, v] of Object.entries(schema.props)) {
        const insert =
          v.type === 'strArray' ? `${k}: [""]` :
          v.type === 'bool' ? `${k}: true` :
          v.type === 'num' || v.type === 'int' || v.type === 'float' ? `${k}: 0` :
          v.type === 'strEnum' ? `${k}: "${v.allowed?.[0] ?? ''}"` :
          `${k}: ""`;
        add(k, 5, `prop · ${v.type}${v.required ? ' · obligatorio' : ''}`, insert);
      }
      for (const h of HANDLER_PROPS[compName] ?? []) add(h, 5, 'handler', `${h}: `);
      return items;
    }
  }

  for (const k of KEYWORDS) add(k, 14, 'keyword');
  for (const b of BUILTIN_NAMES) add(b, 3, 'builtin', `${b}()`);
  for (const c of COMPONENT_NAMES) add(c, 7, 'widget', `${c} { }`);
  const result = analyze(uri, text);
  if (result.ok) {
    for (const c of result.program.components ?? []) add(c.name, 7, 'component', `${c.name} { }`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------
function handle(msg) {
  switch (msg.method) {
    case 'initialize':
      docs.clear();
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          capabilities: {
            textDocumentSync: 1, // Full sync
            hoverProvider: true,
            completionProvider: { triggerCharacters: [':', ' ', '"'] },
          },
          serverInfo: { name: 'kara-lsp', version: '0.4.0' },
        },
      });
      break;
    case 'initialized':
      break;
    case 'shutdown':
      send({ jsonrpc: '2.0', id: msg.id, result: null });
      break;
    case 'exit':
      process.exit(0);
      break;
    case 'textDocument/didOpen': {
      const td = msg.params.textDocument;
      docs.set(td.uri, td.text);
      publishDiagnostics(td.uri, td.text);
      break;
    }
    case 'textDocument/didChange': {
      const td = msg.params.textDocument;
      const change = msg.params.contentChanges?.at(-1);
      if (change && typeof change.text === 'string') {
        docs.set(td.uri, change.text);
        publishDiagnostics(td.uri, change.text);
      }
      break;
    }
    case 'textDocument/didClose':
      docs.delete(msg.params.textDocument.uri);
      break;
    case 'textDocument/hover':
      send({ jsonrpc: '2.0', id: msg.id, result: computeHover(msg.params) });
      break;
    case 'textDocument/completion':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { isIncomplete: false, items: computeCompletions(msg.params) },
      });
      break;
    default:
      if (msg.id != null) send({ jsonrpc: '2.0', id: msg.id, result: null });
  }
}
