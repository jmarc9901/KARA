# KARA Runtime

## Overview

The KARA runtime is a **three-layer architecture** (plus packaging) designed
to run cross-platform desktop applications.

**Stack:** Node + Web UI + Rust

> **Status (v0.3):** the Tauri shell (`src-tauri/`) launches the Node runtime
> as a child process and opens a native window pointing at
> `http://localhost:<port>`. `bundle.active = true` with generated icons;
> final packaging (embedded runtime in the binary) is still on the roadmap.
>
> **v0.3 adds:** modules/`import` (the runtime resolves imports relative to
> the entry), injected OS builtins (`File.Read`/`File.Write`) and timers
> (`SetTimeout`/`SetInterval`) via
> `program.extraBuiltins`, desktop only), `select`/`slider` events and the
> `onChange` handler, runtime errors with `line/col`, and an **LSP**
> (`kara lsp`) that reuses the compiler for diagnostics/hover/completion.

## Project configuration

The runtime resolves its configuration like this:

1. `KARA_CONFIG_PATH` (set by the CLI): the path of the project's
   `kara.config.json`.
2. If absent, `kara.config.json` at the framework root.

The CLI also passes `KARA_ENTRY` (absolute entry) and `KARA_PROJECT_ROOT`
(project root, where `outDir` and file watching are resolved).

## A. Execution flow

```text
kara source → Parser (JS/Rust) → AST JSON → Runtime (Node) → UI (Web) + OS APIs (Rust)
```

- The parser transforms `.kara` into an AST.
- The runtime evaluates the AST, manages state and runs functions.
- The UI renders in Web (chosen: Svelte) with reactive bindings.
- OS/FS APIs are implemented in Rust (Tauri).

## B. Technical layers

### 1. Parser

> **Note (v0.2):** the reference parser is the JS one (`compiler/`). The Rust
> parser (`parser/`) is a frozen snapshot emitting the same AST JSON; it is
> kept as reference/experimental and may lag behind features.

Responsible for:

- Lexer / parsing
- AST construction
- Syntax errors
- Symbol table
- Type inference
- Semantic errors
- AST serialization

Produces:

- `ast.json`
- Error report
- Symbol table
- Inferred types

### 2. Runtime (Node)

Responsible for:

- Loading the AST
- Evaluating expressions
- Running functions
- Reactive state management
- Connecting UI events with logic
- Orchestrating communication with Web and Rust

Communication:

- JSON messages over IPC (HTTP + WebSocket)

UI events → runtime:

- `click` (Button) → runs `onClick`
- `input` (TextInput) / `toggle` (Checkbox) / `select` (Select) / `slider`
  (Slider) → update the `bind` and run `onChange` when present

Runtime errors are annotated with the location in the `.kara` source
(`__karaLoc` in the interpreter) and sent as `RuntimeError` with line/column.

### 3. Render engine (Web)

- **Svelte** (chosen for easy reactive bindings and the declarative DSL).

Responsible for:

- Widget system
- Declarative rendering
- Event system
- Layout engine (`Column`, `Row`)
- Theming (`light`/`dark`)

### 4. Rust backend

Responsible for (roadmap):

- FS (initial: `File.Read`/`File.Write` done)
- OS APIs
- Trays
- Native menus
- Notifications
- Sandbox security

Packaging:

- **Tauri** as the packager.

## C. Standalone

Goal: produce standalone binaries:

- Windows: `.exe`
- macOS: `.app`
- Linux: ELF/AppImage

Without requiring Node to be installed on the end user's machine. Today the
runtime is launched as an external `node` process; embedding it in the binary
(or rewriting the interpreter in Rust) is the main packaging gap.

## Security note (v0.3)

The dev runtime binds to localhost and the Tauri CSP is `null` (the UI needs
inline styles). Treat `kara dev` as a local development server: any local
process could reach the WebSocket and drive the app. Do not expose the runtime
port on a network.
