/**
 * KARA bootstrap (prepare/postinstall).
 *
 * The CLI needs `ws` (runtime), Svelte/Vite (ui) and a built ui/dist. Those
 * live in sub-packages, so a plain `npm i -g` would ship a broken CLI. This
 * script makes the package self-bootstrapping and idempotent:
 *
 *   1. install runtime deps if missing (ws)
 *   2. install ui deps if missing (svelte/vite)
 *   3. build ui/dist if missing
 *
 * Every step only runs when its output is absent, so local dev and CI stay
 * fast and installs never fail on already-prepared state.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`[kara] ${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const steps = [];
if (!fs.existsSync(path.join(ROOT, 'runtime', 'node_modules', 'ws'))) {
  steps.push(() => run('npm', ['--prefix', 'runtime', 'install', '--no-audit', '--no-fund'], ROOT));
}
if (!fs.existsSync(path.join(ROOT, 'ui', 'node_modules', 'svelte'))) {
  steps.push(() => run('npm', ['--prefix', 'ui', 'install', '--no-audit', '--no-fund'], ROOT));
}
if (!fs.existsSync(path.join(ROOT, 'ui', 'dist', 'index.html'))) {
  steps.push(() => run('npm', ['--prefix', 'ui', 'run', 'build'], ROOT));
}

if (steps.length === 0) {
  console.log('[kara] environment ready (runtime deps, ui deps and ui/dist present)');
} else {
  for (const step of steps) step();
  console.log('[kara] preparation complete');
}
