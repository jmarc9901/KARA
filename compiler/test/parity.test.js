/**
 * Parser parity test — Rust parser vs JS compiler.
 *
 * For every runnable example (and src/main.kara) it compares the raw AST from
 * the JS `Parser` with the JSON emitted by the Rust `kara-parser` binary. The
 * test is skipped when the Rust parser is not built:
 *
 *   cargo build --manifest-path parser/Cargo.toml
 *
 * Import ids are normalized to the file name so the comparison is robust
 * across platforms (Windows drive letters / canonicalization differences).
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from '../src/parser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(ROOT, 'parser', 'target', 'debug', 'kara-parser');
const BIN_EXE = `${BIN}.exe`;
const hasBin = fs.existsSync(BIN) || fs.existsSync(BIN_EXE);

const examplesDir = path.join(ROOT, 'examples');
const sources = fs.existsSync(examplesDir)
  ? fs
      .readdirSync(examplesDir)
      .filter((f) => f.endsWith('.kara'))
      .map((f) => path.join(examplesDir, f))
  : [];
sources.push(path.join(ROOT, 'src', 'main.kara'));

function makeResolver(entryDir) {
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

/** Raw JS parser output (no expansion / sema / typecheck). */
function parseJs(source, entryDir) {
  const parser = new Parser(source, { resolveImport: makeResolver(entryDir) });
  const program = parser.parseProgram();
  return { program, errors: parser.errors };
}

/** Normalize for cross-platform comparison (import ids → file names). */
function normalize(program) {
  const p = structuredClone(program);
  if (Array.isArray(p.imports)) {
    p.imports = p.imports.map((imp) => ({ spec: imp.spec, file: path.basename(imp.id) }));
  }
  return p;
}

for (const file of sources) {
  const rel = path.relative(ROOT, file);
  test(`parity: ${rel}`, { skip: hasBin ? false : 'Rust parser not built — run: cargo build --manifest-path parser/Cargo.toml' }, () => {
    const source = fs.readFileSync(file, 'utf8');
    const js = parseJs(source, path.dirname(file));
    // Module files (import targets, e.g. widgets.kara) are not programs — both
    // parsers must reject them the same way.
    if (js.errors.length > 0) {
      const outDir = path.join(ROOT, 'build', 'parity-rust');
      fs.mkdirSync(outDir, { recursive: true });
      let rustOutput = '';
      try {
        execFileSync(BIN, [file, outDir], { stdio: 'pipe' });
      } catch (e) {
        rustOutput = String(e.stderr ?? '');
      }
      const rustFailed = rustOutput.includes('compile errors:');
      assert.ok(rustFailed, `JS rejected ${rel} but the Rust parser accepted it`);
      return;
    }

    const outDir = path.join(ROOT, 'build', 'parity-rust');
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync(BIN, [file, outDir], { stdio: 'pipe' });
    const rust = JSON.parse(fs.readFileSync(path.join(outDir, 'ast.json'), 'utf8'));

    assert.deepStrictEqual(
      normalize(rust),
      normalize(js.program),
      `AST mismatch between Rust parser and JS compiler for ${rel}`
    );
  });
}
