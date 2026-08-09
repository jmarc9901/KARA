/**
 * KARA bootstrap (prepare/postinstall).
 *
 * The CLI needs `ws` (runtime), Svelte/Vite (ui) and a built ui/dist.
 *
 * - `ws` is a root dependency of kara-lang, so `npm i -g kara-lang` provides
 *   it automatically.
 * - The npm tarball ships a pre-built `ui/dist`, so a global install works
 *   out of the box with no nested npm runs.
 *
 * Rules that keep installs reliable on every platform:
 *
 *   1. Never run nested `npm` from the `postinstall` hook: npm holds its
 *      cache lock while installing, so a nested npm waits on that lock
 *      forever (deadlock) on Windows. Postinstall only checks + warns.
 *   2. From local `prepare` (npm install / npm link at the repo root) we may
 *      run nested npm to fill gaps (ui deps, ui/dist).
 *   3. This script never calls process.exit(1): a failed step logs a warning
 *      and leaves a working CLI — `kara doctor` reports anything missing.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const IS_POSTINSTALL = process.env.npm_lifecycle_event === 'postinstall';

function tryResolveWs() {
  for (const base of [ROOT, path.join(ROOT, 'runtime')]) {
    try {
      require.resolve('ws', { paths: [base] });
      return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

let hadWarning = false;

if (!tryResolveWs()) {
  if (IS_POSTINSTALL) {
    hadWarning = true;
    console.warn('[kara] warning: ws not resolved — run "kara doctor" for details.');
  } else {
    const ok = run('npm', ['--prefix', 'runtime', 'install', '--no-audit', '--no-fund'], ROOT);
    if (!ok) {
      hadWarning = true;
      console.warn('[kara] warning: could not install runtime deps (ws). Run "kara doctor" for details.');
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'ui', 'node_modules', 'svelte'))) {
  if (IS_POSTINSTALL) {
    hadWarning = true;
    console.warn('[kara] warning: ui deps not installed — run "kara doctor" for details.');
  } else {
    const ok = run('npm', ['--prefix', 'ui', 'install', '--no-audit', '--no-fund'], ROOT);
    if (!ok) {
      hadWarning = true;
      console.warn('[kara] warning: could not install ui deps. Run "kara doctor" for details.');
    }
  }
}

if (!fs.existsSync(path.join(ROOT, 'ui', 'dist', 'index.html'))) {
  if (IS_POSTINSTALL) {
    hadWarning = true;
    console.warn('[kara] warning: ui/dist not found — run "kara doctor" for details.');
  } else {
    const ok = run('npm', ['--prefix', 'ui', 'run', 'build'], ROOT);
    if (!ok) {
      hadWarning = true;
      console.warn('[kara] warning: could not build ui/dist. Run "kara doctor" for details.');
    }
  }
}

if (hadWarning) {
  console.warn('[kara] preparation finished with warnings — run "kara doctor" to diagnose.');
} else if (fs.existsSync(path.join(ROOT, 'ui', 'dist', 'index.html'))) {
  console.log('[kara] environment ready (runtime deps, ui deps and ui/dist present)');
} else {
  console.log('[kara] preparation complete');
}
