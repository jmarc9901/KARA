/**
 * KARA lexer — converts source text into tokens.
 *
 * Tokens carry a `loc` ({ index, line, col }) so the parser can produce
 * human-friendly diagnostics.
 */

export const KEYWORDS = new Set([
  'App', 'component', 'fn', 'let', 'state', 'derived', 'if', 'else', 'while', 'for', 'in',
  'return', 'import', 'true', 'false',
]);

export const PUNCT = new Set([
  '{', '}', '(', ')', '[', ']', ':', ';', ',', '=',
  '+', '-', '*', '/', '%', '!',
  '&&', '||', '==', '!=', '<', '<=', '>', '>=',
]);

const PUNCT_LONGEST_FIRST = [
  '&&', '||', '==', '!=', '<=', '>=', ...Array.from(PUNCT),
].sort((a, b) => b.length - a.length);

export class Token {
  constructor(kind, value, loc) {
    this.kind = kind; // 'ident' | 'keyword' | 'str' | 'int' | 'float' | 'punct' | 'eof'
    this.value = value; // raw value for ident/punct, decoded string for str, number for int/float
    this.loc = loc;
  }
}

function err(message, loc) {
  return { kind: 'LexError', message, line: loc.line, col: loc.col, index: loc.index };
}

/**
 * @param {string} source
 * @returns {{ tokens: Token[], errors: object[] }}
 */
export function lex(source) {
  const tokens = [];
  const errors = [];
  let i = 0;
  const src = source;

  const loc = (index) => {
    const before = src.slice(0, index);
    const line = before.split('\n').length;
    const lastNl = before.lastIndexOf('\n');
    const col = index - lastNl; // 1-based
    return { index, line, col };
  };

  while (i < src.length) {
    const c = src[i];

    // Whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i += 1;
      continue;
    }

    // Line comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }

    // Block comments
    if (c === '/' && src[i + 1] === '*') {
      const start = loc(i);
      i += 2;
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) errors.push(err('unterminated block comment', start));
      continue;
    }

    const at = loc(i);

    // Strings — keep raw content; interpolation is split by the parser.
    if (c === '"') {
      i += 1;
      let raw = '';
      let closed = false;
      while (i < src.length) {
        const ch = src[i];
        if (ch === '"') { closed = true; i += 1; break; }
        if (ch === '\\') {
          const nxt = src[i + 1];
          const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '$': '$' };
          if (nxt in map) { raw += map[nxt]; i += 2; }
          else if (nxt === undefined) break;
          else { raw += nxt; i += 2; }
          continue;
        }
        raw += ch;
        i += 1;
      }
      if (!closed) {
        errors.push(err('unterminated string literal', at));
        // Recover: emit whatever we have so parsing can continue.
      }
      tokens.push(new Token('str', raw, at));
      continue;
    }

    // Numbers (int / float)
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j += 1;
      let isFloat = false;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        isFloat = true;
        j += 1;
        while (j < src.length && /[0-9]/.test(src[j])) j += 1;
      }
      const text = src.slice(i, j);
      const value = Number(text);
      tokens.push(new Token(isFloat ? 'float' : 'int', value, at));
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      // Dotted names (e.g. builtins File.Read / File.Write): consume a '.' when
      // it is immediately followed by an identifier character.
      while (src[j] === '.' && /[A-Za-z0-9_]/.test(src[j + 1] ?? '')) {
        j += 1;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      }
      const name = src.slice(i, j);
      tokens.push(new Token(KEYWORDS.has(name) ? 'keyword' : 'ident', name, at));
      i = j;
      continue;
    }

    // Punctuation
    let matched = null;
    for (const p of PUNCT_LONGEST_FIRST) {
      if (src.startsWith(p, i)) { matched = p; break; }
    }
    if (matched) {
      tokens.push(new Token('punct', matched, at));
      i += matched.length;
      continue;
    }

    errors.push(err(`unexpected character "${c}"`, at));
    i += 1;
  }

  tokens.push(new Token('eof', null, loc(i)));
  return { tokens, errors };
}
