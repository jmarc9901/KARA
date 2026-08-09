# KARA — API Reference (v0.3)

> **Nota:** Documentación en español conservada como referencia secundaria y
> puede contener secciones desactualizadas. La versión vigente es la inglesa:
> `docs/en/api-reference.md`.

Referencia de widgets, props, builtins, keywords, CLI y tooling. La fuente de
verdad del schema de widgets es `COMPONENT_SCHEMA` en `compiler/src/parser.js`.

## 1. Widgets

### Contenedores

| Widget | Props | Notas |
|---|---|---|
| `Column` | `spacing` (num), `padding` (num), `align` (`start\|center\|end\|stretch`) | Layout vertical |
| `Row` | `spacing` (num), `padding` (num), `align` (`start\|center\|end\|stretch`) | Layout horizontal |

### Hojas

| Widget | Props | Notas |
|---|---|---|
| `Text` | `value` **(obligatorio)**, `fontSize`, `color`, `bold` (bool), `align` (`left\|center\|right`) | `value` admite interpolación `"Hola ${name}"` |
| `Button` | `id` **(obligatorio)**, `text` **(obligatorio)**, `variant` (`primary\|secondary\|ghost`), `color` | Requiere `onClick` |
| `TextInput` | `id` **(obligatorio)**, `bind`, `placeholder`, `label`, `type` (`text\|password`) | `bind` vincula un state; soporta `onChange` |
| `Checkbox` | `id` **(obligatorio)**, `bind`, `label` | Soporta `onChange` |
| `Select` | `id` **(obligatorio)**, `options` **(obligatorio, lista de strings)**, `bind`, `label` | `onChange` al cambiar |
| `Slider` | `id` **(obligatorio)**, `bind`, `label`, `min`, `max`, `step` | Emite `slider` → bind + `onChange` |
| `Image` | `src` **(obligatorio)**, `width`, `height` | |

### Handlers

- `onClick` — solo en `Button`. Recibe un bloque de statements.
- `onChange` — en `TextInput`, `Select`, `Slider` y `Checkbox`. Se ejecuta
  **después** de actualizar el `bind` vinculado.

### Contenedores estructurales en el árbol UI

- `if (cond) { ... } else { ... }` — condicional en la UI.
- `for (item in array) { ... }` — listas en la UI.

## 2. Builtins

| Builtin | Firma | Retorna | Disponible |
|---|---|---|---|
| `Print(...)` | variádico | `Null` | siempre (consola del runtime/playground) |
| `Log(...)` | variádico | `Null` | siempre (alias de `Print`) |
| `Alert(...)` | variádico | `Null` | siempre (diálogo) |
| `Random(a, b)` | `Int, Int` | `Int` | siempre |
| `Now()` | — | `Int` (epoch ms) | siempre |
| `Length(x)` | `Any` | `Int` | siempre (arrays y strings) |
| `Push(list, ...)` | `Array, Any` | `Array` | siempre (inmutable) |
| `File.Read(path)` | `Str` | `Str` | **solo runtime de escritorio** (Node) |
| `File.Write(path, data)` | `Str, Any` | `Null` | **solo runtime de escritorio** (Node) |

> En el playground (navegador) `File.Read`/`File.Write` reportan
> `[playground] "File.Read" no está disponible en el navegador — ejecuta con kara dev`.

> `Http.Get(url)` sigue en el roadmap (requiere soporte async en el intérprete).

## 3. Lenguaje

### Keywords
`App`, `component`, `fn`, `let`, `state`, `derived`, `if`, `else`, `while`,
`for`, `in`, `return`, `import`, `true`, `false`.

### Tipos (inferidos estáticamente)
`Int`, `Float`, `Bool`, `Str`, `Array`, `Any`, `Null`, `Unknown`.

### Módulos
```kara
import "./components/cards.kara"
import "./util.kara"

App {
  ...
}
```
- Los imports van **antes** de `App {`.
- Un archivo módulo solo puede contener definiciones `component` y `fn`
  (y otros `import`). No puede tener `App` ni `state`/`derived` de nivel superior.
- Resolución **relativa** al archivo que importa; los imports se deduplican y
  los ciclos son seguros (se ignoran).
- En el navegador (playground) no hay resolver de archivos: usa `kara dev`.

## 4. CLI

| Comando | Qué hace |
|---|---|
| `kara dev [entry]` | Construye la UI si falta y arranca el runtime (hot-reload de `.kara`) |
| `kara run [entry]` | Alias de `dev` |
| `kara build [entry]` | Compila el entry → `build/ast.json` (o `build/errors.json`) |
| `kara test` | Tests del compiler y del runtime (97 tests) |
| `kara doctor` | Diagnostica el entorno |
| `kara new <nombre>` | Crea un proyecto nuevo en `./<nombre>` |
| `kara lsp` | Lanza el language server por stdio |

Config: `kara.config.json` (`entry`, `outDir`, `port`).

## 5. Tooling

### LSP (`kara lsp`)
Servidor LSP **sin dependencias** (JSON-RPC 2.0 sobre stdio) con:

- **Diagnósticos en vivo** — cada error de compilación como diagnóstico.
- **Hover** — tipo inferido de `state`/`derived`, retorno de `fn`, props de
  widgets y firma de componentes personalizados.
- **Completado** — keywords, builtins, widgets, componentes del proyecto y
  props/handlers dentro del bloque de un widget.

Conecta cualquier cliente LSP: VS Code (extensión `kara-lang`), Neovim, etc.

### Errores de runtime
Los errores de runtime (p. ej. un `File.Read` con ruta inexistente) incluyen
`línea X, col Y` del fuente `.kara` (se anotan en el intérprete).

### Extensión VS Code
`vscode-kara/` — resaltado de sintaxis + cliente LSP (diagnósticos, hover,
autocompletado) + comandos **KARA: Run** y **KARA: New project**.
