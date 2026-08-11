# KARA Launch Kit

Everything you need to announce KARA. Copy, paste, ship. Keep it honest — the
community rewards authenticity over hype.

## Quick facts (for bios and intros)

- **What**: a tiny declarative reactive language for prototyping desktop UIs
- **One-liner**: "Write interfaces in plain text — get a live preview in 30 seconds"
- **Try it now** (no install): https://jmarc9901.github.io/KARA/playground.html
- **Repo**: https://github.com/jmarc9901/KARA
- **npm**: `npm install -g kara-lang && kara new my-app && cd my-app && kara dev`
- **License**: Apache-2.0 · by Juan Marcos Bravo Medina (JMarc)

---

## 1. Hacker News — "Show HN"

**Title**: Show HN: KARA – a tiny reactive UI language with a real compiler and a browser playground

**Body**:

> I built KARA: a small language for prototyping reactive desktop UIs.
>
> ```text
> App {
>   title: "Counter"
>   state count = 0
>   derived even = count % 2 == 0
>   Button { id: "inc" text: "+" onClick: count = count + 1 }
> }
> ```
>
> It's not a wrapper around another framework. It's a genuine language pipeline:
>
> - lexer → parser (error recovery) → semantic analysis → static type inference → component expansion
> - reactive `state` + `derived` backed by a real dependency graph (forward refs work, cycles are compile errors)
> - zero-dependency LSP (diagnostics, type hovers, completion) + a VS Code extension
> - a tree-walker interpreter with hot-reload and a Tauri desktop shell
> - everything runs **client-side in your browser** — the playground below compiles and interprets real KARA:
>
> [playground link]
>
> Why? I wanted a language that shows the *whole* compiler story in a few thousand
> readable lines, and lets you build something visible (a desktop UI) while you
> learn. No runtime magic, no hidden framework.
>
> 100 tests, Apache-2.0, docs in English and Spanish. The positioning doc is
> honest about what it isn't: it won't replace Tauri/Electron/Flutter — it owns
> the "desktop prototype in minutes" and "learn compilers by building" niches.
>
> Would love feedback on the language design and the docs.

---

## 2. Reddit — r/ProgrammingLanguages

**Title**: I wrote a tiny reactive UI language with a real compiler pipeline — feedback wanted

**Body**:

> I've been working on KARA, a DSL for prototyping reactive desktop UIs. The
> interesting part (for this subreddit) is that it's a complete, readable
> compiler in ~3,300 lines of dependency-free JS:
>
> - lexer → parser with error recovery → semantic analysis → static type
>   inference (Int/Float/Bool/Str/Array) → component expansion at compile time
> - per-instance component state via compile-time name mangling
> - `derived` values ordered by topological sort with forward references and
>   cycle detection at compile time
> - a zero-dependency LSP (JSON-RPC 2.0) with live diagnostics, type hovers and
>   completion
>
> I deliberately kept it dependency-free so it's easy to read top to bottom.
> There's also a browser playground where the whole compiler + interpreter run
> client-side: [link]
>
> The docs include an honest positioning note about the niche (prototyping +
> learning compilers, not production desktop apps).
>
> Questions I'd love input on:
> - Is the syntax readable enough for a "declarative UI" audience?
> - Would you structure the pipeline differently?
> - What's the one feature you'd add first (modules are already in, next: timers/Windows)?

---

## 3. X / Twitter (thread)

Tweet 1:
> I built a programming language in my spare time. It compiles, type-checks, and
> runs reactive desktop UIs — in your browser, no install. Meet KARA 🎉
> [playground link]

Tweet 2:
> The pitch: declarative UI + imperative logic + reactive state with a real
> dependency graph. 30 seconds from zero to a live preview.
> `npm install -g kara-lang && kara new my-app && kara dev`

Tweet 3:
> What I'm most proud of: a zero-dependency LSP (diagnostics, hover, completion)
> and a full pipeline — lexer → parser → sema → type inference → expansion —
> readable in ~3.3k lines. I wanted it to be a *learning* language, not a mystery.
> [repo link]

Tweet 4:
> Honest positioning: it's NOT a Tauri/Electron/Flutter killer. It owns two
> niches — prototyping desktop UIs in minutes, and learning how compilers work by
> reading one. Apache-2.0, 100 tests, docs in EN + ES.
> [repo link]

---

## 4. LinkedIn

> Excited to share a side project I've been building: **KARA**, a tiny
> declarative reactive language for prototyping desktop UIs.
>
> The goal was to build a *complete* language — compiler, type system, runtime,
> language server, editor extension and a browser playground — that's small
> enough to read in an evening. It compiles and runs fully in the browser; a
> Tauri shell takes the same program to a native window.
>
> ▶ Try it live: [playground link]
> 📦 npm: `npm install -g kara-lang`
> 🔗 Repo: [repo link]
>
> Built with a real pipeline (lexer → parser → semantic analysis → static type
> inference → component expansion), a zero-dependency LSP, and 100 passing
> tests. Apache-2.0, docs in English and Spanish.
>
> Feedback and PRs are very welcome!

---

## 5. Weekly cadence (6 weeks)

| Week | Action |
| ---- | ------ |
| 1 | Post HN + r/ProgrammingLanguages + X thread. Reply to every comment. |
| 2 | npm publish + announce on X. Add 2 new examples to the repo. |
| 3 | r/rust + r/desktoplinux cross-posts. Blog post: "How KARA's compiler works in 3,300 lines". |
| 4 | GitHub Discussions kickoff ("what should v0.4 add?"). First contributor issue. |
| 5 | v0.4 release with 1 new builtin + changelog. Post release notes on X. |
| 6 | Review: stars, issues, PRs. Write "KARA: lessons from month one" — post on dev.to. |

Rule of thumb: **every comment gets an answer within 24h**, and **every week
ships something visible** (example, doc, builtin, fix).

---

## 6. Screenshots that work

- The hero demo on the landing page (animated counter with Even/Odd)
- The playground with Console + AST tabs open
- `kara doctor` green output
- The VS Code extension showing diagnostics + hover

---

## 7. Publicaciones en español — YouTube Shorts · YouTube · LinkedIn · Threads · X · Facebook

Enlaces que puedes pegar en cualquier texto:

- Playground (sin instalar nada): https://jmarc9901.github.io/KARA/playground.html
- Repo: https://github.com/jmarc9901/KARA
- Web: https://jmarc9901.github.io/KARA/
- Instalar: `npm install -g kara-lang && kara new my-app && cd my-app && kara dev`

### La verdad sobre KARA (úsala como guía en todos los textos)

**Qué es:** un lenguaje pequeño para prototipar interfaces de escritorio con
vista previa instantánea. Tiene un pipeline de compilación real — lexer,
parser con recuperación de errores, análisis semántico, inferencia de tipos y
expansión de componentes — en ~3.500 líneas de JavaScript sin dependencias
(compilador + intérprete; el parser en Rust añade ~2.000 líneas más).
Incluye intérprete con hot-reload, `state`/`derived` con grafo de
dependencias, componentes con estado por instancia, módulos, un LSP sin
dependencias, una extensión de VS Code y un playground que compila y ejecuta
todo en el navegador, sin servidor. 103 tests, Apache-2.0, docs EN + ES.

**Qué NO es (ser honesto suma, no resta):** no es un framework de producción
ni compite con Tauri, Electron, Svelte o React. El shell de escritorio (Tauri)
todavía necesita Node instalado — los ejecutables no son autónomos aún. No
tiene debugger, ni object literals, ni funciones de primera clase, ni async.
Su nicho es doble: prototipar una UI de escritorio en minutos, y aprender cómo
funciona un compilador leyendo uno real de principio a fin.

**El origen (una línea, con dignidad):** lo construí desde Cuba, donde la
conexión va y viene; por eso todo corre en tu máquina, sin depender de la red.

### 7.1 YouTube Shorts (~45 s, vertical)

**Título:** Hice un lenguaje de programación en miniatura (y te enseño qué NO es)

**Guion con planos:**

| Tiempo | Plano | Voz |
|---|---|---|
| 0-3 s | Manos tecleando, fondo sencillo | "No hay empresa ni equipo: solo yo y mi laptop." |
| 3-10 s | Playground: escribir 5 líneas y ver la UI | "Construí un lenguaje de programación: KARA. Compilador de verdad, en miniatura." |
| 10-20 s | La UI reacciona al teclear | "Declaras la interfaz, escribes la lógica, el estado es reactivo. Todo compila e interpreta en tu navegador." |
| 20-30 s | Pestaña AST + error con línea y columna | "Tiene lexer, parser, análisis semántico e inferencia de tipos — como los grandes, pero en ~3.500 líneas que se leen de principio a fin." |
| 30-38 s | kara dev + hot-reload | "También corre en tu máquina con hot-reload. Funciona sin internet — lo hice en Cuba, donde la conexión va y viene." |
| 38-45 s | Repo y playground en pantalla | "Es open source. Si quieres ver un compilador por dentro, este es un buen punto de partida. Enlace en la descripción." |

**Descripción:**
> KARA es un lenguaje pequeño para prototipar interfaces de escritorio con
> vista previa instantánea. Compilador real (lexer → parser → semántica →
> tipos → expansión de componentes) en ~3.500 líneas de JS sin dependencias,
> intérprete con hot-reload, LSP y playground 100% en el navegador.
>
> No es un framework de producción: es para prototipar en minutos y para
> aprender compiladores leyendo uno. El shell Tauri aún necesita Node.
>
> 103 tests · Apache-2.0 · docs en español e inglés. Lo hice desde Cuba, donde
> la conexión va y viene — por eso todo corre local.
>
> ▶ Pruébalo: https://jmarc9901.github.io/KARA/playground.html
> 📦 `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 https://github.com/jmarc9901/KARA
>
> #programacion #lenguajedeprogramacion #compilador #opensource

### 7.2 YouTube (video completo, 2-4 min)

**Título:** Construí un lenguaje de programación en miniatura — KARA (y qué NO es)

**Descripción:**
> KARA es un lenguaje que hice para prototipar interfaces de escritorio con
> vista previa instantánea: declarativo para la UI, imperativo para la
> lógica, reactivo para el estado.
>
> Lo interesante es que no es un juguete sintáctico: hay un pipeline de
> compilación real detrás (lexer → parser con recuperación de errores →
> análisis semántico → inferencia de tipos → expansión de componentes),
> un intérprete con hot-reload, componentes con estado por instancia,
> módulos con import, un LSP sin dependencias y una extensión de VS Code.
> El playground compila y ejecuta todo en el navegador, sin servidor.
>
> También quiero ser claro sobre lo que no es: no es un framework de
> producción, no compite con Tauri/Electron/Svelte/React, y el shell de
> escritorio aún necesita Node instalado. Es una herramienta para prototipar
> y para aprender cómo funciona un compilador leyendo uno.
>
> Lo desarrollé desde Cuba, donde la conexión va y viene: por eso todo corre
> localmente. 103 tests, Apache-2.0, documentación en español e inglés.
>
> ▶ Pruébalo: https://jmarc9901.github.io/KARA/playground.html
> 📦 `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 https://github.com/jmarc9901/KARA
>
> Guion sugerido: 1) qué es KARA (30 s) · 2) el pipeline real, recorrido por el
> código (60 s) · 3) demo en el playground (60 s) · 4) componentes, módulos y
> derived (45 s) · 5) límites honestos: qué no hace (30 s) · 6) cierre (15 s).
>
> #programacion #lenguajedeprogramacion #compilador #opensource

### 7.3 LinkedIn

> He construido **KARA**: un lenguaje en miniatura, pero real, para prototipar
> interfaces de escritorio con vista previa instantánea.
>
> Detrás hay un pipeline de compilación completo en ~3.500 líneas de
> JavaScript sin dependencias: lexer, parser con recuperación de errores,
> análisis semántico, inferencia de tipos y expansión de componentes. Incluye
> intérprete con hot-reload, `derived` ordenados por grafo de dependencias,
> componentes con estado por instancia, módulos, un LSP sin dependencias, una
> extensión de VS Code y un playground que compila y ejecuta todo en el
> navegador.
>
> Quiero ser explícito sobre qué no es: no es un framework de producción y no
> compite con Tauri, Electron, Svelte o React. El shell de escritorio (Tauri)
> aún requiere Node instalado. Es una herramienta para dos cosas: prototipar
> una UI de escritorio en minutos, y aprender cómo funciona un compilador
> leyendo uno real. Prefiero decir esto claramente a venderlo como algo que
> no es.
>
> 103 tests · Apache-2.0 · documentación en español e inglés. Lo desarrollé
> desde Cuba, donde la conexión va y viene: por eso todo corre localmente.
>
> ▶ Pruébalo: https://jmarc9901.github.io/KARA/playground.html
> 📦 `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 https://github.com/jmarc9901/KARA
>
> ¿Preguntas, críticas o sugerencias? Son bienvenidas.

### 7.4 Threads

> Hilo: construí un lenguaje de programación en miniatura, y hoy te cuento qué
> hace de verdad y qué no hace 🧵
>
> 1/4 Se llama **KARA** y es para prototipar interfaces de escritorio: declaras
> la UI, escribes la lógica, el estado es reactivo. Compila e interpreta todo
> en tu navegador, sin servidor. Pruébalo 👉
> https://jmarc9901.github.io/KARA/playground.html
>
> 2/4 Lo que tiene de interesante es el pipeline real: lexer, parser con
> recuperación de errores, análisis semántico, inferencia de tipos y expansión
> de componentes, en ~3.500 líneas de JS sin dependencias. Más un LSP y una
> extensión de VS Code.
>
> 3/4 Y lo que NO es, sin rodeos: no es un framework de producción, no
> compite con Tauri/Electron/Svelte/React y el shell de escritorio aún
> necesita Node. Es para prototipar en minutos y para aprender compiladores
> leyendo uno.
>
> 4/4 103 tests, Apache-2.0, docs en español e inglés. Lo hice desde Cuba,
> donde la conexión va y viene: por eso todo corre local. Repo:
> https://github.com/jmarc9901/KARA · Instalar:
> `npm i -g kara-lang && kara new app && kara dev`

### 7.5 X / Twitter

**Post corto:**
> Construí un lenguaje de programación en miniatura: KARA. Declaras la UI,
> escribes la lógica, el estado es reactivo. Compilador real (lexer → parser
> → semántica → tipos) en ~3.500 líneas de JS sin dependencias, LSP y
> playground en el navegador. No es un framework de producción: es para
> prototipar y aprender. Pruébalo: https://jmarc9901.github.io/KARA/playground.html
> Repo: https://github.com/jmarc9901/KARA

**Hilo (alternativa):**
> 1/3 Construí **KARA**, un lenguaje para prototipar UIs de escritorio con
> vista previa instantánea. Lo distinto: hay un compilador real detrás —
> lexer, parser, semántica, inferencia de tipos, expansión de componentes —
> en ~3.500 líneas de JS sin dependencias.
>
> 2/3 Incluye intérprete con hot-reload, `derived` con grafo de dependencias,
> componentes con estado propio, módulos, LSP y extensión de VS Code. Todo
> compila e interpreta en el navegador, sin servidor.
>
> 3/3 Honestidad: no es un framework de producción ni compite con
> Tauri/Electron/Svelte. Es para prototipar y para aprender compiladores.
> Lo hice desde Cuba, donde la conexión va y viene: por eso corre local.
> https://jmarc9901.github.io/KARA/playground.html · Repo:
> https://github.com/jmarc9901/KARA #programacion #opensource

### 7.6 Facebook

> Hice un lenguaje de programación como proyecto personal: **KARA**. Es
> pequeño, pero real — no es una demo de sintaxis.
>
> Para prototipar interfaces de escritorio: declaras la interfaz, escribes la
> lógica y el estado es reactivo. Detrás hay un compilador completo — lexer,
> parser, análisis semántico, inferencia de tipos y expansión de componentes —
> en ~3.500 líneas de JavaScript sin dependencias, más intérprete con
> hot-reload, LSP y extensión de VS Code. Puedes probarlo en el navegador sin
> instalar nada: https://jmarc9901.github.io/KARA/playground.html
>
> Y para ser honesto sobre lo que no es: no es un framework de producción y
> no reemplaza a Tauri, Electron, Svelte o React. Es una herramienta para
> prototipar en minutos y para aprender cómo funciona un compilador leyendo
> uno. El shell de escritorio todavía necesita Node instalado.
>
> Lo construí desde Cuba, donde la conexión va y viene; por eso todo corre en
> tu máquina, sin depender de internet. 103 tests, código abierto
> (Apache-2.0) y documentación en español: https://github.com/jmarc9901/KARA
>
> Si te interesa el tema de los compiladores o el desarrollo de lenguajes,
> me encantaría leer tu opinión. 👇
