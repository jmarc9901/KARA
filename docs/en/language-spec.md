# KARA Language Specification

**Status:** Draft (v0.3)

## 1. Paradigm

KARA is a language with a mixed approach:

- **Declarative** for UI
- **Imperative** for logic
- **Reactive** for state
- **Strongly typed (dynamic at runtime, statically checked before execution)**
- **Component-based**
- **Multi-platform desktop** (web during development, native window via Tauri on desktop)

Inspirations: **SwiftUI + Flutter + QML + Svelte + Elm**, with its own syntax.

## 2. Basic syntax

### 2.1. Main program

A KARA file defines an app with the `App` keyword. `title` and `size` are
**required**; `theme` is optional (`"light"` or `"dark"`, default `"light"`).

```kara
App {
  title: "Demo"
  size: (400, 300)
  theme: "dark"

  // components…
}
```

### 2.2. Blocks

Blocks use `{ ... }`.

- Visual style similar to JSON.
- DSL semantics (not JSON):
  - `key: value` properties are allowed.
  - Components can be nested.
  - Values can be arbitrary expressions.

## 3. Types

### 3.1. Primitives

- `Int`
- `Float`
- `Bool`
- `Str` (string)
- `Any` (explicit dynamic escape hatch; static type checking is skipped)

### 3.2. Compounds

- **Tuple**: `(400, 300)` — used for `App.size`.
- **Array**: `[1, 2, 3]` — homogeneous element type is inferred when possible.
- **Function**: internal closures (no first-class function values yet).

> **Not implemented yet:** object literals (`{ field: value }`), maps and
> records are on the roadmap but not part of the grammar today.

## 4. Strong dynamic typing

The system is **dynamic at runtime**, with a **static pre-pass** before
execution. Valid examples:

```kara
let x = 5          // Int
let y = "hello"    // Str
let z = x + y      // Str: "+" concatenates when either operand is a Str
let d = 10 / 4     // Float: division always returns Float
```

Invalid example (caught at compile time):

```kara
let z = x * y    // error: cannot apply "*" to Int and Str
```

Errors detected by the static check (`TypeError`): arithmetic on incompatible
types, comparisons of different types, assignments with an incompatible type
and wrong arity in function calls.

## 5. Variables and state

### 5.1. Local variables

```kara
let x = 10
let y = x + 2
```

### 5.2. Reactive state

Inside a UI context:

```kara
state counter = 0
```

This exposes `counter` to the binding system.

### 5.3. Derived variables (dependency graph)

```kara
state base = 2

derived a = b + 1   // may reference variables declared LATER
derived b = c * 2
```

`derived` variables are ordered automatically by **dependency graph**
(topological sort): forward references work and the runtime evaluates them in
the correct order. Cycles are a compile error:

```kara
derived x = y + 1
derived y = x + 1   // error: circular derived dependency detected
```

## 6. Functions

```kara
fn max(a, b) {
  if (a > b) { return a }
  return b
}
```

- Default return: `null` when no `return` is executed.
- **Type annotations on parameters** (`fn f(x: Int)`) are *parsed* but not
  enforced yet — the compiler ignores them for type checking in v0.3.
  Tracking: ROADMAP Phase C.

## 7. Control flow

```kara
if (condition) { ... }
else if (other) { ... }
else { ... }

while (condition) { ... }

for (item in list) { ... }
```

## 8. String interpolation

```kara
Text { value: "Hello ${username}" }
```

## 9. UI components

### 9.1. Declarative style

```kara
Button {
  id: "save"
  text: "Save"
  onClick: save()
}
```

### 9.2. Hierarchy

The root is `App` (there is no `Window` widget — the app is the window):

```kara
App {
  title: "Demo"
  size: (400, 300)

  Column {
    Text { value: "Hello" }
    Button { id: "ok" text: "OK" onClick: ok() }
  }
}
```

### 9.3. Custom components

A component groups a reusable UI subtree with its own **props**, **local
state**, **derived** values and **fns**:

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

state extra = 10

Column {
  Item { title: "A", initial: 1 }   // own state per instance
  Item { title: "B", initial: extra }
}
```

Semantics:

- **Instances**: `Item { prop: <expr> }`. Prop values are **expressions**
  evaluated in the caller scope (they can reference App state).
- **Compile-time expansion**: each instance is expanded into the tree with
  unique names (`n$c0`, `n$c1`, ids `plus$c0`…), so every instance has
  isolated state and routes its events to itself.
- **Rules**: component names start with an uppercase letter, cannot collide
  with built-in components, props are read-only (assigning to a parameter is
  an error) and circular references between components are an error.
- **Known limitation**: inside a `for`, instances of the same component share
  local state (expansion happens once per static instance), same as widget ids
  are shared between iterations today.
- **No slots/children** in components yet (v0.2+).

## 10. Events

Events map to imperative blocks:

```kara
Button {
  id: "login"
  text: "Login"
  onClick: Auth(user, pass)
}
```

Bound widgets (`TextInput`, `Select`, `Slider`, `Checkbox`) additionally
support `onChange`, which runs **after** the bound variable is updated:

```kara
TextInput {
  id: "name"
  bind: name
  onChange: saved = name
}
```

## 11. Widgets

| Widget | Kind | Key props |
|---|---|---|
| `Column` | container | `spacing`, `padding`, `align` (`start\|center\|end\|stretch`) |
| `Row` | container | `spacing`, `padding`, `align` (`start\|center\|end\|stretch`) |
| `Text` | leaf | `value` **(required)**, `fontSize`, `color`, `bold`, `align` (`left\|center\|right`) |
| `Button` | leaf | `id` **(required)**, `text` **(required)**, `variant` (`primary\|secondary\|ghost`), `color` — requires `onClick` |
| `TextInput` | leaf | `id` **(required)**, `bind`, `placeholder`, `label`, `type` (`text\|password`) |
| `Checkbox` | leaf | `id` **(required)**, `bind`, `label` |
| `Select` | leaf | `id` **(required)**, `options` **(required, string list)**, `bind`, `label` |
| `Slider` | leaf | `id` **(required)**, `bind`, `label`, `min`, `max`, `step` |
| `Image` | leaf | `src` **(required)**, `width`, `height` |

Structural nodes in the UI tree: `if (cond) { ... } else { ... }` and
`for (item in array) { ... }`.

## 12. Builtins

| Builtin | Signature | Returns | Available |
|---|---|---|---|
| `Print(...)` | variadic | `Null` | always (runtime/playground console) |
| `Log(...)` | variadic | `Null` | always (alias of `Print`) |
| `Alert(...)` | variadic | `Null` | always (dialog) |
| `Random(a, b)` | `Int, Int` | `Int` | always |
| `Now()` | — | `Int` (epoch ms) | always |
| `Length(x)` | `Any` | `Int` | always (arrays and strings) |
| `Push(list, ...)` | `Array, Any` | `Array` | always (immutable) |
| `File.Read(path)` | `Str` | `Str` | **desktop runtime only** (Node) |
| `File.Write(path, data)` | `Str, Any` | `Null` | **desktop runtime only** (Node) |

> `File.Read`/`File.Write` are not available in the browser playground: the
> interpreter reports them as unavailable there. `Http.Get(url)` is on the
> roadmap (needs async support in the interpreter).

## 13. Project layout

```text
/src
  main.kara
  auth.kara
  views/
  components/
kara.config.json
```

### 13.1. Configuration

`kara.config.json` controls the project (`entry`, `outDir`, `port`). The CLI
resolves it by **walking up from the entry or the cwd**, so projects created
with `kara new` are self-contained:

```bash
kara new my-app
cd my-app && kara dev          # uses my-app/kara.config.json
kara dev ../other/src/main.kara  # uses other's config
```

### 13.2. Modules (`import`)

Imports go **before** `App {` and merge component/function definitions from
other `.kara` files:

```kara
import "./components/cards.kara"

App {
  ...
  Card { title: "A", initial: 1 }
}
```

Rules:

- A module file may only contain `component`, `fn` and other `import`
  definitions. No `App` block, no top-level `state`/`derived`.
- Resolution is **relative to the importing file**; imports are deduped and
  cycles (`a → b → a`) are safe.
- The runtime watches imported files for hot-reload.
- In the browser playground there is no file-system access: run with
  `kara dev`.

## 14. Example

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
