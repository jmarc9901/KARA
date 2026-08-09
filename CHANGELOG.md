# Changelog

All notable changes to KARA.

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
