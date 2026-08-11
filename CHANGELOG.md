# Changelog

All notable changes to KARA.

## [0.4.0] — 2026-08-10

### Language
- **Higher-order builtins**: `Map(list, "fn")`, `Filter(list, "fn")` and
  `Reduce(list, "fn", initial)` call KARA functions by **name** (functions are
  not first-class values yet). They are pure and work in the browser playground.
- **Timers**: `SetTimeout(ms, "fn")` and `SetInterval(ms, "fn")` schedule a KARA
  function on the server event loop (desktop runtime only; the playground
  reports them as unavailable). Timers are cleared and re-created on hot-reload.
- **New examples**: `examples/reloj.kara` (live clock with `SetInterval`) and
  `examples/tareas.kara` (todos with `Map`/`Filter`/`Reduce` + `Slider`).

### Tooling
- **Rust parser in sync with the JS compiler**: `import`/modules, custom
  components, `Select`/`Slider`, `onChange`, `strArray` (`options`) and the
  `components`/`imports` AST fields. `loc.index` counts UTF-16 units so the
  emitted AST JSON is **identical** to the JS parser (verified by a new parity
  test over every example, enforced in CI).
- **E2E runtime test** (`npm run test:e2e`): boots the real server and drives
  the WebSocket protocol — clicks, timers and hot-reload.
- **CI**: new parity (JS ↔ Rust) and e2e steps.

### Packaging
- Version **0.4.0** everywhere (package, Tauri, Cargo, CITATION, LSP).

## [0.3.0] — 2026-08-08

### Language
- **Modules / `import`**: `import "./file.kara"` merges component and function
  definitions from other files. Relative resolution, dedupe and cycle safety.
  The runtime watches imported files.
- **OS builtins**: `Log(...)`, `File.Read(path)` and `File.Write(path, data)`
  (`File.*` are desktop-runtime only; the playground reports them as
  unavailable).
- **New widgets**: `Select` (with `options`) and `Slider` (`min`/`max`/`step`).
- **`onChange` handler**: on `TextInput`, `Select`, `Slider` and `Checkbox`;
  runs after the `bind` is updated.
- **Located runtime errors**: execution errors now carry `line X, col Y` from
  the `.kara` source.
- **Runtime robustness**: division/modulo by zero throw a located runtime
  error, and state-initializer errors no longer crash the dev server.

### Tooling
- **LSP** (`kara lsp`): zero-dependency server with live diagnostics, type
  hovers and autocompletion (keywords, builtins, widgets, props).
- **VS Code extension** v0.3: integrated LSP client (live diagnostics, hover,
  autocompletion) + `KARA: Run` and `KARA: New project` commands.
- **Playground**: new *Reference* tab (widgets/props/builtins) and presets
  with `Select`/`Slider`.
- **CLI**: new `kara version` command.

### Packaging & branding
- **npm**: the root package is `kara-lang` and self-prepares
  (`prepare`/`postinstall`) by installing `runtime`/`ui` deps and building
  `ui/dist` — ready for `npm i -g`.
- **Tauri**: `bundle.active = true` with generated icons
  (`npm run icons` → `tauri icon`). Installers pending verification on the 3
  OSes (requires embedding Node in the binary).
- **License**: moved to **Apache-2.0** with authorship NOTICE
  (Juan Marcos Bravo Medina).
- **i18n**: docs, CLI, UI, examples and error messages are now
  **English-first**, with Spanish docs kept under `docs/es/`.
- **Website**: static zero-dependency site in `website/` (landing, docs,
  client-side playground) — build the bundle with `npm run web:build`.

### Tests
- 75 → **100 tests**: new suites `compiler/test/modules.test.js` and
  `runtime/test/builtins.test.js`, plus division/modulo-by-zero coverage.
  `kara test` and CI include them.

## [0.2.0] — earlier
- Complete compiler (lexer → parser → sema → typecheck with inference).
- Custom components with per-instance state (compile-time expansion).
- `derived` ordered by dependency graph (forward refs + cycle detection).
- Client-side playground, hot-reload, CLI (`dev/build/test/doctor/new`), CI.
- Tauri desktop shell (native window + local runtime).
