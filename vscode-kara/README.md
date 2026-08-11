# KARA for VS Code

**KARA** language and runtime (`.kara`) — syntax highlighting, **live
diagnostics**, type hovers and autocompletion, powered by a bundled
**language server** (`kara lsp`, zero dependencies).

## Features

- Full syntax highlighting: keywords (`App`, `fn`, `state`, `derived`, `if`,
  `for`, `import`, …), widgets (`Column`, `Text`, `Button`, `Select`,
  `Slider`, …), props, builtins, strings with interpolation `"Hello ${name}"`,
  numbers, comments.
- **Live diagnostics**: compile errors (syntax, semantic, type) underlined
  while you type.
- **Hover**: inferred type of `state`/`derived`, function returns, widget props
  and custom component signatures.
- **Autocompletion**: keywords, builtins, widgets, project components and
  props/handlers inside a widget block.
- Language configuration: auto-closing `{}` `()` `[]` and quotes.
- Commands:
  - `KARA: Run` — opens a terminal with `kara dev <current file>`.
  - `KARA: New project` — creates a new project with `kara new`.

## Requirements

- Node.js ≥ 20.11 (for the language server).
- In development, the extension uses the repo compiler (`../../compiler`). To
  distribute it, bundle the compiler inside the extension (copy `compiler/`
  to the extension root before `vsce package`).

## Installation (development)

```bash
# from the extension root
npm install -g @vscode/vsce
vsce package
code --install-extension kara-lang-0.4.0.vsix
```

Or publish to the Marketplace:

```bash
vsce publish
```

> Note: the `publisher` field in `package.json` is `jmarc9901` — claim it in
> the Marketplace before publishing, or change it to your own publisher.

## Roadmap

- [x] TextMate grammar (highlighting)
- [x] LSP: diagnostics, hover, autocompletion
- [ ] Debugger / step from the editor

## License

Apache-2.0 — © 2026 Juan Marcos Bravo Medina (JMarc). See LICENSE.
