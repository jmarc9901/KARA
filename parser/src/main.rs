//! KARA parser (Rust) — port del pipeline lexer → parser del compiler JS.
//!
//! Emite el **mismo AST JSON** que `compiler/src/parser.js` para que el runtime
//! (o cualquier otra herramienta) lo consuma sin cambios:
//!
//! ```json
//! {
//!   "title": "...", "size": [w, h], "theme": "light" | "dark",
//!   "state": { name: { "expr": <expr>, "loc": { "line", "col" } } },
//!   "derived": { ... }, "fns": [...],
//!   "components": [...], "imports": [...],
//!   "ui": { "type": "App", "children": [<node>...] },
//!   "stateOrder": [name...], "derivedOrder": [name...]
//! }
//! ```
//!
//! Soportado: widgets base + Select/Slider, `onClick`/`onChange`, `bind`,
//! `strArray` (options), componentes personalizados, `import`/módulos
//! (resolución relativa, dedupe y ciclos seguros) e interpolación de strings.
//!
//! Uso: `kara-parser [input.kara] [outdir]` → escribe `outdir/ast.json`
//! o reporta los errores de compilación por stderr.

// Los nombres camelCase (onClick, stateOrder) coinciden con las claves del AST JS.
#![allow(non_snake_case)]

use serde_json::{json, Map, Value};
use std::cell::RefCell;
use std::rc::Rc;
use std::{env, fs, path::PathBuf};

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
#[derive(Clone, Debug)]
struct Err {
    kind: &'static str,
    message: String,
    line: usize,
    col: usize,
    #[allow(dead_code)] // index mantiene paridad con el formato de errores del compiler JS
    index: usize,
}

impl Err {
    fn lex(message: impl Into<String>, line: usize, col: usize, index: usize) -> Self {
        Err { kind: "LexError", message: message.into(), line, col, index }
    }
    fn parse(message: impl Into<String>, line: usize, col: usize, index: usize) -> Self {
        Err { kind: "ParseError", message: message.into(), line, col, index }
    }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
#[derive(Clone, Debug)]
enum TokenKind {
    Ident(String),
    Keyword(String),
    Str(String),
    Int(i64),
    Float(f64),
    Punct(String),
    Eof,
}

impl TokenKind {
    fn punct(&self) -> Option<&str> {
        if let TokenKind::Punct(p) = self { Some(p) } else { None }
    }
    fn keyword(&self) -> Option<&str> {
        if let TokenKind::Keyword(k) = self { Some(k) } else { None }
    }
    fn is_eof(&self) -> bool {
        matches!(self, TokenKind::Eof)
    }
}

#[derive(Clone, Debug)]
struct Token {
    kind: TokenKind,
    index: usize,
    line: usize,
    col: usize,
}

const KEYWORDS: &[&str] = &[
    "App", "component", "fn", "let", "state", "derived", "if", "else", "while", "for", "in",
    "return", "import", "true", "false",
];
// Ordenado de mayor a menor longitud: los multi-char van primero.
const PUNCT: &[&str] = &[
    "&&", "||", "==", "!=", "<=", ">=",
    "{", "}", "(", ")", "[", "]", ":", ";", ",", "=", "+", "-", "*", "/", "%", "!", "<", ">",
];

fn tok_display(t: &Token) -> String {
    match &t.kind {
        TokenKind::Ident(s) | TokenKind::Keyword(s) | TokenKind::Punct(s) | TokenKind::Str(s) => {
            s.clone()
        }
        TokenKind::Int(v) => v.to_string(),
        TokenKind::Float(v) => v.to_string(),
        TokenKind::Eof => "end of file".to_string(),
    }
}

fn tok_loc(t: &Token) -> Value {
    json!({ "index": t.index, "line": t.line, "col": t.col })
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------
fn lex(source: &str) -> (Vec<Token>, Vec<Err>) {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens: Vec<Token> = Vec::new();
    let mut errors: Vec<Err> = Vec::new();
    let mut i = 0usize;
    // `units` cuenta código UTF-16 (igual que el índice de strings de JS), de
    // modo que `loc.index` coincide con el del compiler JS incluso con emojis.
    let mut units = 0usize;
    let mut line = 1usize;
    let mut col = 1usize;

    macro_rules! step {
        () => {{
            let c = chars[i];
            i += 1;
            units += c.len_utf16();
            if c == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
        }};
    }

    while i < chars.len() {
        let c = chars[i];

        // Whitespace
        if c == ' ' || c == '\t' || c == '\r' || c == '\n' {
            step!();
            continue;
        }

        // Line comments
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                step!();
            }
            continue;
        }

        // Block comments
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            let (sl, sc, si) = (line, col, units);
            step!();
            step!();
            let mut closed = false;
            while i < chars.len() {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    step!();
                    step!();
                    closed = true;
                    break;
                }
                step!();
            }
            if !closed {
                errors.push(Err::lex("unterminated block comment", sl, sc, si));
            }
            continue;
        }

        let (tl, tc, ti) = (line, col, i);
        let tu = units;

        // Strings — raw content; interpolation is split by the parser.
        if c == '"' {
            step!();
            let mut raw = String::new();
            let mut closed = false;
            while i < chars.len() {
                let ch = chars[i];
                if ch == '"' {
                    step!();
                    closed = true;
                    break;
                }
                if ch == '\\' {
                    let nxt = chars.get(i + 1).copied();
                    match nxt {
                        Some('n') => { raw.push('\n'); step!(); step!(); }
                        Some('t') => { raw.push('\t'); step!(); step!(); }
                        Some('r') => { raw.push('\r'); step!(); step!(); }
                        Some('"') => { raw.push('"'); step!(); step!(); }
                        Some('\\') => { raw.push('\\'); step!(); step!(); }
                        Some('$') => { raw.push('$'); step!(); step!(); }
                        Some(other) => { raw.push(other); step!(); step!(); }
                        None => break,
                    }
                    continue;
                }
                raw.push(ch);
                step!();
            }
            if !closed {
                errors.push(Err::lex("unterminated string literal", tl, tc, tu));
            }
            tokens.push(Token { kind: TokenKind::Str(raw), index: tu, line: tl, col: tc });
            continue;
        }

        // Numbers (int / float)
        if c.is_ascii_digit() {
            while i < chars.len() && chars[i].is_ascii_digit() {
                step!();
            }
            let mut is_float = false;
            if chars.get(i) == Some(&'.')
                && chars.get(i + 1).map_or(false, |d| d.is_ascii_digit())
            {
                is_float = true;
                step!();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    step!();
                }
            }
            let text: String = chars[ti..i].iter().collect();
            let kind = if is_float {
                TokenKind::Float(text.parse().unwrap_or(0.0))
            } else {
                TokenKind::Int(text.parse().unwrap_or(0))
            };
            tokens.push(Token { kind, index: tu, line: tl, col: tc });
            continue;
        }

        // Identifiers / keywords
        if c == '_' || c.is_ascii_alphabetic() {
            while i < chars.len() && (chars[i] == '_' || chars[i].is_ascii_alphanumeric()) {
                step!();
            }
            let name: String = chars[ti..i].iter().collect();
            let kind = if KEYWORDS.contains(&name.as_str()) {
                TokenKind::Keyword(name)
            } else {
                TokenKind::Ident(name)
            };
            tokens.push(Token { kind, index: tu, line: tl, col: tc });
            continue;
        }

        // Punctuation
        let mut matched: Option<&str> = None;
        for p in PUNCT {
            let plen = p.chars().count();
            if i + plen <= chars.len() {
                let cand: String = chars[i..i + plen].iter().collect();
                if cand == *p {
                    matched = Some(p);
                    break;
                }
            }
        }
        if let Some(p) = matched {
            for _ in 0..p.chars().count() {
                step!();
            }
            tokens.push(Token { kind: TokenKind::Punct(p.to_string()), index: tu, line: tl, col: tc });
            continue;
        }

        errors.push(Err::lex(format!("unexpected character \"{}\"", c), tl, tc, tu));
        step!();
    }

    tokens.push(Token { kind: TokenKind::Eof, index: units, line, col });
    (tokens, errors)
}

// ---------------------------------------------------------------------------
// Component schema
// ---------------------------------------------------------------------------
struct PropDef {
    t: &'static str,        // "int" | "num" | "float" | "str" | "bool" | "strEnum" | "strArray"
    allowed: &'static [&'static str],
    required: bool,
}

const LAYOUT_PROPS: &[(&str, PropDef)] = &[
    ("spacing", PropDef { t: "num", allowed: &[], required: false }),
    ("padding", PropDef { t: "num", allowed: &[], required: false }),
    ("align", PropDef { t: "strEnum", allowed: &["start", "center", "end", "stretch"], required: false }),
];

const TEXT_PROPS: &[(&str, PropDef)] = &[
    ("value", PropDef { t: "str", allowed: &[], required: true }),
    ("fontSize", PropDef { t: "num", allowed: &[], required: false }),
    ("color", PropDef { t: "str", allowed: &[], required: false }),
    ("bold", PropDef { t: "bool", allowed: &[], required: false }),
    ("align", PropDef { t: "strEnum", allowed: &["left", "center", "right"], required: false }),
];

const BUTTON_PROPS: &[(&str, PropDef)] = &[
    ("id", PropDef { t: "str", allowed: &[], required: true }),
    ("text", PropDef { t: "str", allowed: &[], required: true }),
    ("variant", PropDef { t: "strEnum", allowed: &["primary", "secondary", "ghost"], required: false }),
    ("color", PropDef { t: "str", allowed: &[], required: false }),
];

const INPUT_PROPS: &[(&str, PropDef)] = &[
    ("id", PropDef { t: "str", allowed: &[], required: true }),
    ("bind", PropDef { t: "str", allowed: &[], required: false }),
    ("placeholder", PropDef { t: "str", allowed: &[], required: false }),
    ("label", PropDef { t: "str", allowed: &[], required: false }),
    ("type", PropDef { t: "strEnum", allowed: &["text", "password"], required: false }),
];

const CHECKBOX_PROPS: &[(&str, PropDef)] = &[
    ("id", PropDef { t: "str", allowed: &[], required: true }),
    ("bind", PropDef { t: "str", allowed: &[], required: false }),
    ("label", PropDef { t: "str", allowed: &[], required: false }),
];

const SELECT_PROPS: &[(&str, PropDef)] = &[
    ("id", PropDef { t: "str", allowed: &[], required: true }),
    ("bind", PropDef { t: "str", allowed: &[], required: false }),
    ("label", PropDef { t: "str", allowed: &[], required: false }),
    ("options", PropDef { t: "strArray", allowed: &[], required: true }),
];

const SLIDER_PROPS: &[(&str, PropDef)] = &[
    ("id", PropDef { t: "str", allowed: &[], required: true }),
    ("bind", PropDef { t: "str", allowed: &[], required: false }),
    ("label", PropDef { t: "str", allowed: &[], required: false }),
    ("min", PropDef { t: "num", allowed: &[], required: false }),
    ("max", PropDef { t: "num", allowed: &[], required: false }),
    ("step", PropDef { t: "num", allowed: &[], required: false }),
];

const IMAGE_PROPS: &[(&str, PropDef)] = &[
    ("src", PropDef { t: "str", allowed: &[], required: true }),
    ("width", PropDef { t: "num", allowed: &[], required: false }),
    ("height", PropDef { t: "num", allowed: &[], required: false }),
];

const COMPONENT_NAMES: &[&str] = &[
    "Column", "Row", "Text", "Button", "TextInput", "Checkbox", "Select", "Slider", "Image",
];
const STATEMENT_KEYWORDS: &[&str] = &["let", "state", "derived", "fn", "if", "while", "for", "return"];

/// (es contenedor, definición de props)
fn schema_for(name: &str) -> Option<(bool, &'static [(&'static str, PropDef)])> {
    match name {
        "Column" | "Row" => Some((true, LAYOUT_PROPS)),
        "Text" => Some((false, TEXT_PROPS)),
        "Button" => Some((false, BUTTON_PROPS)),
        "TextInput" => Some((false, INPUT_PROPS)),
        "Checkbox" => Some((false, CHECKBOX_PROPS)),
        "Select" => Some((false, SELECT_PROPS)),
        "Slider" => Some((false, SLIDER_PROPS)),
        "Image" => Some((false, IMAGE_PROPS)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    errors: Vec<Err>,
    /// Directorio del archivo actual (para resolver imports relativos).
    dir: Option<PathBuf>,
    /// Conjunto compartido de ids ya importados en todo el árbol (dedupe + ciclos).
    imported_ids: Rc<RefCell<Vec<String>>>,
}

impl Parser {
    fn new(tokens: Vec<Token>, errors: Vec<Err>) -> Self {
        Parser {
            tokens,
            pos: 0,
            errors,
            dir: None,
            imported_ids: Rc::new(RefCell::new(Vec::new())),
        }
    }

    fn with_dir(
        tokens: Vec<Token>,
        errors: Vec<Err>,
        dir: Option<PathBuf>,
        imported_ids: Rc<RefCell<Vec<String>>>,
    ) -> Self {
        Parser { tokens, pos: 0, errors, dir, imported_ids }
    }

    fn peek(&self, off: usize) -> Token {
        let idx = (self.pos + off).min(self.tokens.len() - 1);
        self.tokens[idx].clone()
    }

    fn next(&mut self) -> Token {
        let t = self.peek(0);
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
        t
    }

    fn at_end(&self) -> bool {
        self.peek(0).kind.is_eof()
    }

    fn at_punct(&self, p: &str) -> bool {
        self.peek(0).kind.punct() == Some(p)
    }

    fn at_keyword(&self, k: &str) -> bool {
        self.peek(0).kind.keyword() == Some(k)
    }

    fn eat_punct(&mut self, p: &str) -> bool {
        if self.at_punct(p) {
            self.next();
            true
        } else {
            let t = self.peek(0);
            self.error(format!("expected \"{}\"", p), &t);
            false
        }
    }

    fn eat_keyword(&mut self, k: &str) -> bool {
        if self.at_keyword(k) {
            self.next();
            true
        } else {
            let t = self.peek(0);
            self.error(format!("expected \"{}\"", k), &t);
            false
        }
    }

    fn error(&mut self, message: String, tok: &Token) {
        self.errors.push(Err::parse(message, tok.line, tok.col, tok.index));
    }

    /// Salta hasta el siguiente token que puede iniciar una sentencia/componente.
    fn recover(&mut self) {
        loop {
            let t = self.peek(0);
            if t.kind.is_eof() || t.kind.punct() == Some("}") {
                return;
            }
            if t.kind.punct() == Some(";") {
                self.next();
                return;
            }
            if let TokenKind::Ident(n) = &t.kind {
                if COMPONENT_NAMES.contains(&n.as_str()) {
                    return;
                }
            }
            if let TokenKind::Keyword(k) = &t.kind {
                if STATEMENT_KEYWORDS.contains(&k.as_str()) {
                    return;
                }
            }
            self.next();
        }
    }

    // =======================================================================
    // Program
    // =======================================================================
    fn parse_program(&mut self) -> Value {
        // Leading `import "..."` statements merge component/fn definitions from
        // other .kara files before the App block is parsed.
        let mut imports: Vec<Value> = Vec::new();
        let mut components: Vec<Value> = Vec::new();
        let mut fns: Vec<Value> = Vec::new();
        while self.at_keyword("import") {
            if let Some((spec, id, mod_components, mod_fns)) = self.parse_import() {
                imports.push(json!({ "spec": spec, "id": id }));
                for c in mod_components {
                    let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if components.iter().any(|x| x.get("name").and_then(|v| v.as_str()) == Some(name.as_str()))
                    {
                        self.error(
                            format!("duplicate component \"{}\" (already defined or imported)", name),
                            &self.peek(0),
                        );
                        continue;
                    }
                    components.push(c);
                }
                for f in mod_fns {
                    let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if fns.iter().any(|x| x.get("name").and_then(|v| v.as_str()) == Some(name.as_str())) {
                        self.error(
                            format!("duplicate function \"{}\" (already defined or imported)", name),
                            &self.peek(0),
                        );
                        continue;
                    }
                    fns.push(f);
                }
            }
        }

        if self.at_keyword("App") {
            self.next();
        } else {
            let t = self.peek(0);
            self.error("a KARA program must start with \"App {\"".to_string(), &t);
        }
        self.eat_punct("{");

        let mut title: Option<Value> = None;
        let mut size: Option<Value> = None;
        let mut theme: Value = json!("light");
        let mut state: Map<String, Value> = Map::new();
        let mut derived: Map<String, Value> = Map::new();
        let mut children: Vec<Value> = Vec::new();
        let mut seen: Vec<String> = Vec::new();

        while !self.at_punct("}") {
            if self.at_end() {
                let t = self.peek(0);
                self.error("unexpected end of file: missing closing \"}\" for App".to_string(), &t);
                break;
            }
            let tok = self.peek(0);

            // if / for blocks in the UI tree
            if let TokenKind::Keyword(k) = &tok.kind {
                if k == "if" || k == "for" {
                    if let Some(node) = self.parse_ui_node() {
                        children.push(node);
                    }
                    continue;
                }
            }

            // Built-in components
            if let TokenKind::Ident(name) = &tok.kind {
                if COMPONENT_NAMES.contains(&name.as_str()) {
                    if let Some(node) = self.parse_component() {
                        children.push(node);
                    }
                    continue;
                }
            }

            // Custom component instance: Name followed by "{"
            if let TokenKind::Ident(name) = &tok.kind {
                if !COMPONENT_NAMES.contains(&name.as_str()) && self.peek(1).kind.punct() == Some("{") {
                    if let Some(node) = self.parse_custom_component() {
                        children.push(node);
                    }
                    continue;
                }
            }

            let key = match &tok.kind {
                TokenKind::Ident(s) | TokenKind::Keyword(s) => s.clone(),
                _ => {
                    self.error(format!("unexpected token \"{}\" in App block", tok_display(&tok)), &tok);
                    self.recover();
                    continue;
                }
            };
            self.next();

            match key.as_str() {
                "title" | "theme" => {
                    if seen.contains(&key) {
                        self.error(format!("duplicate App property \"{}\"", key), &tok);
                    }
                    seen.push(key.clone());
                    self.eat_punct(":");
                    match self.parse_value() {
                        Some(Prim::Str(s)) => {
                            if key == "title" {
                                title = Some(json!(self.interp_parts_to_plain(&s, &tok)));
                            } else if s == "light" || s == "dark" {
                                theme = json!(s);
                            } else {
                                self.error("theme must be \"light\" or \"dark\"".to_string(), &tok);
                            }
                        }
                        _ => self.error(format!("App.{} must be a string", key), &tok),
                    }
                }
                "size" => {
                    if seen.contains(&"size".to_string()) {
                        self.error("duplicate App property \"size\"".to_string(), &tok);
                    }
                    seen.push("size".to_string());
                    self.eat_punct(":");
                    self.eat_punct("(");
                    let w = self.parse_value();
                    self.eat_punct(",");
                    let h = self.parse_value();
                    self.eat_punct(")");
                    match (w, h) {
                        (Some(Prim::Int(wv)), Some(Prim::Int(hv))) => size = Some(json!([wv, hv])),
                        _ => self.error("size must be (width: Int, height: Int)".to_string(), &tok),
                    }
                }
                "state" | "derived" => {
                    let is_derived = key == "derived";
                    let name_tok = self.next();
                    if let TokenKind::Ident(name) = &name_tok.kind {
                        let target = if is_derived { &mut derived } else { &mut state };
                        if target.contains_key(name) {
                            let label = if is_derived { "derived" } else { "state" };
                            self.error(format!("duplicate {} variable \"{}\"", label, name), &name_tok);
                        }
                        self.eat_punct("=");
                        if let Some(expr) = self.parse_expr() {
                            target.insert(
                                name.clone(),
                                json!({
                                    "expr": expr,
                                    "loc": { "line": name_tok.line, "col": name_tok.col },
                                }),
                            );
                        } else {
                            self.recover();
                        }
                    } else {
                        let label = if is_derived { "derived" } else { "state" };
                        self.error(format!("expected a {} variable name", label), &name_tok);
                        self.recover();
                    }
                }
                "fn" => {
                    // The 'fn' keyword was consumed as `key`; parse_fn_def reads the name.
                    if let Some(f) = self.parse_fn_def(&fns, None) {
                        fns.push(f);
                    }
                }
                "component" => {
                    // The keyword was consumed as `key`; parse_component_def reads the name.
                    if let Some(c) = self.parse_component_def(&components) {
                        components.push(c);
                    }
                }
                _ if key.starts_with(|c: char| c.is_ascii_uppercase()) => {
                    self.error(format!("unknown component \"{}\"", key), &tok);
                    self.recover();
                }
                _ => {
                    self.error(format!("unexpected \"{}\" in App block", key), &tok);
                    self.recover();
                }
            }
        }
        self.eat_punct("}");

        if title.is_none() {
            let t = self.peek(0);
            self.error("App requires a \"title\" property".to_string(), &t);
        }
        if size.is_none() {
            let t = self.peek(0);
            self.error("App requires a \"size\" property".to_string(), &t);
        }

        let state_order: Vec<Value> = state.keys().map(|k| json!(k)).collect();
        let derived_order: Vec<Value> = derived.keys().map(|k| json!(k)).collect();

        json!({
            "title": title.unwrap_or(Value::Null),
            "size": size.unwrap_or(Value::Null),
            "theme": theme,
            "state": Value::Object(state),
            "derived": Value::Object(derived),
            "fns": fns,
            "components": components,
            "imports": imports,
            "ui": { "type": "App", "children": children },
            "stateOrder": state_order,
            "derivedOrder": derived_order,
        })
    }

    // =======================================================================
    // Imports / modules
    // =======================================================================
    /// `import "./path.kara"` → (spec, id, components, fns). Dedupe + ciclos vía
    /// el conjunto compartido `imported_ids` (igual que el compiler JS).
    fn parse_import(&mut self) -> Option<(String, String, Vec<Value>, Vec<Value>)> {
        self.next(); // 'import'
        let path_tok = self.peek(0);
        let spec = match &path_tok.kind {
            TokenKind::Str(s) => s.clone(),
            _ => {
                self.error("import expects a string path: import \"./file.kara\"".to_string(), &path_tok);
                self.recover();
                return None;
            }
        };
        self.next();
        if self.at_punct(";") {
            self.next();
        }

        let dir = self.dir.clone()?;
        let path = dir.join(&spec);
        let source = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => {
                self.error(format!("cannot resolve import \"{}\"", spec), &path_tok);
                return None;
            }
        };
        let id = fs::canonicalize(&path)
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| path.display().to_string());

        // Dedupe + cycle safety: el conjunto compartido abarca todo el árbol.
        if self.imported_ids.borrow().contains(&id) {
            return Some((spec, id, Vec::new(), Vec::new()));
        }
        self.imported_ids.borrow_mut().push(id.clone());

        let sub_dir = path.parent().map(|p| p.to_path_buf());
        let (tokens, lex_errors) = lex(&source);
        let mut sub = Parser::with_dir(tokens, lex_errors, sub_dir, self.imported_ids.clone());
        let (components, fns) = sub.parse_module();
        // Etiquetar los errores del módulo con su archivo (sus line/col son
        // relativos al módulo, no al entry).
        if !sub.errors.is_empty() {
            for e in sub.errors {
                self.errors.push(Err::parse(format!("{}: {}", id, e.message), e.line, e.col, e.index));
            }
        }
        Some((spec, id, components, fns))
    }

    /// Archivo de módulo — destino de un `import`. Solo `component`/`fn` (y
    /// otros `import`); un App/state a nivel top-level es un error.
    fn parse_module(&mut self) -> (Vec<Value>, Vec<Value>) {
        let mut components: Vec<Value> = Vec::new();
        let mut fns: Vec<Value> = Vec::new();
        while !self.at_end() {
            if self.at_keyword("import") {
                if let Some((_, _, mod_components, mod_fns)) = self.parse_import() {
                    for c in mod_components {
                        let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if components.iter().any(|x| x.get("name").and_then(|v| v.as_str()) == Some(name.as_str()))
                        {
                            self.error(format!("duplicate component \"{}\" in module", name), &self.peek(0));
                            continue;
                        }
                        components.push(c);
                    }
                    for f in mod_fns {
                        let name = f.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if fns.iter().any(|x| x.get("name").and_then(|v| v.as_str()) == Some(name.as_str())) {
                            self.error(format!("duplicate function \"{}\" in module", name), &self.peek(0));
                            continue;
                        }
                        fns.push(f);
                    }
                }
                continue;
            }
            let tok = self.peek(0);
            if tok.kind.keyword() == Some("component") {
                self.next();
                if let Some(c) = self.parse_component_def(&components) {
                    components.push(c);
                }
            } else if tok.kind.keyword() == Some("fn") {
                // En módulos el def de fn lleva `loc` (del keyword 'fn'), como en el JS.
                let kw_loc = tok_loc(&tok);
                self.next();
                if let Some(f) = self.parse_fn_def(&fns, Some(kw_loc)) {
                    fns.push(f);
                }
            } else if tok.kind.keyword() == Some("App") {
                self.error(
                    "a module file cannot contain an App block (only component/fn definitions)".to_string(),
                    &tok,
                );
                self.recover_module();
            } else if tok.kind.keyword().is_some() {
                let kw = tok.kind.keyword().unwrap().to_string();
                self.error(
                    format!("\"{}\" is not allowed in a module file (only component/fn definitions)", kw),
                    &tok,
                );
                self.recover_module();
            } else if let TokenKind::Ident(_) = &tok.kind {
                self.error(format!("unexpected \"{}\" in module file", tok_display(&tok)), &tok);
                self.recover_module();
            } else {
                self.error("unexpected token in module file".to_string(), &tok);
                self.recover_module();
            }
        }
        (components, fns)
    }

    /// Recuperación de módulo: salta hasta la siguiente definición o EOF.
    fn recover_module(&mut self) {
        while !self.at_end() {
            let t = self.peek(0);
            if let TokenKind::Keyword(k) = &t.kind {
                if k == "component" || k == "fn" || k == "import" {
                    return;
                }
            }
            self.next();
        }
    }

    // =======================================================================
    // Custom components
    // =======================================================================
    /// `component Name(a, b: Type) { ... }` → definición JSON. El token actual
    /// debe ser el nombre (la palabra clave ya se consumió).
    fn parse_component_def(&mut self, existing: &[Value]) -> Option<Value> {
        let name_tok = self.next();
        let name = match &name_tok.kind {
            TokenKind::Ident(n) => n.clone(),
            _ => {
                self.error("expected a component name after \"component\"".to_string(), &name_tok);
                self.recover();
                return None;
            }
        };
        if COMPONENT_NAMES.contains(&name.as_str()) {
            self.error(format!("cannot redefine built-in component \"{}\"", name), &name_tok);
            self.recover();
            return None;
        }
        if !name.chars().next().map_or(false, |c| c.is_ascii_uppercase()) {
            self.error("component names must start with an uppercase letter".to_string(), &name_tok);
        }
        if existing.iter().any(|c| c.get("name").and_then(|v| v.as_str()) == Some(name.as_str())) {
            self.error(format!("duplicate component \"{}\"", name), &name_tok);
            self.recover();
            return None;
        }
        let params = self.parse_params();
        let (states, derived, fns, children) = self.parse_component_body();
        Some(json!({
            "name": name,
            "params": params,
            "states": Value::Object(states),
            "derived": Value::Object(derived),
            "fns": fns,
            "children": children,
            "loc": tok_loc(&name_tok),
        }))
    }

    /// `(a, b: Type, ...)` — compartido por fn y component definitions.
    fn parse_params(&mut self) -> Vec<Value> {
        let mut params: Vec<Value> = Vec::new();
        self.eat_punct("(");
        while !self.at_punct(")") {
            if self.at_end() {
                self.error("unexpected end of file in parameter list".to_string(), &self.peek(0));
                break;
            }
            let p = self.next();
            if let TokenKind::Ident(pname) = &p.kind {
                let mut param = json!({ "name": pname });
                // Anotación de tipo opcional (se parsea, reservada para el futuro)
                if self.at_punct(":") {
                    self.next();
                    let t = self.next();
                    if let TokenKind::Ident(ty) = &t.kind {
                        param["type"] = json!(ty);
                    } else {
                        self.error("expected a type name after \":\"".to_string(), &t);
                    }
                }
                if !self.at_punct(")") {
                    self.eat_punct(",");
                }
                params.push(param);
            } else {
                self.error("expected a parameter name".to_string(), &p);
            }
        }
        self.eat_punct(")");
        params
    }

    /// Cuerpo de un componente: state/derived/fn + nodos UI.
    fn parse_component_body(&mut self) -> (Map<String, Value>, Map<String, Value>, Vec<Value>, Vec<Value>) {
        let mut states: Map<String, Value> = Map::new();
        let mut derived: Map<String, Value> = Map::new();
        let mut fns: Vec<Value> = Vec::new();
        let mut children: Vec<Value> = Vec::new();

        self.eat_punct("{");
        while !self.at_punct("}") {
            if self.at_end() {
                self.error("missing closing \"}\" for component body".to_string(), &self.peek(0));
                break;
            }
            let tok = self.peek(0);

            // if / for
            if let TokenKind::Keyword(k) = &tok.kind {
                if k == "if" || k == "for" {
                    if let Some(node) = self.parse_ui_node() {
                        children.push(node);
                    }
                    continue;
                }
            }
            // Built-in components
            if let TokenKind::Ident(name) = &tok.kind {
                if COMPONENT_NAMES.contains(&name.as_str()) {
                    if let Some(node) = self.parse_component() {
                        children.push(node);
                    }
                    continue;
                }
            }
            // Custom component instance
            if let TokenKind::Ident(name) = &tok.kind {
                if !COMPONENT_NAMES.contains(&name.as_str()) && self.peek(1).kind.punct() == Some("{") {
                    if let Some(node) = self.parse_custom_component() {
                        children.push(node);
                    }
                    continue;
                }
            }

            let key = match &tok.kind {
                TokenKind::Ident(s) | TokenKind::Keyword(s) => s.clone(),
                _ => {
                    self.error(format!("unexpected token \"{}\" in component body", tok_display(&tok)), &tok);
                    self.recover();
                    continue;
                }
            };
            self.next();

            match key.as_str() {
                "state" | "derived" => {
                    let is_derived = key == "derived";
                    let name_tok = self.next();
                    if let TokenKind::Ident(name) = &name_tok.kind {
                        let target = if is_derived { &mut derived } else { &mut states };
                        if target.contains_key(name) {
                            let label = if is_derived { "derived" } else { "state" };
                            self.error(format!("duplicate {} variable \"{}\"", label, name), &name_tok);
                        }
                        self.eat_punct("=");
                        if let Some(expr) = self.parse_expr() {
                            target.insert(
                                name.clone(),
                                json!({
                                    "expr": expr,
                                    "loc": { "line": name_tok.line, "col": name_tok.col },
                                }),
                            );
                        } else {
                            self.recover();
                        }
                    } else {
                        let label = if is_derived { "derived" } else { "state" };
                        self.error(format!("expected a {} variable name", label), &name_tok);
                        self.recover();
                    }
                }
                "fn" => {
                    // 'fn' consumida como `key`; parse_fn_def lee el nombre.
                    if let Some(f) = self.parse_fn_def(&fns, None) {
                        fns.push(f);
                    }
                }
                _ if key.starts_with(|c: char| c.is_ascii_uppercase()) => {
                    self.error(format!("unknown component \"{}\"", key), &tok);
                    self.recover();
                }
                _ => {
                    self.error(format!("unexpected \"{}\" in component body", key), &tok);
                    self.recover();
                }
            }
        }
        self.eat_punct("}");
        (states, derived, fns, children)
    }

    /// `fn name(params) { ... }` → definición. El token actual debe ser el
    /// nombre (la palabra clave `fn` ya se consumió, igual que en el JS).
    /// `kw_loc` solo se incluye cuando el JS lo incluye (defs en módulos).
    fn parse_fn_def(&mut self, existing: &[Value], kw_loc: Option<Value>) -> Option<Value> {
        let name_tok = self.next();
        if let TokenKind::Ident(fname) = &name_tok.kind {
            if existing.iter().any(|f| f.get("name").and_then(|v| v.as_str()) == Some(fname.as_str())) {
                self.error(format!("duplicate function \"{}\"", fname), &name_tok);
            }
            let params = self.parse_params();
            let body = self.parse_block();
            let mut def = json!({ "name": fname, "params": params, "body": body });
            if let Some(loc) = kw_loc {
                def["loc"] = loc;
            }
            Some(def)
        } else {
            self.error("expected a function name".to_string(), &name_tok);
            self.recover();
            None
        }
    }

    /// Instancia de componente personalizado: `Name { prop: <expr>, ... }`.
    fn parse_custom_component(&mut self) -> Option<Value> {
        let name_tok = self.next();
        let name = match &name_tok.kind {
            TokenKind::Ident(n) => n.clone(),
            _ => return None,
        };
        let mut props: Map<String, Value> = Map::new();
        let mut seen: Vec<String> = Vec::new();

        self.eat_punct("{");
        while !self.at_punct("}") {
            if self.at_end() {
                self.error(format!("missing closing \"}}\" for {}", name), &name_tok);
                break;
            }
            let tok = self.peek(0);
            let key = match &tok.kind {
                TokenKind::Ident(s) => s.clone(),
                _ => {
                    self.error(format!("unexpected token \"{}\" inside {}", tok_display(&tok), name), &tok);
                    self.recover();
                    continue;
                }
            };
            self.next();
            if seen.contains(&key) {
                self.error(format!("duplicate prop \"{}\"", key), &tok);
            }
            seen.push(key.clone());
            self.eat_punct(":");
            match self.parse_expr() {
                Some(e) => {
                    props.insert(key, e);
                }
                None => {
                    self.recover();
                    continue;
                }
            }
            if self.at_punct(",") {
                self.next();
            }
        }
        self.eat_punct("}");
        Some(json!({
            "type": "Component",
            "name": name,
            "props": Value::Object(props),
            "loc": tok_loc(&name_tok),
        }))
    }

    // =======================================================================
    // Components
    // =======================================================================
    fn parse_component(&mut self) -> Option<Value> {
        let name_tok = self.next();
        let name = match &name_tok.kind {
            TokenKind::Ident(n) => n.clone(),
            _ => return None,
        };
        let (container, props_def) = match schema_for(&name) {
            Some(s) => s,
            None => {
                self.error(format!("unknown component \"{}\"", name), &name_tok);
                return None;
            }
        };

        let mut props: Map<String, Value> = Map::new();
        let mut children: Vec<Value> = Vec::new();
        let mut onClick: Option<Vec<Value>> = None;
        let mut onChange: Option<Vec<Value>> = None;
        let mut seen: Vec<String> = Vec::new();

        self.eat_punct("{");
        while !self.at_punct("}") {
            if self.at_end() {
                self.error(format!("missing closing \"}}\" for {}", name), &name_tok);
                break;
            }
            let tok = self.peek(0);

            // Nested component (containers only)
            if let TokenKind::Ident(cname) = &tok.kind {
                if COMPONENT_NAMES.contains(&cname.as_str()) {
                    if !container {
                        self.error(format!("{} cannot contain components", name), &tok);
                        self.next();
                        continue;
                    }
                    if let Some(child) = self.parse_component() {
                        children.push(child);
                    }
                    continue;
                }
            }

            // if / for blocks in the UI tree (containers only)
            if let TokenKind::Keyword(k) = &tok.kind {
                if k == "if" || k == "for" {
                    if !container {
                        self.error(format!("{} cannot contain {} blocks", name, k), &tok);
                        self.skip_ui_node();
                        continue;
                    }
                    if let Some(node) = self.parse_ui_node() {
                        children.push(node);
                    }
                    continue;
                }
            }

            // Custom component instance (containers only)
            if let TokenKind::Ident(cname) = &tok.kind {
                if !COMPONENT_NAMES.contains(&cname.as_str()) && self.peek(1).kind.punct() == Some("{") {
                    if !container {
                        self.error(format!("{} cannot contain components", name), &tok);
                        self.skip_ui_node();
                        continue;
                    }
                    if let Some(child) = self.parse_custom_component() {
                        children.push(child);
                    }
                    continue;
                }
            }

            let key = match &tok.kind {
                TokenKind::Ident(s) => s.clone(),
                _ => {
                    self.error(format!("unexpected token \"{}\" inside {}", tok_display(&tok), name), &tok);
                    self.recover();
                    continue;
                }
            };
            self.next();

            if key == "onClick" {
                if name != "Button" {
                    self.error("onClick is only supported on Button".to_string(), &tok);
                }
                if seen.contains(&"onClick".to_string()) {
                    self.error("duplicate prop \"onClick\"".to_string(), &tok);
                }
                seen.push("onClick".to_string());
                self.eat_punct(":");
                onClick = Some(self.parse_handler());
                continue;
            }

            if key == "onChange" {
                if !["TextInput", "Select", "Slider", "Checkbox"].contains(&name.as_str()) {
                    self.error(
                        "onChange is only supported on TextInput, Select, Slider and Checkbox".to_string(),
                        &tok,
                    );
                }
                if seen.contains(&"onChange".to_string()) {
                    self.error("duplicate prop \"onChange\"".to_string(), &tok);
                }
                seen.push("onChange".to_string());
                self.eat_punct(":");
                onChange = Some(self.parse_handler());
                continue;
            }

            // `bind` accepts an unquoted state variable name: bind: name
            if key == "bind" {
                if seen.contains(&"bind".to_string()) {
                    self.error("duplicate prop \"bind\"".to_string(), &tok);
                }
                seen.push("bind".to_string());
                self.eat_punct(":");
                let t = self.peek(0);
                match &t.kind {
                    TokenKind::Ident(n) => {
                        self.next();
                        props.insert("bind".to_string(), json!(n));
                    }
                    TokenKind::Str(s) => {
                        self.next();
                        props.insert("bind".to_string(), json!(s));
                    }
                    _ => {
                        self.error("\"bind\" expects a state variable name".to_string(), &t);
                        self.recover();
                    }
                }
                continue;
            }

            let def = match props_def.iter().find(|(k, _)| *k == key).map(|(_, d)| d) {
                Some(d) => d,
                None => {
                    self.error(format!("unknown prop \"{}\" on {}", key, name), &tok);
                    self.recover();
                    continue;
                }
            };
            if seen.contains(&key) {
                self.error(format!("duplicate prop \"{}\"", key), &tok);
            }
            seen.push(key.clone());

            self.eat_punct(":");

            if def.t == "strArray" {
                if self.at_punct("[") {
                    self.next();
                    let mut list: Vec<Value> = Vec::new();
                    while !self.at_punct("]") {
                        if self.at_end() {
                            self.error("missing closing \"]\" for list prop".to_string(), &tok);
                            break;
                        }
                        match self.parse_value() {
                            Some(Prim::Str(s)) => list.push(json!(s)),
                            _ => self.error(
                                format!("\"{}\" must be a list of strings: [\"a\", \"b\"]", key),
                                &tok,
                            ),
                        }
                        if !self.at_punct("]") {
                            self.eat_punct(",");
                        }
                    }
                    self.eat_punct("]");
                    props.insert(key.clone(), Value::Array(list));
                } else {
                    self.error(format!("\"{}\" must be a list of strings: [\"a\", \"b\"]", key), &tok);
                }
                continue;
            }

            match self.parse_value() {
                None => self.recover(),
                Some(v) => {
                    if let Some(val) = self.check_prop(&key, def, v, &tok) {
                        props.insert(key.clone(), val);
                    }
                }
            }
        }
        self.eat_punct("}");

        // Required props
        for (k, d) in props_def {
            if d.required && !props.contains_key(*k) {
                self.error(format!("{} requires prop \"{}\"", name, k), &name_tok);
            }
        }
        if name == "Button" && onClick.is_none() {
            self.error("Button requires an \"onClick\" handler".to_string(), &name_tok);
        }

        let mut node = json!({
            "type": name,
            "props": Value::Object(props),
            "children": children,
            "loc": tok_loc(&name_tok),
        });
        if let Some(h) = onClick {
            node["onClick"] = Value::Array(h);
        }
        if let Some(h) = onChange {
            node["onChange"] = Value::Array(h);
        }
        Some(node)
    }

    /// Nodo de UI: un componente o un bloque if/for.
    fn parse_ui_node(&mut self) -> Option<Value> {
        let tok = self.peek(0);
        if let TokenKind::Keyword(k) = &tok.kind {
            if k == "if" {
                self.next();
                self.eat_punct("(");
                let cond = self.parse_expr()?;
                self.eat_punct(")");
                let children = self.parse_ui_children(&tok);
                let mut els: Vec<Value> = Vec::new();
                if self.at_keyword("else") {
                    self.next();
                    els = self.parse_ui_children(&tok);
                }
                return Some(json!({
                    "type": "If", "cond": cond, "children": children, "else": els, "loc": tok_loc(&tok),
                }));
            }
            if k == "for" {
                self.next();
                self.eat_punct("(");
                let item_tok = self.next();
                let item = if let TokenKind::Ident(n) = &item_tok.kind {
                    n.clone()
                } else {
                    self.error("expected an item name after \"for (\"".to_string(), &item_tok);
                    return None;
                };
                self.eat_keyword("in");
                let iterable = self.parse_expr()?;
                self.eat_punct(")");
                let children = self.parse_ui_children(&tok);
                return Some(json!({
                    "type": "For", "item": item, "iterable": iterable, "children": children, "loc": tok_loc(&tok),
                }));
            }
        }
        // Custom component instance
        if let TokenKind::Ident(n) = &tok.kind {
            if !COMPONENT_NAMES.contains(&n.as_str()) && self.peek(1).kind.punct() == Some("{") {
                return self.parse_custom_component();
            }
        }
        self.parse_component()
    }

    /// Hijos de un bloque if/for: componentes e if/for anidados.
    fn parse_ui_children(&mut self, owner: &Token) -> Vec<Value> {
        self.eat_punct("{");
        let mut children: Vec<Value> = Vec::new();
        while !self.at_punct("}") {
            if self.at_end() {
                self.error(
                    format!("missing closing \"}}\" for {} block", tok_display(owner)),
                    owner,
                );
                break;
            }
            match self.parse_ui_node() {
                Some(n) => children.push(n),
                None => self.recover(),
            }
        }
        self.eat_punct("}");
        children
    }

    /// Salta un bloque if/for tras un error (el token actual es 'if' o 'for').
    fn skip_ui_node(&mut self) {
        let mut depth = 0usize;
        let mut in_body = false;
        loop {
            if self.at_end() {
                return;
            }
            let t = self.next();
            if t.kind.punct() == Some("{") {
                depth += 1;
                in_body = true;
            } else if t.kind.punct() == Some("}") {
                if !in_body {
                    return;
                }
                depth -= 1;
                if depth == 0 {
                    return;
                }
            }
        }
    }

    fn check_prop(&mut self, key: &str, def: &PropDef, v: Prim, tok: &Token) -> Option<Value> {
        match def.t {
            "strEnum" => {
                let val = match &v {
                    Prim::Str(s) => Some(s.clone()),
                    _ => None,
                };
                match val {
                    Some(s) if def.allowed.contains(&s.as_str()) => Some(json!(s)),
                    _ => {
                        self.error(format!("\"{}\" must be one of: {}", key, def.allowed.join(", ")), tok);
                        None
                    }
                }
            }
            "str" => match v {
                Prim::Str(s) => {
                    // Solo value/text conservan las partes de interpolación; el
                    // resto (id, src, label, placeholder, color) son strings planos.
                    if key == "value" || key == "text" {
                        let parts = if s.contains("${") {
                            self.interp_parts(&s, tok)
                        } else {
                            vec![json!({ "text": s })]
                        };
                        Some(Value::Array(parts))
                    } else {
                        Some(json!(s))
                    }
                }
                _ => {
                    self.error(format!("\"{}\" must be a string", key), tok);
                    None
                }
            },
            "bool" => match v {
                Prim::Bool(b) => Some(json!(b)),
                _ => {
                    self.error(format!("\"{}\" must be true or false", key), tok);
                    None
                }
            },
            "int" => match v {
                Prim::Int(n) => Some(json!(n)),
                _ => {
                    self.error(format!("\"{}\" must be an integer", key), tok);
                    None
                }
            },
            "num" | "float" => match v {
                Prim::Int(n) => Some(json!(n)),
                Prim::Float(f) => {
                    if f.fract() == 0.0 {
                        Some(json!(f as i64))
                    } else {
                        Some(json!(f))
                    }
                }
                _ => {
                    self.error(format!("\"{}\" must be a number", key), tok);
                    None
                }
            },
            _ => None,
        }
    }

    /// onClick/onChange: una sentencia o un { bloque }.
    fn parse_handler(&mut self) -> Vec<Value> {
        if self.at_punct("{") {
            return self.parse_block();
        }
        match self.parse_statement() {
            Some(s) => vec![s],
            None => Vec::new(),
        }
    }

    // =======================================================================
    // Statements
    // =======================================================================
    fn parse_block(&mut self) -> Vec<Value> {
        self.eat_punct("{");
        let mut stmts: Vec<Value> = Vec::new();
        while !self.at_punct("}") {
            if self.at_end() {
                self.error("missing closing \"}\"".to_string(), &self.peek(0));
                break;
            }
            match self.parse_statement() {
                Some(s) => stmts.push(s),
                None => self.recover(),
            }
            if self.at_punct(";") {
                self.next();
            }
        }
        self.eat_punct("}");
        stmts
    }

    fn parse_statement(&mut self) -> Option<Value> {
        let tok = self.peek(0);

        if let TokenKind::Keyword(kw) = &tok.kind {
            match kw.as_str() {
                "let" => {
                    self.next();
                    let name_tok = self.next();
                    if let TokenKind::Ident(name) = &name_tok.kind {
                        self.eat_punct("=");
                        let expr = self.parse_expr()?;
                        return Some(json!({
                            "type": "Let", "name": name, "expr": expr, "loc": tok_loc(&tok),
                        }));
                    }
                    self.error("expected a variable name after \"let\"".to_string(), &name_tok);
                    return None;
                }
                "if" => {
                    self.next();
                    self.eat_punct("(");
                    let cond = self.parse_expr()?;
                    self.eat_punct(")");
                    let then = self.parse_block();
                    let mut els: Vec<Value> = Vec::new();
                    if self.at_keyword("else") {
                        self.next();
                        if self.at_keyword("if") {
                            // else-if: desugar a If anidado
                            if let Some(n) = self.parse_statement() {
                                els.push(json!({
                                    "type": "If",
                                    "cond": n.get("cond").cloned().unwrap_or(Value::Null),
                                    "then": n.get("then").cloned().unwrap_or_else(|| Value::Array(vec![])),
                                    "else": n.get("else").cloned().unwrap_or_else(|| Value::Array(vec![])),
                                    "loc": tok_loc(&tok),
                                }));
                            }
                        } else {
                            els = self.parse_block();
                        }
                    }
                    return Some(json!({
                        "type": "If", "cond": cond, "then": then, "else": els, "loc": tok_loc(&tok),
                    }));
                }
                "while" => {
                    self.next();
                    self.eat_punct("(");
                    let cond = self.parse_expr()?;
                    self.eat_punct(")");
                    let body = self.parse_block();
                    return Some(json!({
                        "type": "While", "cond": cond, "body": body, "loc": tok_loc(&tok),
                    }));
                }
                "for" => {
                    self.next();
                    self.eat_punct("(");
                    let item_tok = self.next();
                    let item = if let TokenKind::Ident(n) = &item_tok.kind {
                        n.clone()
                    } else {
                        self.error("expected an item name after \"for (\"".to_string(), &item_tok);
                        return None;
                    };
                    self.eat_keyword("in");
                    let iterable = self.parse_expr()?;
                    self.eat_punct(")");
                    let body = self.parse_block();
                    return Some(json!({
                        "type": "For", "item": item, "iterable": iterable, "body": body, "loc": tok_loc(&tok),
                    }));
                }
                "return" => {
                    self.next();
                    let expr = if self.at_punct("}") || self.at_punct(";") || self.at_end() {
                        Value::Null
                    } else {
                        self.parse_expr().unwrap_or(Value::Null)
                    };
                    return Some(json!({ "type": "Return", "expr": expr, "loc": tok_loc(&tok) }));
                }
                _ => {
                    self.error(format!("unexpected keyword \"{}\"", kw), &tok);
                    self.next();
                    return None;
                }
            }
        }

        if tok.kind.punct() == Some("{") {
            let body = self.parse_block();
            return Some(json!({ "type": "Block", "body": body, "loc": tok_loc(&tok) }));
        }

        if let TokenKind::Ident(_) = &tok.kind {
            let nxt = self.peek(1);
            if nxt.kind.punct() == Some("=") {
                let target = self.next();
                self.next(); // '='
                let expr = self.parse_expr()?;
                let tname = match &target.kind {
                    TokenKind::Ident(n) => n.clone(),
                    _ => String::new(),
                };
                return Some(json!({ "type": "Assign", "target": tname, "expr": expr, "loc": tok_loc(&target) }));
            }
            if nxt.kind.punct() == Some(":") {
                // `name: Type = expr` — forma heredada; se trata como assign plano.
                let target = self.next();
                self.next(); // ':'
                let t = self.next();
                if !matches!(t.kind, TokenKind::Ident(_)) {
                    self.error("expected a type name".to_string(), &t);
                }
                self.eat_punct("=");
                let expr = self.parse_expr()?;
                let tname = match &target.kind {
                    TokenKind::Ident(n) => n.clone(),
                    _ => String::new(),
                };
                return Some(json!({ "type": "Assign", "target": tname, "expr": expr, "loc": tok_loc(&target) }));
            }
        }

        if let Some(expr) = self.parse_expr() {
            if expr.get("type").and_then(|v| v.as_str()) == Some("Call") {
                let name = expr.get("name").cloned().unwrap_or(Value::Null);
                let args = expr.get("args").cloned().unwrap_or_else(|| Value::Array(vec![]));
                return Some(json!({ "type": "Call", "name": name, "args": args, "loc": tok_loc(&tok) }));
            }
        }
        self.error(
            "expected a statement (assignment, call, let, if, while, for, return)".to_string(),
            &tok,
        );
        None
    }

    // =======================================================================
    // Expressions — precedence climbing
    // =======================================================================
    fn parse_expr(&mut self) -> Option<Value> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Option<Value> {
        let mut left = self.parse_and()?;
        while self.at_punct("||") {
            self.next();
            let right = self.parse_and()?;
            left = bin("||", left, right);
        }
        Some(left)
    }

    fn parse_and(&mut self) -> Option<Value> {
        let mut left = self.parse_eq()?;
        while self.at_punct("&&") {
            self.next();
            let right = self.parse_eq()?;
            left = bin("&&", left, right);
        }
        Some(left)
    }

    fn parse_eq(&mut self) -> Option<Value> {
        let mut left = self.parse_cmp()?;
        while self.at_punct("==") || self.at_punct("!=") {
            let op = self.next().kind.punct().unwrap().to_string();
            let right = self.parse_cmp()?;
            left = bin(&op, left, right);
        }
        Some(left)
    }

    fn parse_cmp(&mut self) -> Option<Value> {
        let mut left = self.parse_add()?;
        while ["<", "<=", ">", ">="].iter().any(|p| self.at_punct(p)) {
            let op = self.next().kind.punct().unwrap().to_string();
            let right = self.parse_add()?;
            left = bin(&op, left, right);
        }
        Some(left)
    }

    fn parse_add(&mut self) -> Option<Value> {
        let mut left = self.parse_mul()?;
        while self.at_punct("+") || self.at_punct("-") {
            let op = self.next().kind.punct().unwrap().to_string();
            let right = self.parse_mul()?;
            left = bin(&op, left, right);
        }
        Some(left)
    }

    fn parse_mul(&mut self) -> Option<Value> {
        let mut left = self.parse_unary()?;
        while self.at_punct("*") || self.at_punct("/") || self.at_punct("%") {
            let op = self.next().kind.punct().unwrap().to_string();
            let right = self.parse_unary()?;
            left = bin(&op, left, right);
        }
        Some(left)
    }

    fn parse_unary(&mut self) -> Option<Value> {
        if self.at_punct("-") || self.at_punct("!") {
            let op = self.next().kind.punct().unwrap().to_string();
            let operand = self.parse_unary()?;
            return Some(json!({ "type": "Unary", "op": op, "operand": operand }));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Option<Value> {
        let tok = self.peek(0);
        match &tok.kind {
            TokenKind::Int(v) => {
                self.next();
                Some(json!({ "type": "Int", "value": v }))
            }
            TokenKind::Float(v) => {
                self.next();
                Some(json!({ "type": "Float", "value": v }))
            }
            TokenKind::Keyword(k) if k == "true" || k == "false" => {
                self.next();
                Some(json!({ "type": "Bool", "value": k == "true" }))
            }
            TokenKind::Str(s) => {
                self.next();
                Some(json!({ "type": "Str", "parts": self.interp_parts(s, &tok) }))
            }
            TokenKind::Punct(p) if p == "[" => {
                self.next();
                let mut items: Vec<Value> = Vec::new();
                while !self.at_punct("]") {
                    if self.at_end() {
                        self.error("missing closing \"]\" for array".to_string(), &self.peek(0));
                        break;
                    }
                    if let Some(item) = self.parse_expr() {
                        items.push(item);
                    }
                    if !self.at_punct("]") {
                        self.eat_punct(",");
                    }
                }
                self.eat_punct("]");
                Some(json!({ "type": "Array", "items": items }))
            }
            TokenKind::Punct(p) if p == "(" => {
                self.next();
                let expr = self.parse_expr();
                self.eat_punct(")");
                expr
            }
            TokenKind::Ident(name) => {
                self.next();
                if self.at_punct("(") {
                    self.next();
                    let mut args: Vec<Value> = Vec::new();
                    while !self.at_punct(")") {
                        if self.at_end() {
                            self.error("missing closing \")\" for call".to_string(), &self.peek(0));
                            break;
                        }
                        if let Some(arg) = self.parse_expr() {
                            args.push(arg);
                        }
                        if !self.at_punct(")") {
                            self.eat_punct(",");
                        }
                    }
                    self.eat_punct(")");
                    Some(json!({ "type": "Call", "name": name, "args": args }))
                } else {
                    Some(json!({ "type": "Var", "name": name }))
                }
            }
            _ => {
                let display = if tok.kind.is_eof() {
                    "end of file".to_string()
                } else {
                    tok_display(&tok)
                };
                self.error(format!("expected an expression, found \"{}\"", display), &tok);
                None
            }
        }
    }

    // =======================================================================
    // Literales de props e interpolación
    // =======================================================================
    fn parse_value(&mut self) -> Option<Prim> {
        let tok = self.peek(0);
        match &tok.kind {
            TokenKind::Int(v) => {
                self.next();
                Some(Prim::Int(*v))
            }
            TokenKind::Float(v) => {
                self.next();
                Some(Prim::Float(*v))
            }
            TokenKind::Str(s) => {
                self.next();
                Some(Prim::Str(s.clone()))
            }
            TokenKind::Keyword(k) if k == "true" || k == "false" => {
                self.next();
                Some(Prim::Bool(k == "true"))
            }
            _ => {
                self.error("expected a literal value (string, number, true, false)".to_string(), &tok);
                None
            }
        }
    }

    /// Divide un string crudo en partes de interpolación:
    /// `[{ "text": "Hola " }, { "expr": {type:Var,...} }, { "text": "!" }]`
    fn interp_parts(&mut self, raw: &str, str_tok: &Token) -> Vec<Value> {
        let mut parts: Vec<Value> = Vec::new();
        let mut rest = raw.to_string();
        let mut text = String::new();
        loop {
            match rest.find("${") {
                None => {
                    let tail = format!("{}{}", text, rest);
                    if !tail.is_empty() || parts.is_empty() {
                        parts.push(json!({ "text": tail }));
                    }
                    break;
                }
                Some(idx) => {
                    text.push_str(&rest[..idx]);
                    let after = &rest[idx + 2..];
                    let mut depth = 0i32;
                    let mut end: Option<usize> = None;
                    for (j, ch) in after.char_indices() {
                        if ch == '{' {
                            depth += 1;
                        } else if ch == '}' {
                            if depth == 0 {
                                end = Some(j);
                                break;
                            }
                            depth -= 1;
                        }
                    }
                    let end = match end {
                        Some(e) => e,
                        None => {
                            self.error(
                                "unterminated interpolation \"${\" — missing \"}\"".to_string(),
                                str_tok,
                            );
                            parts.push(json!({ "text": format!("{}{}", text, rest) }));
                            break;
                        }
                    };
                    let inner = &after[..end];
                    if !text.is_empty() {
                        parts.push(json!({ "text": text }));
                        text = String::new();
                    }
                    let expr = self.parse_interp_expr(inner, str_tok);
                    parts.push(json!({ "expr": expr }));
                    rest = after[end + 1..].to_string();
                }
            }
        }
        parts
    }

    fn interp_parts_to_plain(&mut self, raw: &str, tok: &Token) -> String {
        self.interp_parts(raw, tok)
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect()
    }

    fn parse_interp_expr(&mut self, src: &str, str_tok: &Token) -> Value {
        let (tokens, lex_errors) = lex(src);
        let mut sub = Parser::new(tokens, lex_errors);
        let expr = sub.parse_expr();
        let ok = expr.is_some() && sub.errors.is_empty() && sub.at_end();
        if !ok {
            self.error(format!("invalid expression inside \"${{...}}\": \"{}\"", src), str_tok);
            return json!({ "type": "Str", "parts": [{ "text": src }] });
        }
        expr.unwrap()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
enum Prim {
    Int(i64),
    Float(f64),
    Str(String),
    Bool(bool),
}

fn bin(op: &str, left: Value, right: Value) -> Value {
    json!({ "type": "Binary", "op": op, "left": left, "right": right })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn parse(src: &str) -> Value {
        let (tokens, lex_errors) = lex(src);
        let mut parser = Parser::new(tokens, lex_errors);
        let program = parser.parse_program();
        assert!(parser.errors.is_empty(), "unexpected errors: {:?}", parser.errors);
        program
    }

    #[test]
    fn lexes_basic_tokens() {
        let (tokens, errors) = lex("App { title: \"x\" } // c");
        assert!(errors.is_empty());
        assert!(tokens[0].kind.keyword() == Some("App"));
        assert!(tokens.iter().any(|t| t.kind.punct() == Some("{")));
    }

    #[test]
    fn parses_minimal_app() {
        let p = parse("App { title: \"Demo\" size: (400, 300) }");
        assert_eq!(p["title"], "Demo");
        assert_eq!(p["size"], json!([400, 300]));
        assert_eq!(p["theme"], "light");
        assert_eq!(p["components"], json!([]));
        assert_eq!(p["imports"], json!([]));
    }

    #[test]
    fn parses_derived() {
        let p = parse(
            "App { title: \"x\" size: (1,1) state a = 1 derived d = a * 2 }",
        );
        assert_eq!(p["derivedOrder"], json!(["d"]));
        assert_eq!(p["derived"]["d"]["expr"]["type"], "Binary");
    }

    #[test]
    fn parses_ui_if_for() {
        let p = parse(
            "App { title: \"x\" size: (1,1) state ok = true Column { if (ok) { Text { value: \"a\" } } else { Text { value: \"b\" } } for (x in [1]) { Text { value: \"n\" } } } }",
        );
        let col = &p["ui"]["children"][0];
        assert_eq!(col["type"], "Column");
        assert_eq!(col["children"][0]["type"], "If");
        assert_eq!(col["children"][0]["else"][0]["type"], "Text");
        assert_eq!(col["children"][1]["type"], "For");
    }

    #[test]
    fn parses_custom_components() {
        let p = parse(
            "App { title: \"x\" size: (1,1) component Card(t) { state n = t derived d = n * 2 fn up() { return n + 1 } Column { Text { value: \"${n}\" } } } Column { Card { t: 1 } } }",
        );
        assert_eq!(p["components"][0]["name"], "Card");
        assert_eq!(p["components"][0]["params"][0]["name"], "t");
        assert_eq!(p["components"][0]["states"]["n"]["expr"]["type"], "Var");
        assert_eq!(p["components"][0]["derived"]["d"]["expr"]["type"], "Binary");
        assert_eq!(p["components"][0]["fns"][0]["name"], "up");
        let inst = &p["ui"]["children"][0]["children"][0];
        assert_eq!(inst["type"], "Component");
        assert_eq!(inst["name"], "Card");
        assert_eq!(inst["props"]["t"]["value"], 1);
    }

    #[test]
    fn parses_select_slider_onchange() {
        let p = parse(
            "App { title: \"x\" size: (1,1) state s = 0 Select { id: \"a\" options: [\"x\", \"y\"] bind: s onChange: s = 1 } Slider { id: \"b\" min: 0 max: 10 bind: s } TextInput { id: \"t\" bind: s onChange: s = 2 } }",
        );
        let sel = &p["ui"]["children"][0];
        assert_eq!(sel["type"], "Select");
        assert_eq!(sel["props"]["options"], json!(["x", "y"]));
        assert_eq!(sel["props"]["bind"], "s");
        assert_eq!(sel["onChange"][0]["type"], "Assign");
        let slider = &p["ui"]["children"][1];
        assert_eq!(slider["type"], "Slider");
        assert_eq!(slider["props"]["max"], 10);
        let input = &p["ui"]["children"][2];
        assert_eq!(input["type"], "TextInput");
        assert_eq!(input["props"]["bind"], "s");
        assert_eq!(input["onChange"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn parses_imports() {
        let dir = std::env::temp_dir().join(format!("kara-parser-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        fs::write(
            dir.join("widgets.kara"),
            "component Card(t) { Text { value: \"${t}\" } }\nfn helper() { return 1 }\n",
        )
        .unwrap();
        let src = "import \"./widgets.kara\"\nApp { title: \"x\" size: (1,1) Column { Card { t: 1 } } }";
        let (tokens, lex_errors) = lex(src);
        let mut parser =
            Parser::with_dir(tokens, lex_errors, Some(dir.clone()), Rc::new(RefCell::new(Vec::new())));
        let program = parser.parse_program();
        assert!(parser.errors.is_empty(), "errors: {:?}", parser.errors);
        assert_eq!(program["components"][0]["name"], "Card");
        assert_eq!(program["fns"][0]["name"], "helper");
        assert_eq!(program["imports"][0]["spec"], "./widgets.kara");
        // El módulo no puede contener un App block.
        fs::write(dir.join("bad.kara"), "App { title: \"x\" size: (1,1) }").unwrap();
        let src2 = "import \"./bad.kara\"\nApp { title: \"x\" size: (1,1) }";
        let (tokens2, lex_errors2) = lex(src2);
        let mut parser2 =
            Parser::with_dir(tokens2, lex_errors2, Some(dir), Rc::new(RefCell::new(Vec::new())));
        parser2.parse_program();
        assert!(parser2.errors.iter().any(|e| e.message.contains("module file cannot contain")));
    }

    #[test]
    fn parses_custom_instance_like_js() {
        // `Foo { }` es una instancia de componente personalizado (igual que en JS:
        // el error "unknown component" lo reporta expand/sema, no el parser).
        let p = parse("App { title: \"x\" size: (1,1) Foo { } }");
        assert_eq!(p["ui"]["children"][0]["type"], "Component");
        assert_eq!(p["ui"]["children"][0]["name"], "Foo");
    }

    #[test]
    fn reports_errors() {
        let (tokens, lex_errors) = lex("App { title: \"x\" Text { value: \"a\" nope: 1 } }");
        let mut parser = Parser::new(tokens, lex_errors);
        parser.parse_program();
        assert!(parser.errors.iter().any(|e| e.message.contains("unknown prop")));
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
fn main() {
    let mut args = env::args().skip(1);
    let input = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("src/main.kara"));
    let out_dir = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("build"));

    let source = match fs::read_to_string(&input) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("error: cannot read {}: {}", input.display(), e);
            std::process::exit(1);
        }
    };

    let dir = fs::canonicalize(&input)
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    let (tokens, lex_errors) = lex(&source);
    let mut parser = Parser::with_dir(tokens, lex_errors, dir, Rc::new(RefCell::new(Vec::new())));
    let program = parser.parse_program();

    if !parser.errors.is_empty() {
        eprintln!("compile errors:");
        for e in &parser.errors {
            eprintln!("  {}: {} (line {}, col {})", e.kind, e.message, e.line, e.col);
        }
        std::process::exit(1);
    }

    if let Err(e) = fs::create_dir_all(&out_dir) {
        eprintln!("error: cannot create out dir {}: {}", out_dir.display(), e);
        std::process::exit(1);
    }

    let out_file = out_dir.join("ast.json");
    let json = serde_json::to_string_pretty(&program).unwrap();
    if let Err(e) = fs::write(&out_file, json) {
        eprintln!("error: cannot write {}: {}", out_file.display(), e);
        std::process::exit(1);
    }

    println!("ok: wrote {}", out_file.display());
}
