# ROADMAP — KARA (v0.3 → v1.0)

> Strategic context: `docs/en/positioning.md`. The priority is not adding more
> language features but closing the gaps between KARA and "a tool developers
> choose": packaging, components, tooling and ecosystem.

## CURRENT STATE (v0.3) ✔

- Complete JS compiler: lexer, parser with error recovery, sema, static
  typechecking with inference
- **Custom components** with props, local state, `derived` and `fn`
  (compile-time expansion, per-instance state) ✔
- `derived` ordered by **dependency graph** (forward refs + cycle detection) ✔
- **Self-contained projects**: the CLI resolves `kara.config.json` by
  cwd/entry; `kara new` generates runnable projects ✔
- Client-side playground, hot-reload, CLI (`dev/build/test/doctor/new/version`),
  CI ✔
- **Tauri desktop shell** (native window + local runtime) ✔
- 100 tests, docs (EN + ES), examples, website ✔
- **Apache-2.0 license** with authorship NOTICE ✔
- **English-first docs, CLI, UI and examples** ✔

## PHASE A — REAL PACKAGING

**Goal:** `tauri build` produces installers an end user can actually run.

- [ ] Embed the Node runtime in the binary (or rewrite the interpreter in Rust)
- [x] OS builtins via Tauri commands: **FS done** (`File.Read`/`File.Write`);
      pending: dialogs (`OpenFile`/`SaveFile`), notifications, tray, menus
- [x] Icons and bundle metadata (win/mac/linux) — `npm run icons` + `bundle.active`
- [ ] Manual verification of installers on the 3 OSes

## PHASE B — TOOLING

**Goal:** first-class DX for anyone writing `.kara`.

- [x] **LSP** (live diagnostics, type hovers, prop autocompletion) — `kara lsp`,
      zero dependencies
- [x] Complete VSCode extension (live diagnostics + hover + completion +
      run/new commands)
- [ ] Basic debugger / step in the playground

## PHASE C — LANGUAGE (with caution)

**Goal:** the minimum for medium apps, without inflating the grammar.

- [x] Modules / multi-file (`import`), reusing the current pipeline
- [ ] Slots/children in components
- [ ] Additional events (`onChange` done; pending `onSubmit`, keyboard, timers)
- [ ] Enforce type annotations on parameters (`fn f(x: Int)`)

## PHASE D — ECOSYSTEM

**Goal:** a minimal community exists.

- [ ] Publish the **ready** npm package (`kara-lang`, self-bootstrapping);
      `npm publish` is pending (credentials)
- [ ] Live docs site + 3–5 tutorials + "wow" examples
- [ ] Publish the VSCode extension to the Marketplace
- [ ] GitHub org + live badges (repo not public yet)

## DO NOT (for now)

- Do not duplicate the parser in Rust until the language stabilizes (frozen)
- Do not promise "multi-platform desktop" without verified installers
- Do not compete on features with mature frameworks
