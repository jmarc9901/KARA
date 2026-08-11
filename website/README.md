# KARA website

The static, zero-dependency website for KARA: landing page, docs, examples,
tutorial and a **fully client-side playground** (the compiler and interpreter
bundle into `assets/kara.js` and run in the browser).

## Structure

```text
website/
  index.html           Landing page (with a live hero demo)
  playground.html      Full playground (editor, preview, console, AST, reference)
  getting-started.html
  language.html
  api.html
  examples.html
  tutorial.html
  assets/
    style.css          Design system
    main.js            Nav, KARA syntax highlighting, footer year
    playground.js      Client-side runner for the playground
    kara.js            Bundled compiler + interpreter (generated, do not edit)
    logo.svg / favicon.svg
  src/
    entry.js           Browser entry for the bundle
  build.mjs            esbuild bundling script
```

## Build the playground bundle

The browser bundle is produced from the repository's compiler and interpreter
(which are pure ESM with no Node builtins):

```bash
npm run web:build       # or: node website/build.mjs
```

This writes `website/assets/kara.js`. Re-run it whenever the compiler or the
interpreter changes.

## Deploy

The folder is fully static — no build step for the pages themselves:

- **GitHub Pages**: push `website/` to the repo and enable Pages, or use a
  workflow that copies it to `gh-pages`.
- **Netlify / Vercel**: drag-and-drop the folder or point the build at it
  (`npm run web:build && <publish website/>`).

## Notes

- The playground supports deep links to presets: `playground.html#contador`,
  `#formulario`, `#lista`, `#componentes`, `#tareas`.
- All code blocks in the pages are written as raw
  `<script type="text/kara">` sources and highlighted at load time by
  `assets/main.js` — edit the raw source, not the highlighted output.
- Content is English-first. The Spanish documentation lives in `docs/es/`.
