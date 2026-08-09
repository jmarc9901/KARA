#!/usr/bin/env node
/**
 * KARA CLI — orquesta el toolchain.
 *
 *   kara dev      → construye la UI si hace falta y arranca el runtime (hot reload)
 *   kara run      → alias de `dev`
 *   kara build    → compila src/main.kara → build/ast.json (o build/errors.json)
 *   kara test     → ejecuta las suites del compiler y del runtime
 *   kara doctor   → diagnostica el entorno (node, dependencias, UI, cargo)
 *   kara help     → ayuda
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Resolve the project a command runs against.
 *
 * We walk up from the entry file (or the cwd) looking for the nearest
 * kara.config.json. Projects created with `kara new` are thus self-contained:
 * their own config controls entry/outDir/port, no matter where the CLI lives.
 */
function resolveProject(entryArg) {
  const cwd = process.cwd();
  const startDir = entryArg ? path.dirname(path.resolve(cwd, entryArg)) : cwd;
  const found = findConfig(startDir);
  return found ?? { dir: startDir, configPath: null, config: {} };
}

function findConfig(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    const p = path.join(dir, 'kara.config.json');
    if (fs.existsSync(p)) {
      return { dir, configPath: p, config: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function log(line = '') {
  console.log(line);
}

// ---------------------------------------------------------------------------
// kara build
// ---------------------------------------------------------------------------
async function cmdBuild(entryArg) {
  const project = resolveProject(entryArg);
  const entry = entryArg
    ? path.resolve(process.cwd(), entryArg)
    : path.resolve(project.dir, project.config.entry ?? 'src/main.kara');
  const outDir = path.resolve(project.dir, project.config.outDir ?? 'build');

  if (!fs.existsSync(entry)) {
    log(`error: entry file not found: ${entry}`);
    process.exit(1);
  }

  const { build, formatErrors } = await import('../compiler/src/index.js');
  const source = fs.readFileSync(entry, 'utf8');
  const result = await build(entry, outDir);

  if (result.ok) {
    log(`ok: wrote ${result.astPath}`);
    return;
  }
  log('compile errors:');
  log(formatErrors(result.errors, source));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// kara dev / kara run
// ---------------------------------------------------------------------------
async function cmdDev(entryArg) {
  const project = resolveProject(entryArg);
  const entry = entryArg
    ? path.resolve(process.cwd(), entryArg)
    : path.resolve(project.dir, project.config.entry ?? 'src/main.kara');
  process.env.KARA_ENTRY = entry;
  process.env.KARA_PROJECT_ROOT = project.dir;
  if (project.configPath) process.env.KARA_CONFIG_PATH = project.configPath;
  const uiDist = path.join(ROOT, 'ui', 'dist', 'index.html');
  if (!fs.existsSync(uiDist)) {
    log('ui/dist not found — building the UI first…');
    const r = spawnSync('npm', ['--prefix', 'ui', 'run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      log('error: could not build the UI. Fix the errors above and retry.');
      process.exit(1);
    }
  }
  // The runtime server starts, serves the built UI and watches src/*.kara.
  await import('../runtime/src/index.js');
}

// ---------------------------------------------------------------------------
// kara new
// ---------------------------------------------------------------------------
const NEW_TEMPLATE = `App {
  title: "My app"
  size: (400, 560)

  component Card(title, count) {
    Column {
      padding: 14
      spacing: 8
      Text { value: "📌 \${title}" bold: true fontSize: 18 }
      Text { value: "Clicks: \${count}" }
    }
  }

  state clicks = 0

  Column {
    padding: 20
    spacing: 14
    Text { value: "Hello KARA!" fontSize: 22 bold: true }
    Card { title: "Counter", count: clicks }
    Button { id: "inc" text: "Increment" onClick: clicks = clicks + 1 }
  }
}
`;

function cmdNew(name) {
  if (!name) {
    log('usage: kara new <name>');
    process.exit(1);
  }
  const dir = path.resolve(process.cwd(), name);
  if (fs.existsSync(dir)) {
    log(`error: "${name}" already exists at ${dir}`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'kara.config.json'),
    JSON.stringify({ name, entry: 'src/main.kara', outDir: 'build', port: 5179 }, null, 2) + '\n'
  );
  fs.writeFileSync(path.join(dir, 'src', 'main.kara'), NEW_TEMPLATE);
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}\n\nAn app created with KARA — the language and runtime for prototyping reactive UIs.\n\n\`\`\`bash\nkara dev\n\`\`\`\n`
  );
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\nbuild/\n');
  log(`ok: project "${name}" created at ${dir}`);
  log('To run it:');
  log(`  kara dev ${name}   (if kara is on your PATH: npm link at the KARA root)`);
  log(`  node ${path.relative(process.cwd(), path.join(ROOT, 'cli', 'kara.js'))} dev ${path.join(name, 'src', 'main.kara')}`);
}

// ---------------------------------------------------------------------------
// kara version
// ---------------------------------------------------------------------------
function cmdVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    log(`kara ${pkg.version}`);
  } catch {
    log('kara (version unknown)');
  }
}

// ---------------------------------------------------------------------------
// kara lsp
// ---------------------------------------------------------------------------
async function cmdLsp() {
  // IMPORTANT: the LSP protocol runs over stdout — never print to stdout here.
  process.stderr.write('KARA language server (LSP) — JSON-RPC 2.0 over stdio. Ctrl-C to exit.\n');
  await import('../compiler/src/lsp.js');
}

// ---------------------------------------------------------------------------
// kara test
// ---------------------------------------------------------------------------
function cmdTest() {
  const files = [
    'compiler/test/parser.test.js',
    'compiler/test/sema.test.js',
    'compiler/test/expand.test.js',
    'compiler/test/modules.test.js',
    'compiler/test/lsp.test.js',
    'runtime/test/interpreter.test.js',
    'runtime/test/builtins.test.js',
  ];
  const r = spawnSync(process.execPath, ['--test', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------------
// kara doctor
// ---------------------------------------------------------------------------
function cmdDoctor() {
  const project = resolveProject();
  const entry = path.resolve(project.dir, project.config.entry ?? 'src/main.kara');
  const outDir = path.resolve(project.dir, project.config.outDir ?? 'build');
  const problems = [];
  const ok = (label) => log(`  \u2714 ${label}`);
  const bad = (label) => {
    log(`  \u2718 ${label}`);
    problems.push(label);
  };

  log('KARA doctor');
  log('');

  log('node:');
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 20) ok(`node ${process.version} (>= 20.11 required)`);
  else bad(`node ${process.version} — upgrade to >= 20.11`);

  log('project:');
  if (project.configPath) ok(`config ${project.configPath}`);
  else log(`  \u26a0 no kara.config.json here — using defaults (project dir: ${project.dir})`);
  if (fs.existsSync(entry)) ok(`entry ${entry}`);
  else bad(`entry not found: ${entry}`);
  if (fs.existsSync(path.join(outDir, 'ast.json'))) ok(`last build in ${outDir}`);
  else log(`  \u26a0 no build yet — run \`kara build\``);

  log('dependencies:');
  const wsOk = ['', 'runtime'].some((sub) => {
    try {
      return Boolean(require.resolve('ws', { paths: [path.join(ROOT, sub)] }));
    } catch {
      return false;
    }
  });
  if (wsOk) ok('runtime deps installed (ws)');
  else bad('runtime deps missing — run: npm install (or: npm --prefix runtime install)');
  if (fs.existsSync(path.join(ROOT, 'ui', 'node_modules')))
    ok('ui deps installed (svelte/vite)');
  else if (fs.existsSync(path.join(ROOT, 'ui', 'dist', 'index.html')))
    ok('ui deps not installed, but ui/dist is pre-built (npm tarball)');
  else bad('ui deps missing — run: npm --prefix ui install');

  log('ui:');
  if (fs.existsSync(path.join(ROOT, 'ui', 'dist', 'index.html'))) ok('ui/dist built');
  else bad('ui/dist not built — run: npm --prefix ui run build');

  log('rust parser:');
  const cargo = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  if (cargo.status === 0) ok(`cargo ${cargo.stdout.trim()}`);
  else log(`  \u26a0 cargo not found — optional, only needed for parser/`);

  log('');
  if (problems.length) {
    log(`${problems.length} problem(s) detected.`);
    process.exit(1);
  }
  log('All set. Run: kara dev');
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------
function cmdHelp() {
  log(`KARA — a language and runtime for prototyping reactive desktop UIs

Usage:
  kara dev [entry]    Builds the UI if needed and starts the runtime (hot reload)
  kara run [entry]    Alias for dev
  kara build [entry]  Compiles the entry (.kara) to build/ast.json
  kara test           Runs the compiler and runtime test suites
  kara doctor         Diagnoses the environment
  kara new <name>     Creates a new project in ./<name>
  kara lsp            Starts the language server (LSP) over stdio
  kara version        Prints the KARA version
  kara help           Shows this help

Desktop (Tauri):
  npm run desktop:dev    native window that starts the local runtime
  npm run desktop:build  packages .exe/.app/AppImage

Examples:
  kara dev                      # default app of the current project
  kara dev examples/lista.kara
  kara new my-app && kara dev my-app

Config: kara.config.json (entry, outDir, port) — resolved from the nearest
project above the entry or the cwd.
`);
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------
const [cmd, arg1] = process.argv.slice(2);
switch (cmd) {
  case 'dev':
  case 'run':
    await cmdDev(arg1);
    break;
  case 'build':
    await cmdBuild(arg1);
    break;
  case 'test':
    cmdTest();
    break;
  case 'new':
    cmdNew(arg1);
    break;
  case 'version':
  case '--version':
  case '-v':
    cmdVersion();
    break;
  case 'doctor':
    cmdDoctor();
    break;
  case 'lsp':
    await cmdLsp();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    cmdHelp();
    break;
  default:
    log(`kara: unknown command "${cmd}"`);
    cmdHelp();
    process.exit(1);
}
