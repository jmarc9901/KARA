/**
 * KARA website — shared interactions (zero dependencies).
 *  - mobile nav toggle
 *  - KARA syntax highlighting for <pre data-code> blocks fed by
 *    <script type="text/kara" data-code="..."> raw sources
 *  - footer year
 */

// ---------------------------------------------------------------------------
// Mobile nav
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // Highlight KARA code blocks ----------------------------------------------
  const sources = document.querySelectorAll('script[type="text/kara"]');
  sources.forEach((src) => {
    const target = document.querySelector(`pre[data-code="${src.dataset.code}"]`);
    if (target) target.innerHTML = highlightKara(src.textContent);
  });

  // Footer year --------------------------------------------------------------
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
});

// ---------------------------------------------------------------------------
// KARA syntax highlighter (tokenizer, HTML-safe)
// ---------------------------------------------------------------------------
const KEYWORDS = new Set([
  'App', 'component', 'fn', 'let', 'state', 'derived', 'if', 'else', 'while',
  'for', 'in', 'return', 'import', 'true', 'false',
]);

const WIDGETS = new Set([
  'Column', 'Row', 'Text', 'Button', 'TextInput', 'Checkbox', 'Select', 'Slider', 'Image',
]);

const BUILTINS = new Set([
  'Print', 'Log', 'Alert', 'Random', 'Now', 'Length', 'Push', 'File.Read', 'File.Write',
]);

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Highlight a KARA source string into HTML spans.
 * Class names used: kw, comp, str, num, com, built, prop, interp.
 * (Plain function — main.js is a classic script, not a module.)
 */
function highlightKara(source) {
  const out = [];
  let i = 0;
  const src = source.replace(/\r\n/g, '\n');
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // Line comment
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      out.push(`<span class="com">${esc(src.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // String with optional ${} interpolation
    if (c === '"') {
      let j = i + 1;
      let html = '&quot;';
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { html += esc(src.slice(j, j + 2)); j += 2; continue; }
        if (ch === '"') { html += '&quot;'; j += 1; break; }
        if (ch === '$' && src[j + 1] === '{') {
          // interpolation segment: find balanced }
          let depth = 0;
          let k = j;
          while (k < n) {
            if (src[k] === '{') depth += 1;
            else if (src[k] === '}') {
              depth -= 1;
              if (depth === 0) break;
            }
            k += 1;
          }
          html += `<span class="interp">${esc(src.slice(j, Math.min(k + 1, n)))}</span>`;
          j = Math.min(k + 1, n);
          continue;
        }
        html += esc(ch);
        j += 1;
      }
      out.push(`<span class="str">${html}</span>`);
      i = j;
      continue;
    }

    // Number
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j += 1;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        j += 1;
        while (j < n && /[0-9]/.test(src[j])) j += 1;
      }
      out.push(`<span class="num">${esc(src.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    // Identifier / keyword / widget / builtin / prop
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      while (src[j] === '.' && /[A-Za-z0-9_]/.test(src[j + 1] ?? '')) {
        j += 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      }
      const word = src.slice(i, j);
      let cls = null;
      if (KEYWORDS.has(word)) cls = 'kw';
      else if (WIDGETS.has(word)) cls = 'comp';
      else if (BUILTINS.has(word)) cls = 'built';
      else {
        // prop? identifier followed by ':' (and not "::")
        let k = j;
        while (k < n && src[k] === ' ') k += 1;
        if (src[k] === ':' && src[k + 1] !== ':') cls = 'prop';
      }
      out.push(cls ? `<span class="${cls}">${esc(word)}</span>` : esc(word));
      i = j;
      continue;
    }

    out.push(esc(c));
    i += 1;
  }

  return out.join('');
}

// Expose for the playground page (highlight of the editor mirror).
window.highlightKara = highlightKara;
