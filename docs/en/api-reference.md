# KARA — API Reference (v0.4)

Reference for widgets, props, builtins, keywords, CLI and tooling. The source
of truth for the widget schema is `COMPONENT_SCHEMA` in
`compiler/src/parser.js`.

## 1. Widgets

### Containers

| Widget | Props | Notes |
|---|---|---|
| `Column` | `spacing` (num), `padding` (num), `align` (`start\|center\|end\|stretch`) | Vertical layout |
| `Row` | `spacing` (num), `padding` (num), `align` (`start\|center\|end\|stretch`) | Horizontal layout |

### Leaves

| Widget | Props | Notes |
|---|---|---|
| `Text` | `value` **(required)**, `fontSize`, `color`, `bold` (bool), `align` (`left\|center\|right`) | `value` supports interpolation `"Hello ${name}"` |
| `Button` | `id` **(required)**, `text` **(required)**, `variant` (`primary\|secondary\|ghost`), `color` | Requires `onClick` |
| `TextInput` | `id` **(required)**, `bind`, `placeholder`, `label`, `type` (`text\|password`) | `bind` links a state; supports `onChange` |
| `Checkbox` | `id` **(required)**, `bind`, `label` | Supports `onChange` |
| `Select` | `id` **(required)**, `options` **(required, string list)**, `bind`, `label` | `onChange` on change |
| `Slider` | `id` **(required)**, `bind`, `label`, `min`, `max`, `step` | Emits `slider` → bind + `onChange` |
| `Image` | `src` **(required)**, `width`, `height` | |

### Handlers

- `onClick` — only on `Button`. Receives a statement or a block of statements.
- `onChange` — on `TextInput`, `Select`, `Slider` and `Checkbox`. Runs
  **after** updating the bound variable.

### Structural nodes in the UI tree

- `if (cond) { ... } else { ... }` — conditional UI.
- `for (item in array) { ... }` — lists in the UI.

## 2. App properties

| Prop | Type | Required | Notes |
|---|---|---|---|
| `title` | `Str` | yes | Window title |
| `size` | `(Int, Int)` | yes | `(width, height)` of the app window |
| `theme` | `"light" \| "dark"` | no | Default `"light"` |

## 3. Builtins

| Builtin | Signature | Returns | Available |
|---|---|---|---|
| `Print(...)` | variadic | `Null` | always (runtime/playground console) |
| `Log(...)` | variadic | `Null` | always (alias of `Print`) |
| `Alert(...)` | variadic | `Null` | always (dialog) |
| `Random(a, b)` | `Int, Int` | `Int` | always |
| `Now()` | — | `Int` (epoch ms) | always |
| `Length(x)` | `Any` | `Int` | always (arrays and strings) |
| `Push(list, ...)` | `Array, Any` | `Array` | always (immutable) |
| `Map(list, "fn")` | `Array, Str` | `Array` | always (calls a KARA fn by name) |
| `Filter(list, "fn")` | `Array, Str` | `Array` | always (calls a KARA fn by name) |
| `Reduce(list, "fn", init)` | `Array, Str, Any` | `Any` | always (calls a KARA fn by name) |
| `File.Read(path)` | `Str` | `Str` | **desktop runtime only** (Node) |
| `File.Write(path, data)` | `Str, Any` | `Null` | **desktop runtime only** (Node) |
| `SetTimeout(ms, "fn")` | `Int, Str` | `Null` | **desktop runtime only** (Node) |
| `SetInterval(ms, "fn")` | `Int, Str` | `Null` | **desktop runtime only** (Node) |

> `Map`/`Filter`/`Reduce` take the **name of a KARA function** as their second
> argument (functions are not first-class values yet):
> `Map(items, "double")`.

> In the playground (browser) `File.Read`/`File.Write`, `SetTimeout` and
> `SetInterval` report `[playground] "..." is not available in the browser —
> run with kara dev`.

> `Http.Get(url)` is on the roadmap (needs async support in the interpreter).

## 4. Language

### Keywords
`App`, `component`, `fn`, `let`, `state`, `derived`, `if`, `else`, `while`,
`for`, `in`, `return`, `import`, `true`, `false`.

### Types (statically inferred)
`Int`, `Float`, `Bool`, `Str`, `Array`, `Any`, `Null`, `Unknown`.

### Modules
```kara
import "./components/cards.kara"
import "./util.kara"

App {
  ...
}
```
- Imports go **before** `App {`.
- A module file may only contain `component` and `fn` definitions (and other
  `import`). No `App` block or top-level `state`/`derived`.
- Resolution is **relative** to the importing file; imports are deduped and
  cycles are safe (ignored).
- In the browser (playground) there is no file resolver: use `kara dev`.

## 5. CLI

| Command | What it does |
|---|---|
| `kara dev [entry]` | Builds the UI if needed and starts the runtime (hot reload of `.kara`) |
| `kara run [entry]` | Alias for `dev` |
| `kara build [entry]` | Compiles the entry → `build/ast.json` (or `build/errors.json`) |
| `kara test` | Runs the compiler + runtime suites; e2e and parity tests are separate scripts (`npm run test:e2e`, `npm run test:parity`) |
| `kara doctor` | Diagnoses the environment |
| `kara new <name>` | Creates a new project in `./<name>` |
| `kara lsp` | Starts the language server over stdio |
| `kara version` | Prints the KARA version |

Config: `kara.config.json` (`entry`, `outDir`, `port`).

## 6. Tooling

### LSP (`kara lsp`)
A **zero-dependency** language server (JSON-RPC 2.0 over stdio) with:

- **Live diagnostics** — every compile error as a diagnostic.
- **Hover** — inferred type of `state`/`derived`, `fn` returns, widget props
  and custom component signatures.
- **Completion** — keywords, builtins, widgets, project components and
  props/handlers inside a widget block.

Connects to any LSP client: VS Code (extension `kara-lang`), Neovim, etc.

### Runtime errors
Runtime errors (e.g. a `File.Read` on a missing path) include
`line X, col Y` from the `.kara` source (annotated in the interpreter).

### VS Code extension
`vscode-kara/` — syntax highlighting + LSP client (diagnostics, hover,
autocompletion) + commands **KARA: Run** and **KARA: New project**.
