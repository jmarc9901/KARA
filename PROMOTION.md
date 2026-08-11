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

## 7. Publicaciones en español — YouTube · LinkedIn · Threads · X · Facebook

Enlaces que puedes pegar en cualquier texto:

- Playground (sin instalar nada): https://jmarc9901.github.io/KARA/playground.html
- Repo: https://github.com/jmarc9901/KARA
- Web: https://jmarc9901.github.io/KARA/
- Instalar: `npm install -g kara-lang && kara new my-app && cd my-app && kara dev`

### 7.1 YouTube (demo de ~60-90 s)

**Título del video:**

> Construí un lenguaje de programación para prototipar interfaces de escritorio — KARA

**Descripción:**

> KARA es un lenguaje declarativo y reactivo para prototipar UIs de escritorio.
> Escribes la interfaz en texto plano y obtienes una vista previa en vivo en
> segundos: compilador real (léxico → parser → análisis semántico → inferencia
> de tipos), intérprete con hot-reload, componentes con estado propio, módulos
> y un playground 100% en el navegador.
>
> ▶ Prueba sin instalar nada: https://jmarc9901.github.io/KARA/playground.html
> 📦 Instalar: `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 Código: https://github.com/jmarc9901/KARA (Apache-2.0)
>
> Lo que muestro en el video:
> 1. Escribo ~10 líneas de KARA en el playground → la UI reacciona al instante.
> 2. Componentes con estado por instancia y `derived` con grafo de dependencias.
> 3. Módulos con `import` y builtins como `Map`/`Filter`/`Reduce` y timers.
> 4. `kara dev` con hot-reload en la ventana nativa (Tauri).
>
> #programacion #lenguajedeprogramacion #compilador #desarrollo #opensource

**Mini-guion para el video (60 s):**

1. 0-10 s: abre el playground, pega el ejemplo del contador, pulsa ▶.
2. 10-25 s: cambia el estado y muestra el error con línea y columna al romper algo.
3. 25-40 s: crea un componente `Card` con estado local y duplícalo.
4. 40-55 s: demo de la lista de tareas con `Map`/`Filter`/`Reduce`.
5. 55-70 s: cierre con repo + instalación de una línea.

### 7.2 LinkedIn

> He construido un lenguaje de programación como proyecto personal: **KARA**, un
> lenguaje declarativo y reactivo para prototipar interfaces de escritorio.
>
> La idea era que fuese pequeño y legible de principio a fin: compilador real
> (léxico → parser → semántica → inferencia de tipos), intérprete con
> hot-reload, componentes con estado propio, módulos, LSP sin dependencias,
> extensión de VS Code y un playground que compila y ejecuta todo en el
> navegador.
>
> En la v0.4 añadí builtins de orden superior (`Map`/`Filter`/`Reduce`),
> temporizadores (`SetTimeout`/`SetInterval`), sincronicé el parser en Rust con
> el compilador JS y un test de paridad en CI, y un test e2e del runtime.
>
> ▶ Pruébalo sin instalar nada: https://jmarc9901.github.io/KARA/playground.html
> 📦 npm: `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 Repo: https://github.com/jmarc9901/KARA
>
> Apache-2.0, documentación en inglés y español. ¿Feedback? ¡Bienvenido!

### 7.3 Threads

> Hilo: construí un lenguaje de programación en mi tiempo libre 🧵
>
> 1/4 Se llama **KARA**: un lenguaje declarativo y reactivo para prototipar UIs
> de escritorio. Escribes la interfaz en texto plano y ves el resultado en vivo.
> Pruébalo sin instalar nada 👉 https://jmarc9901.github.io/KARA/playground.html
>
> 2/4 No es un wrapper: tiene pipeline de compilación real (léxico → parser →
> semántica → inferencia de tipos → expansión de componentes), intérprete con
> hot-reload y componentes con estado por instancia.
>
> 3/4 La v0.4 añade `Map`/`Filter`/`Reduce`, temporizadores
> (`SetTimeout`/`SetInterval`), parser en Rust sincronizado con paridad en CI
> y un test e2e del runtime.
>
> 4/4 Código abierto (Apache-2.0), ~4.000 líneas legibles, docs en español e
> inglés. Repo: https://github.com/jmarc9901/KARA
> Instalar: `npm i -g kara-lang && kara new app && kara dev`

### 7.4 X / Twitter

**Post corto:**

> Construí un lenguaje de programación para prototipar UIs de escritorio.
> Declarativo, reactivo, con compilador real y playground en el navegador —
> sin instalar nada 👉 https://jmarc9901.github.io/KARA/playground.html
> Repo: https://github.com/jmarc9901/KARA

**Hilo (alternativa):**

> 1/3 Construí **KARA**, un lenguaje para prototipar UIs reactivas: `state` +
> `derived` con grafo de dependencias, componentes con estado propio y módulos.
> El playground compila y ejecuta todo en el navegador.
>
> 2/3 La v0.4 trae `Map`/`Filter`/`Reduce`, temporizadores
> (`SetTimeout`/`SetInterval`), parser en Rust en sync (paridad verificada en
> CI) y test e2e del runtime. 100% open source.
>
> 3/3 Pruébalo: https://jmarc9901.github.io/KARA/playground.html ·
> `npm i -g kara-lang && kara new app && kara dev` · Repo:
> https://github.com/jmarc9901/KARA

### 7.5 Facebook

> Construí un lenguaje de programación como proyecto personal: **KARA**, para
> prototipar interfaces de escritorio de forma declarativa y reactiva.
>
> Puedes probarlo directamente en el navegador, sin instalar nada:
> https://jmarc9901.github.io/KARA/playground.html
>
> Tiene compilador real (léxico → parser → semántica → tipos), intérprete con
> hot-reload, componentes con estado propio, módulos y extensiones para VS
> Code. La última versión añade funciones de orden superior (`Map`/`Filter`/
> `Reduce`) y temporizadores.
>
> Código abierto (Apache-2.0) con documentación en español:
> https://github.com/jmarc9901/KARA
>
> ¿Te gustaría ver algo así en un video tutorial? 👇
