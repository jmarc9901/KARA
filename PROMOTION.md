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

### El ángulo humano (úsalo en todas)

> Soy de Cuba. Aquí los apagones y la conexión inestable son parte de la vida
> diaria, así que aprendí a construir software que funciona sin internet.
> KARA es mi lenguaje de programación: el compilador, el intérprete, el LSP y
> la documentación corren 100% en tu máquina, sin servidor y sin conexión.
> Si lo construí así, tú puedes usarlo en cualquier lugar del mundo.

### 7.1 YouTube Shorts (~45 s, vertical)

**Título:** Construí un lenguaje de programación… en Cuba 🇨🇺

**Guion con planos (pantalla vertical):**

| Tiempo | Plano | Texto en pantalla / voz |
|---|---|---|
| 0-3 s | Manos tecleando, fondo sencillo | "Soy de Cuba. Aquí los apagones son parte de la vida." |
| 3-10 s | Playground: escribiendo 5 líneas | "Así que construí mi propio lenguaje de programación: KARA." |
| 10-20 s | La UI reacciona en vivo al teclear | "Escribes la interfaz en texto plano… y se convierte en una app reactiva. Sin instalar nada." |
| 20-32 s | Demo: contador + error con línea y columna | "Compilador real, inferencia de tipos, hot-reload. Todo corre en tu navegador o en tu máquina." |
| 32-40 s | Móvil con poca señal (con dignidad, sin drama) | "Aprendí a programar con apagones y conexión inestable: KARA funciona sin internet." |
| 40-45 s | Playground + repo en pantalla | "Pruébalo gratis: enlace en la descripción. Hecho en Cuba, para el mundo." |

**Descripción:**
> Construí un lenguaje de programación desde Cuba, un país donde los apagones y
> la conexión inestable son parte del día a día. Por eso KARA funciona sin
> internet: compilador, intérprete y playground corren 100% local.
>
> ▶ Prueba sin instalar nada: https://jmarc9901.github.io/KARA/playground.html
> 📦 Instalar: `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 Código: https://github.com/jmarc9901/KARA (Apache-2.0, docs en español)
>
> #programacion #lenguajedeprogramacion #compilador #cuba #opensource

### 7.2 YouTube (video completo, 2-4 min)

**Título:** Construí un lenguaje de programación desde Cuba (con apagones y sin conexión estable)

**Descripción:**
> Soy desarrollador en Cuba. Entre apagones y una conexión que va y viene,
> construí KARA: un lenguaje completo para prototipar interfaces de escritorio
> — compilador real (léxico → parser → análisis semántico → inferencia de
> tipos), intérprete con hot-reload, componentes con estado propio, módulos,
> LSP y playground 100% en el navegador.
>
> Lo diseñé para funcionar sin internet: todo corre en tu máquina. Eso no fue
> un capricho: fue una necesidad.
>
> ▶ Pruébalo: https://jmarc9901.github.io/KARA/playground.html
> 📦 `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 https://github.com/jmarc9901/KARA
>
> Guion sugerido: 1) qué es KARA (30 s) · 2) por qué offline-first y la
> realidad de Cuba (30 s) · 3) demo en el playground (60 s) · 4) componentes,
> módulos, Map/Filter/Reduce y timers (60 s) · 5) kara dev + hot-reload (30 s)
> · 6) cierre con repo (30 s).
>
> #programacion #lenguajedeprogramacion #compilador #cuba #opensource

### 7.3 LinkedIn

> Desde Cuba, con apagones y una conexión que va y viene, construí un lenguaje
> de programación completo: **KARA**.
>
> No fue un detalle técnico que KARA funcione 100% sin internet — fue el
> requisito. El compilador, el intérprete, el language server y la
> documentación corren localmente; el playground vive en el navegador sin
> servidor. Aprendí a escribir software que no depende de la conexión, y eso
> cambió la forma en que diseño.
>
> KARA incluye un pipeline de compilación real (léxico → parser → semántica →
> inferencia de tipos → expansión de componentes), componentes con estado por
> instancia, módulos, LSP sin dependencias, extensión de VS Code y shell de
> escritorio con Tauri. En la v0.4: builtins de orden superior
> (`Map`/`Filter`/`Reduce`), temporizadores, parser en Rust con paridad en CI
> y test e2e del runtime. 100+ tests, Apache-2.0.
>
> ▶ Pruébalo sin instalar nada: https://jmarc9901.github.io/KARA/playground.html
> 📦 npm: `npm install -g kara-lang && kara new my-app && kara dev`
> 🔗 Repo: https://github.com/jmarc9901/KARA
>
> Si algo así se construye en Cuba, se puede construir en cualquier parte.
> ¿Feedback? ¡Bienvenido!

### 7.4 Threads

> Hilo: soy desarrollador en Cuba y construí un lenguaje de programación entre
> apagones y conexión inestable 🧵
>
> 1/4 Se llama **KARA**: un lenguaje declarativo y reactivo para prototipar
> interfaces de escritorio. Escribes la interfaz en texto plano y ves el
> resultado en vivo. Pruébalo sin instalar nada 👉
> https://jmarc9901.github.io/KARA/playground.html
>
> 2/4 Cuando casi no hay luz ni internet, aprendes a que tu código funcione
> sin ellos. Todo en KARA corre local: compilador, intérprete, LSP y docs. El
> playground funciona en el navegador sin servidor.
>
> 3/4 La v0.4 añade `Map`/`Filter`/`Reduce`, temporizadores
> (`SetTimeout`/`SetInterval`), parser en Rust sincronizado con paridad en CI
> y un test e2e del runtime.
>
> 4/4 Código abierto (Apache-2.0), ~4.000 líneas legibles, docs en español e
> inglés. Repo: https://github.com/jmarc9901/KARA · Instalar:
> `npm i -g kara-lang && kara new app && kara dev`

### 7.5 X / Twitter

**Post corto:**
> Soy desarrollador en Cuba. Con apagones y conexión inestable construí un
> lenguaje de programación que funciona sin internet. Declarativo, reactivo,
> con compilador real y playground en el navegador 👉
> https://jmarc9901.github.io/KARA/playground.html · Repo:
> https://github.com/jmarc9901/KARA 🇨🇺

**Hilo (alternativa):**
> 1/3 Construí **KARA**, un lenguaje de programación, desde Cuba — donde los
> apagones y la conexión inestable son parte del día a día. Así que lo hice
> offline-first: todo corre en tu máquina.
>
> 2/3 `state` + `derived` con grafo de dependencias, componentes con estado
> propio, módulos, LSP sin dependencias. La v0.4 añade `Map`/`Filter`/`Reduce`,
> temporizadores y parser en Rust con paridad en CI.
>
> 3/3 Pruébalo: https://jmarc9901.github.io/KARA/playground.html ·
> `npm i -g kara-lang && kara new app && kara dev` · Repo:
> https://github.com/jmarc9901/KARA #programacion #opensource #cuba

### 7.6 Facebook

> Construí un lenguaje de programación como proyecto personal, desde Cuba y
> entre apagones: **KARA**, para prototipar interfaces de escritorio de forma
> declarativa y reactiva.
>
> Aquí la conexión va y viene, así que lo diseñé para que todo funcione sin
> internet: el compilador, el intérprete y el playground corren en tu propia
> máquina o navegador, sin servidores. Si se puede hacer así en Cuba, se puede
> hacer en cualquier lugar.
>
> Puedes probarlo directamente en el navegador, sin instalar nada:
> https://jmarc9901.github.io/KARA/playground.html
>
> Tiene compilador real (léxico → parser → semántica → tipos), intérprete con
> hot-reload, componentes con estado propio, módulos y extensión para VS Code.
> La última versión añade `Map`/`Filter`/`Reduce` y temporizadores.
>
> Código abierto (Apache-2.0), con documentación en español:
> https://github.com/jmarc9901/KARA
>
> ¿Te gustaría ver un video tutorial de cómo lo construí? 👇
