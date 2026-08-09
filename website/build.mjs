/**
 * Builds website/assets/kara.js — the KARA compiler + interpreter bundled for
 * the browser, exposed as the `Kara` global (used by the static playground).
 *
 * The compiler (compiler/src/parser.js) and the interpreter
 * (runtime/src/interpreter.js) are pure ESM with no Node builtins, so they
 * bundle cleanly with esbuild and run fully client-side.
 *
 * Usage: npm run web:build   (or: node website/build.mjs)
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

let esbuild;
try {
  esbuild = require(path.join(here, '..', 'ui', 'node_modules', 'esbuild', 'lib', 'main.js'));
} catch {
  console.error('[website] esbuild not found. Run `npm --prefix ui install` first.');
  process.exit(1);
}

await esbuild.build({
  entryPoints: [path.join(here, 'src', 'entry.js')],
  bundle: true,
  format: 'iife',
  // NOTE: no `globalName` here. A top-level `var Kara = (IIFE)()` would
  // overwrite window.Kara with the IIFE's (undefined) return value in real
  // browsers — the entry itself assigns `window.Kara` explicitly.
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  outfile: path.join(here, 'assets', 'kara.js'),
  logLevel: 'info',
});

console.log('[website] built assets/kara.js');
