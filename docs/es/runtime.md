# Runtime de KARA

> **Nota:** Documentación en español conservada como referencia secundaria y
> puede contener secciones desactualizadas. La versión vigente es la inglesa:
> `docs/en/runtime.md`.

## Visión general

El runtime de KARA es una arquitectura de **tres capas** (más empaquetado) diseñada para ejecutar aplicaciones desktop multiplataforma.

**Stack:** Node + Web UI + Rust

> **Estado (v0.3):** el shell Tauri (`src-tauri/`) lanza el runtime Node como
> proceso hijo y abre una ventana nativa apuntando a `http://localhost:<port>`.
> `bundle.active = true` con iconos generados; el empaquetado final (runtime
> embebido en el binario) sigue en el roadmap.
>
> **v0.3 añade:** módulos/`import` (el runtime resuelve imports relativos al
> entry), builtins de OS inyectados (`File.Read`/`File.Write` vía
> `program.extraBuiltins`, solo escritorio), eventos `select`/`slider` y el
> handler `onChange`, errores de runtime con `línea/columna`, y un **LSP**
> (`kara lsp`) que reutiliza el compiler para diagnósticos/hover/completado.

## Configuración de proyecto

El runtime resuelve su configuración así:

1. `KARA_CONFIG_PATH` (lo fija la CLI): ruta del `kara.config.json` del proyecto.
2. Si no existe, `kara.config.json` en la raíz del framework.

Además la CLI pasa `KARA_ENTRY` (entry absoluto) y `KARA_PROJECT_ROOT`
(raíz del proyecto, donde se resuelven `outDir` y el watch).

## A. Flujo de ejecución

Pipeline conceptual:

```text
kara source → Parser (Rust) → AST JSON → Runtime (Node) → UI (Web) + OS APIs (Rust)
```

- El parser transforma `.kara` en un AST.
- El runtime evalúa el AST, gestiona estado y ejecuta funciones.
- La UI se renderiza en Web (elegido: Svelte) con bindings reactivos.
- Las APIs de OS/FS se implementan en Rust.

## B. Capas técnicas

### 1. Parser

> **Nota (v0.2):** el parser de referencia es el de JS (`compiler/`). El parser
> en Rust (`parser/`) es un snapshot congelado que emite el mismo AST JSON; se
> mantiene como referencia/experimental y puede quedarse atrás en features.

Responsable de:

- Lexer / parsing
- Construcción de AST
- Errores sintácticos
- Tabla de símbolos
- Inferencia de tipos
- Errores semánticos
- Serialización del AST

Tecnologías sugeridas:

- `pest` o `nom`
- `serde` para serializar AST

Produce:

- `AST.json`
- Reporte de errores
- Tabla de símbolos
- Tipos inferidos

### 2. Runtime (Node)

Responsable de:

- Cargar el AST
- Evaluar expresiones
- Ejecutar funciones
- Gestión de estado reactivo
- Conectar eventos de UI con lógica
- Orquestar comunicación con Web y Rust

Comunicación:

- Mensajes JSON por IPC (HTTP + WebSocket)

Eventos UI → runtime:

- `click` (Button) → ejecuta `onClick`
- `input` (TextInput) / `toggle` (Checkbox) / `select` (Select) / `slider`
  (Slider) → actualizan el `bind` y ejecutan `onChange` si existe

Los errores de runtime se anotan con la ubicación en el fuente `.kara`
(`__karaLoc` en el intérprete) y se envían como `RuntimeError` con línea/columna.

### 3. Render Engine (Web)

Opciones consideradas:

- Svelte

Elección:

- **Svelte** (más fácil para bindings reactivos y DSL declarativa)

Responsable de:

- Sistema de widgets
- Render declarativo
- Sistema de eventos
- Layout engine (`Column`, `Row`, `Grid`)
- Theming

### 4. Rust Backend

Responsable de:

- FS
- OS APIs
- Trays
- Menús nativos
- Notificaciones
- Seguridad sandbox

Empaquetado:

- Usar **Tauri** como empaquetador.

## C. Standalone

Objetivo: producir binarios standalone:

- Windows: `.exe`
- macOS: `.app`
- Linux: `ELF`

Sin requerir instalar Node en la máquina del usuario final.
