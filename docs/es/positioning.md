# Posicionamiento de KARA (¿para qué existe y quién lo usaría?)

> **Nota:** Documentación en español conservada como referencia secundaria y
> puede contener secciones desactualizadas. La versión vigente es la inglesa:
> `docs/en/positioning.md`.

Este documento es el *pitch* honesto de KARA: qué es, qué no es, a quién va
dirigido y qué hay que construir para que sea una herramienta que los devs
elijan.

## 1. La verdad sobre el producto

KARA hoy es:

- Un **DSL declarativo reactivo** (`state` + `derived` + componentes) con un
  compiler real (lexer → parser → sema → typecheck), intérprete, hot-reload,
  playground y un shell de escritorio Tauri.
- Una **pieza didáctica** excelente: en ~4.000 líneas demuestra cómo se
  construye un lenguaje de verdad.

KARA **no es todavía** un competidor de Electron/Tauri/Flutter para apps
desktop de producción: la UI se ejecuta en un webview servida por un runtime
Node, los builtins de OS (FS, tray, dialogs) están en el roadmap, y el
ecosistema (paquetes, plugins, LSP) no existe.

**Recomendación:** no competir con los frameworks establecidos. Posicionar KARA
en el nicho donde puede ganar:

> **Un lenguaje mínimo y legible para prototipar UIs reactivas de escritorio,
> con un playground instantáneo — para aprender, para hackear y para construir
> demos de escritorio en minutos.**

## 2. Usuarios objetivo (por prioridad)

1. **Devs que aprenden compiladores/lenguajes.** KARA es un caso de estudio
   completo y funcional: pipeline de compilación, inferencia de tipos,
   intérprete, hot-reload, tests y CI. El repo es la documentación.
2. **Prototipadores.** Alguien que quiere una ventana con UI reactiva en 30
   segundos sin montar un proyecto Svelte/Electron entero: `kara new demo &&
   kara dev`.
3. **Educadores.** Un lenguaje pequeño, tipado, con errores legibles, ideal
   para primeros contactos con programación declarativa.

## 3. Matriz competitiva honesta

| Necesidad | Mejor opción hoy | KARA |
|---|---|---|
| App desktop de producción | Tauri / Electron | ✗ |
| UI reactiva web | Svelte / React | ✗ (usar Svelte) |
| Prototipo desktop en minutos | — | ✓ (niche propio) |
| Aprender compiladores | textbook / cursos | ✓ (repositorio completo) |
| Extensión con DSL propio | — | ✓ (pipeline de props/componentes extensible) |

## 4. Decisiones estratégicas (y por qué)

- **No reimplementar Svelte.** La UI se renderiza con Svelte por debajo; el
  valor de KARA es el **lenguaje**, no el renderer.
- **Componentes por expansión en compilación** (v0.2): estado por instancia,
  sin máquina de runtime compleja.
- **Parser Rust congelado a snapshot** del pipeline JS: mantener dos parsers
  duplica cada cambio de sintaxis. Se reactivará solo si se necesita velocidad
  nativa o un LSP en Rust.
- **Tauri como shell de escritorio** (no Electron): binarios más ligeros y el
  camino natural a `.exe`/`.app`/AppImage.

## 5. Qué falta para que un dev lo use de verdad (en orden)

**Hecho (v0.3):**

1. **LSP** (diagnósticos en vivo, hover, autocompletado de props) ✔
   (`kara lsp`, cero dependencias; la extensión VS Code lo consume).
2. **Módulos / multi-archivo** (`import`) ✔
3. **Builtins de OS iniciales** (FS) vía `File.Read`/`File.Write` ✔ (solo
   runtime de escritorio).
4. **Preparación para publicar npm** ✔ (paquete `kara-lang` auto-bootstrappable;
   falta `npm publish` con cuenta/credenciales).
5. **Empaquetado Tauri configurado** ✔ (`bundle.active = true` + iconos
   generados); falta **verificar instalables en los 3 SO** y **embeber Node**
   en el binario (hoy se lanza `node` externo).

**Pendiente:**

- Embeber el runtime Node en el binario (o reescribir el intérprete en Rust).
- Ecosistema: publicar en el registry npm, web de docs, tutoriales y 3-5
  ejemplos "wow", extensión en el Marketplace, badges reales (`:owner/:repo`).
- Más builtins de OS (dialogs, notificaciones, tray, menús) vía Tauri commands.
- Debugger/step en el playground y source maps de runtime.

## 6. Qué NO hacer

- No añadir más keywords por añadir: cada gramática extra es superficie.
- No duplicar el parser en Rust hasta que el lenguaje se estabilice.
- No prometer "multiplataforma desktop" sin instalables verificados en los 3 OS.
- No competir en features con frameworks maduros: ganar en **simplicidad** y
   **legibilidad**, no en catálogo.
