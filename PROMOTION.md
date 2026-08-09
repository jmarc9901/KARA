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
