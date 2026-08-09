/**
 * KARA extension prepublish — copies the compiler into the extension so the
 * packaged .vsix is self-contained (the extension spawns compiler/src/lsp.js
 * as a child process at runtime).
 *
 * Must be .mjs: the extension itself is CommonJS (vscode extensions are CJS),
 * so the extension folder cannot declare "type": "module".
 */

import { cpSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(HERE, '..');
const repoCompiler = path.resolve(extRoot, '..', 'compiler');
const dest = path.join(extRoot, 'compiler');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(repoCompiler, dest, { recursive: true });
console.log(`ok: compilador copiado a ${dest}`);
