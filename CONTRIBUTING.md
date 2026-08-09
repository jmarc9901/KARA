# Contribuir a KARA

¡Gracias por querer aportar! Estas son las pautas para que el proyecto se
mantenga ordenado y testable.

## Entorno

- Node.js ≥ 20.11 y npm.
- Rust (solo para `parser/`).

```bash
npm --prefix runtime install
npm --prefix ui install
kara test        # o: npm test
```

## Estructura

| Directorio  | Contenido                                        |
| ----------- | ------------------------------------------------ |
| `compiler/` | Lexer, parser, sema y chequeo de tipos (JS)      |
| `runtime/`  | Intérprete + servidor HTTP/WebSocket             |
| `ui/`       | Render engine Svelte + playground                |
| `parser/`   | Parser en Rust (mismo AST que el compiler JS)    |
| `cli/`      | Comando `kara` (dev/build/test/doctor/new)       |

## Reglas

1. **Paridad de AST**: cualquier cambio de formato en `compiler/src/parser.js`
   debe replicarse en `parser/src/main.rs` (hay tests de paridad en CI).
2. **Tests**: toda feature nueva lleva tests:
   - compiler → `compiler/test/parser.test.js` o `sema.test.js`
   - runtime → `runtime/test/interpreter.test.js`
   - rust → `#[cfg(test)]` en `parser/src/main.rs`
3. **Errores con ubicación**: los mensajes de error incluyen `line` y `col`.
4. **Estilo**: JS sin transpilar (ESM puro), nombres camelCase; Rust `snake_case`
   excepto las claves de AST que imitan al JS (con `#![allow(non_snake_case)]`).
5. **Sin dependencias innecesarias**: el compiler y el runtime deben poder
   ejecutarse con `node` pelado siempre que sea posible.

## Flujo de trabajo

1. Crea una rama (`git checkout -b feat/mi-cambio`).
2. Implementa + tests.
3. `npm test` y `cargo test --manifest-path parser/Cargo.toml` en verde.
4. Abre un Pull Request contra `main` usando la plantilla.

## Reportar bugs

Usa la plantilla de issue. Incluye el `.kara` mínimo que reproduce el problema,
el output esperado y el obtenido (incluye línea/columna del error si aplica).
