/**
 * KARA compiler entry point.
 *
 * Exposes the compile pipeline (lexer → parser → sema) and a `build` helper
 * that writes build/ast.json or build/errors.json.
 */

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { compile } from './parser.js';

export { lex } from './lexer.js';
export { compile } from './parser.js';
export { COMPONENT_SCHEMA, BUILTIN_NAMES } from './parser.js';
export { typecheck, inferTypeMap } from './types.js';

export const BUILTINS = [
  'Print', 'Alert', 'Random', 'Now', 'Length', 'Push', 'Log',
  'Map', 'Filter', 'Reduce',
  'File.Read', 'File.Write', 'SetTimeout', 'SetInterval',
];

/**
 * Default import resolver: reads sibling .kara files relative to the entry.
 * @param {string} entryDir directory of the compiled entry file
 */
export function makeFileResolver(entryDir) {
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

/**
 * Compile a .kara file into the build directory.
 * @param {string} inputPath path to the .kara source
 * @param {string} outDir directory for ast.json / errors.json
 * @returns {Promise<{ok: boolean, program?: object, errors?: object[], astPath?: string, errorsPath?: string}>}
 */
export async function build(inputPath, outDir) {
  const source = await fsp.readFile(inputPath, 'utf8');
  const entryDir = path.dirname(path.resolve(inputPath));
  const result = compile(source, { resolveImport: makeFileResolver(entryDir) });
  await fsp.mkdir(outDir, { recursive: true });

  if (result.ok) {
    const program = {
      version: '0.4.0',
      entry: path.basename(inputPath),
      ...result.program,
    };
    const astPath = path.join(outDir, 'ast.json');
    await fsp.writeFile(astPath, JSON.stringify(program, null, 2), 'utf8');
    return { ok: true, program, astPath };
  }

  const errorsPath = path.join(outDir, 'errors.json');
  await fsp.writeFile(errorsPath, JSON.stringify(result.errors, null, 2), 'utf8');
  return { ok: false, errors: result.errors, errorsPath };
}

/** Format errors as human-readable text with line/column markers. */
export function formatErrors(errors, source) {
  const lines = source.split('\n');
  const out = [];
  for (const e of errors) {
    // Errors from imported module files carry their own `file`; their line/col
    // are relative to that file, so we show the file name instead of a caret
    // into the entry source.
    if (e.file) {
      out.push(`${e.kind ?? 'Error'}: ${e.file}: ${e.message} (line ${e.line}, col ${e.col})`);
      continue;
    }
    out.push(`${e.kind ?? 'Error'}: ${e.message} (line ${e.line}, col ${e.col})`);
    if (e.line >= 1 && e.line <= lines.length) {
      out.push(`  ${lines[e.line - 1]}`);
      const pad = '  '.length + Math.max(0, e.col - 1);
      out.push(`${' '.repeat(pad)}^`);
    }
  }
  return out.join('\n');
}
