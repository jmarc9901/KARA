# KARA Positioning (why it exists and who would use it)

This document is KARA's honest pitch: what it is, what it is not, who it is
for, and what must be built for developers to actually choose it.

## 1. The truth about the product

KARA today is:

- A **declarative reactive DSL** (`state` + `derived` + components) with a
  real compiler (lexer → parser → sema → typecheck), interpreter, hot-reload,
  playground and a Tauri desktop shell.
- An **excellent teaching artifact**: in ~4,000 lines it demonstrates how a
  real language is built.

KARA is **not yet** a production competitor for Electron/Tauri/Flutter: the UI
runs in a webview served by a Node runtime, OS builtins (FS, tray, dialogs)
are partially done, and there is no ecosystem (packages, plugins, LSP beyond
the built-in one).

**Recommendation:** do not compete with established frameworks. Position KARA
in the niche where it can win:

> **A minimal, readable language for prototyping reactive desktop UIs, with an
> instant playground — for learning, for hacking, and for building desktop
> demos in minutes.**

## 2. Target users (by priority)

1. **Developers learning compilers/languages.** KARA is a complete, working
   case study: compilation pipeline, type inference, interpreter, hot-reload,
   tests and CI. The repo is the documentation.
2. **Prototypers.** Someone who wants a window with a reactive UI in 30
   seconds without setting up a full Svelte/Electron project: `kara new demo
   && kara dev`.
3. **Educators.** A small, typed language with readable errors, ideal for a
   first contact with declarative programming.

## 3. Honest competitive matrix

| Need | Best option today | KARA |
|---|---|---|
| Production desktop app | Tauri / Electron | ✗ |
| Reactive web UI | Svelte / React | ✗ (use Svelte) |
| Desktop prototype in minutes | — | ✓ (own niche) |
| Learning compilers | textbooks / courses | ✓ (complete repository) |
| Extension with your own DSL | — | ✓ (extensible props/component pipeline) |

## 4. Strategic decisions (and why)

- **Do not reimplement Svelte.** The UI renders with Svelte underneath; the
  value of KARA is the **language**, not the renderer.
- **Components via compile-time expansion** (v0.2): per-instance state, no
  complex runtime machine.
- **Rust parser frozen to a snapshot** of the JS pipeline: maintaining two
  parsers doubles every syntax change. It will be revived only if native
  speed or a Rust LSP is needed.
- **Tauri as the desktop shell** (not Electron): lighter binaries and the
  natural path to `.exe`/`.app`/AppImage.

## 5. What a developer needs to actually use it (in order)

**Done (v0.3):**

1. **LSP** (live diagnostics, hover, prop autocompletion) ✔
   (`kara lsp`, zero dependencies; the VS Code extension consumes it).
2. **Modules / multi-file** (`import`) ✔
3. **Initial OS builtins** (FS) via `File.Read`/`File.Write` ✔ (desktop
   runtime only).
4. **npm package ready** ✔ (`kara-lang`, self-bootstrapping; needs
   `npm publish` with credentials).
5. **Tauri packaging configured** ✔ (`bundle.active = true` + generated
   icons); still pending: **verify installers on the 3 OSes** and **embed
   Node** in the binary (today an external `node` is launched).
6. **English-first documentation and website** ✔ (`docs/en/`, `website/`).
7. **Apache-2.0 license with authorship NOTICE** ✔.

**Pending:**

- Embed the Node runtime in the binary (or rewrite the interpreter in Rust).
- Ecosystem: publish on npm, live docs site, 3–5 "wow" examples, VS Code
  Marketplace release, real badges (repo not public yet).
- More OS builtins (dialogs, notifications, tray, menus) via Tauri commands.
- Debugger/step in the playground and runtime source maps.

## 6. What NOT to do

- Do not add keywords for the sake of it: every extra grammar rule is
  surface area.
- Do not duplicate the parser in Rust until the language stabilizes.
- Do not promise "multi-platform desktop" without verified installers on the
  3 OSes.
- Do not compete on features with mature frameworks: win on **simplicity** and
  **readability**, not catalog size.
