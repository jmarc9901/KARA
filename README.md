# KARA

[![CI](https://img.shields.io/github/actions/workflow/status/jmarc9901/KARA/ci.yml?branch=main&label=CI)](https://github.com/jmarc9901/KARA/actions)
[![License](https://img.shields.io/github/license/jmarc9901/KARA?label=License)](https://github.com/jmarc9901/KARA/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=node.js&logoColor=white)](https://nodejs.org)

**KARA** is a **language and runtime for prototyping reactive desktop UIs** —
web during development, native window (Tauri) on desktop. It is a complete
learning project: a real compiler (lexer → parser → sema → typecheck),
interpreter, hot-reload and playground.

With KARA you write:

- **Declarative** UI based on components (**custom components** with their own state)
- **Imperative** logic
- **Reactive** state (`state` + `derived`, ordered by a **dependency graph**)
- Conditional rendering and lists in the UI (`if`/`for`)
- **Static type checking** with inference (Int, Float, Bool, Str, Array)
- **Modules** (`import "./file.kara"`) for reusable components and functions
- `Select`/`Slider` widgets and `onChange` handlers on bound widgets
- **Higher-order builtins** — `Map`/`Filter`/`Reduce` by function name — and
  **timers** (`SetTimeout`/`SetInterval`, desktop runtime)

Built-in tooling: **LSP** (`kara lsp`, zero dependencies), **VS Code
extension** with live diagnostics and autocompletion, a browser **playground**
with a reference tab, and runtime errors with line/column of the source.

> **Positioning:** `docs/en/positioning.md` explains who it is for, what it is
> not yet, and what is needed for production.

## Documentation

- `docs/en/language-spec.md` — language specification
- `docs/en/runtime.md` — runtime architecture
- `docs/en/api-reference.md` — widgets, props, builtins, CLI
- `docs/en/positioning.md` — who it is for and the honest competitive matrix
- `docs/es/` — Spanish translations of the same documents
- `ROADMAP.md` — v0.1 → v1.0 roadmap

## Playground 🚀

Try KARA in the browser **without installing anything**: with `kara dev`
running, open `http://localhost:5179/playground`. The playground compiles,
executes and shows errors live, all client-side.

## Getting started

Requirements: **Node.js ≥ 20.11** and **npm**.

To get `kara` on your PATH (local development):

```bash
npm install   # installs @tauri-apps/cli
npm link      # exposes `kara` globally (or: npm i -g .)
```

```bash
# 1. Install dependencies (runtime and UI)
npm --prefix runtime install
npm --prefix ui install

# 2. Compile the entry and generate build/ast.json
kara build

# 3. Start the runtime with hot-reload (builds the UI if needed)
kara dev
# → http://localhost:5179
```

If `kara` is not on your PATH, use `npm run dev` / `npm run build` from the
root.

## Custom components

```kara
component Item(title, initial) {
  state n = initial
  derived double = n * 2
  fn next() { return n + 1 }

  Column {
    Text { value: "🎯 ${title}" }
    Text { value: "n = ${n} · double = ${double}" }
    Button { id: "plus" text: "+1" onClick: n = next() }
  }
}

Column {
  Item { title: "A", initial: 1 }   // own state per instance
  Item { title: "B", initial: 10 }
}
```

Components are **expanded at compile time**: each instance gets unique names
(state `n$c0`, id `plus$c0`…), so they have isolated state and route their
events to themselves. Details and limitations in
`docs/en/language-spec.md` §9.3.

## Modules

```kara
import "./widgets.kara"   // only component/fn definitions

App {
  title: "Modules"
  size: (400, 480)

  Card { title: "A", initial: 1 }
}
```

Imports go **before** `App {`, resolve **relative to the importing file**, are
deduplicated and tolerate cycles. Full example: `examples/modulos.kara`.

## LSP and editor

- `kara lsp` serves a **zero-dependency language server** (live diagnostics,
  type hovers, prop autocompletion).
- The **VS Code extension** (`vscode-kara/`) consumes it: highlighting, live
  errors, autocompletion and `KARA: Run` / `KARA: New project` commands.

## Desktop (Tauri)

The `src-tauri/` shell opens a native window, launches the local Node runtime
and points the window at it. Prerequisites: `npm --prefix ui run build` and a
Rust toolchain ≥ 1.77.

```bash
npm install                # installs @tauri-apps/cli (root)
npm --prefix ui run build  # window UI
tauri dev                  # native window + hot-reload
# or package installers:
tauri build                # .exe / .app / AppImage
```

> The runtime is launched as an external `node` process; embedding Node in the
> binary is on the roadmap (`docs/en/positioning.md` §5).

## Rust parser

`parser/` emits the **same AST JSON** as the JS compiler — imports, custom
components, `Select`/`Slider`, `onChange` and `loc.index` in UTF-16 units all
match — verified by a CI parity test over every example, so the runtime can
consume `ast.json` unchanged.

```bash
cargo build --manifest-path parser/Cargo.toml
parser/target/debug/kara-parser src/main.kara build
```

> Note (Windows): if your `link.exe` fails with `link: extra operand`, build
> with the GNU toolchain: `cargo +stable-x86_64-pc-windows-gnu build --manifest-path parser/Cargo.toml`.

## CLI

| Command | What it does |
| --- | --- |
| `kara dev [entry]` | Builds the UI if needed and starts the runtime (hot-reload of `.kara`) |
| `kara run [entry]` | Alias of `dev` |
| `kara build [entry]` | Compiles the entry → `build/ast.json` (or `build/errors.json`) |
| `kara test` | Runs the compiler and runtime suites (102 tests; e2e and parity are `npm run test:e2e` / `npm run test:parity`) |
| `kara doctor` | Diagnoses the environment (node, deps, UI, cargo) |
| `kara new <name>` | Creates a new project in `./<name>` |
| `kara lsp` | Starts the language server (JSON-RPC 2.0 over stdio) |
| `kara version` | Prints the KARA version |

Examples: `kara dev` (default app), `kara dev examples/lista.kara`.

Configuration: `kara.config.json` (`entry`, `outDir`, `port`).

## Examples

- `examples/contador.kara` — counter with `derived` and `if/else`
- `examples/formulario.kara` — input binding, greeting derived value
- `examples/lista.kara` — lists with `for` and the `Push` builtin
- `examples/componentes.kara` — custom components with per-instance state
- `examples/modulos.kara` + `examples/widgets.kara` — `import` of components and functions
- `examples/tareas.kara` — todos with `Map`/`Filter`/`Reduce` and a `Slider` filter
- `examples/reloj.kara` — live clock with `SetInterval` (desktop runtime)

## Website

The framework website (landing page, docs, client-side playground) lives in
`website/` as a **zero-dependency static site** — extract it and deploy it to
GitHub Pages/Netlify as-is. Build the playground bundle with:

```bash
npm run web:build
```

## Repository structure

```text
/compiler   Lexer, parser, semantic analysis, typecheck and expansion (JS) + tests
/parser     Rust parser — in sync with the JS pipeline (CI parity test on every example)
/runtime    Interpreter + HTTP/WebSocket server (hot-reload)
/ui         Svelte render engine (widgets, themes, console, playground)
/website    Static framework website (landing, docs, browser playground)
/src-tauri  Tauri desktop shell (native window + local runtime)
/src        Demo app source in .kara
```

## Example

```kara
App {
  title: "Counter"
  size: (400, 300)

  state count = 0

  Column {
    Text { value: "Value: ${count}" }

    Button {
      id: "inc"
      text: "Increment"
      onClick: count = count + 1
    }
  }
}
```

## License & authorship

KARA is licensed under the **Apache License 2.0**. Created by
**Juan Marcos Bravo Medina (JMarc)** — see [NOTICE](NOTICE) and
[LICENSE](LICENSE).
