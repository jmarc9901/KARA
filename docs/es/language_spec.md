# Especificación del Lenguaje KARA (v0.1 RFC)

> **Nota:** Documentación en español conservada como referencia secundaria y
> puede contener secciones desactualizadas (p. ej. `Window`, literales de
> objeto o anotaciones de tipo ya mencionadas). La versión vigente y precisa
> es la inglesa: `docs/en/language-spec.md`.

**Estado:** Draft

## 1. Paradigma

KARA es un lenguaje con enfoque mixto:

- **Declarativo para UI**
- **Imperativo para lógica**
- **Reactivo para estado**
- **Tipado fuerte dinámico (con inferencia)**
- **Basado en componentes**
- **Multiplataforma desktop**

Inspiraciones: **SwiftUI + Flutter + QML + Svelte + Elm**, con sintaxis propia.

## 2. Sintaxis Básica

### 2.1. Programa principal

Un archivo KARA define una app usando la palabra clave `App`.

```kara
App {
  title: "Demo"
  size: (400, 300)

  // componentes...
}
```

### 2.2. Bloques

Los bloques usan `{ ... }`.

- Estilo visual similar a JSON.
- Semántica de DSL (no es JSON):
  - Permite propiedades tipo `key: value`.
  - Permite anidar componentes.
  - Permite expresiones en valores.

## 3. Tipos

### 3.1. Primitivos

- `Int`
- `Float`
- `Bool`
- `String`
- `Any` (sólo si el usuario lo exige)

### 3.2. Compuestos

- **Tuple**: `(400, 300)`
- **Array**: `[1,2,3]`
- **Object**: `{ field: value }`
- **Function**: closures internas

## 4. Tipado fuerte dinámico

El sistema es **dinámico** en runtime, pero con **chequeo estático previo** a la ejecución.

Ejemplos válidos:

```kara
let x = 5          // Int
let y = "hola"     // String
let z = x + y      // String: "+" concatena si alguno de los operandos es String
let d = 10 / 4     // Float: la división siempre devuelve Float
```

Ejemplo inválido:

```kara
let z = x * y    // error: cannot apply "*" to Int and Str
```

Los errores se detectan en el **static check** previo a runtime (`TypeError`):
operaciones aritméticas con tipos incompatibles, comparaciones de tipos
distintos, asignaciones con tipo incompatible y aridad incorrecta de funciones.

## 5. Variables y estado

### 5.1. Variables locales

```kara
let x = 10
let y = x + 2
```

### 5.2. Estado reactivo

Dentro del contexto UI:

```kara
state counter = 0
```

Esto expone `counter` al sistema de **bindings**.

### 5.3. Variables derivadas (grafo de dependencias)

```kara
state base = 2

derived a = b + 1   // puede referenciar variables declaradas DESPUÉS
derived b = c * 2
```

Las variables `derived` se ordenan automáticamente por **grafo de dependencias**
(topo sort): las referencias adelantadas funcionan y el runtime las evalúa en el
orden correcto. Los ciclos son un error en compilación:

```kara
derived x = y + 1
derived y = x + 1   // error: circular derived dependency detected
```

## 6. Funciones

Definición de funciones:

```kara
fn Auth(user: String, pass: String) {
  if (user == "admin" && pass == "1234") {
    return true
  }
  return false
}
```

- Retorno por defecto: `null` si no se especifica.

## 7. Control de flujo

Soporta:

```kara
if (condition) { ... }
else { ... }

while (condition) { ... }

for (item in list) { ... }
```

## 8. Interpolación de strings

```kara
Text { value: "Hola ${username}" }
```

## 9. Componentes UI

### 9.1. Estilo declarativo

```kara
Button {
  text: "Click"
  onClick: counter = counter + 1
}
```

### 9.2. Jerarquía

```kara
Window {
  Column {
    Text { value: "Hola" }
    Button { text: "OK" }
  }
}
```

### 9.3. Componentes personalizados

Un componente agrupa un subtree de UI reutilizable, con **props**, **estado local**,
**derived** y **fn** propios:

```kara
component Item(title, initial) {
  state n = initial
  derived doble = n * 2
  fn siguiente() { return n + 1 }

  Column {
    Text { value: "🎯 ${title}" }
    Text { value: "n = ${n}" }
    Button { id: "plus" text: "+1" onClick: n = siguiente() }
  }
}

state extra = 10

Column {
  Item { title: "A", initial: 1 }
  Item { title: "B", initial: extra }
}
```

Semántica:

- **Instancias**: `Item { prop: <expr> }`. Los valores de props son **expresiones**
  evaluadas en el ámbito del llamador (pueden referenciar el estado de la App).
- **Expansión en compilación**: cada instancia se expande en el árbol con nombres
  únicos (`n$c0`, `n$c1`, ids `plus$c0`…), de modo que cada instancia tiene su
  propio estado y enruta sus eventos a sí misma.
- **Reglas**: los nombres de componente empiezan en mayúscula, no pueden coincidir
  con componentes builtin, las props son de solo lectura (asignar a un parámetro
  es un error) y las referencias circulares entre componentes son un error.
- **Limitación conocida**: dentro de un `for`, las instancias de un mismo
  componente comparten estado local (la expansión ocurre una vez por instancia
  estática), igual que las ids de widgets se comparten hoy entre iteraciones.
- Los componentes no aceptan **children/slots** todavía (v0.2).

## 10. Eventos

Los eventos mapean bloques imperativos:

```kara
Button {
  text: "Login"
  onClick: Auth(user, pass)
}
```

Los widgets con `bind` (`TextInput`, `Select`, `Slider`, `Checkbox`) además
soportan `onChange`, que se ejecuta **después** de actualizar la variable
vinculada:

```kara
TextInput {
  id: "name"
  bind: name
  onChange: saved = name
}
```

## 10.1. Widgets adicionales

- `Select { id, options: ["a", "b"], bind, label }` — desplegable; emite `select`.
- `Slider { id, bind, label, min, max, step }` — rango; emite `slider`.

## 11. Builtins iniciales

Conjunto de builtins implementados:

- `Print(...)` / `Log(...)` — salida a la consola del runtime/playground
- `Alert(...)` — diálogo
- `Now()` — epoch en ms
- `Random(a, b)` — entero aleatorio en `[a, b]`
- `Length(x)` — longitud de arrays y strings
- `Push(list, ...)` — array nuevo con los elementos añadidos (inmutable)
- `File.Read(path)` → `Str` — **solo runtime de escritorio** (Node)
- `File.Write(path, data)` → `Null` — **solo runtime de escritorio** (Node)

> `File.Read`/`File.Write` no están disponibles en el playground (navegador):
> el intérprete los reporta como no disponibles. `Http.Get(url)` sigue en el
> roadmap (requiere soporte async en el intérprete).

## 12. Archivos del proyecto

Estructura recomendada:

```text
/src
  main.kara
  auth.kara
  views/
  components/
kara.config.json
```

### 12.1. Configuración del proyecto

`kara.config.json` controla el proyecto (entry, outDir, port). La CLI lo resuelve
**buscando el archivo más cercano** desde el entry o el cwd, de modo que un
proyecto creado con `kara new` es autocontenido:

```bash
kara new mi-app
cd mi-app && kara dev        # usa mi-app/kara.config.json
kara dev ../otro-proyecto/src/main.kara   # usa la config de otro-proyecto
```

### 12.2. Módulos (`import`)

Los imports van **antes** de `App {` y fusionan definiciones de componentes y
funciones desde otros archivos `.kara`:

```kara
import "./components/cards.kara"

App {
  ...
  Card { title: "A", initial: 1 }
}
```

Reglas:

- Un archivo módulo solo puede contener definiciones `component`, `fn` y otros
  `import`. No puede contener `App` ni `state`/`derived` de nivel superior.
- La resolución es **relativa al archivo que importa**; los imports se
  deduplican y los ciclos (`a → b → a`) son seguros.
- El runtime vigila los archivos importados para el hot-reload.
- En el playground (navegador) no hay acceso al sistema de archivos: ejecuta
  con `kara dev`.

## 13. Ejemplos

### 13.1. App contador

```kara
App {
  title: "Contador"
  size: (400, 300)

  state count = 0

  Column {
    Text { value: "Valor: ${count}" }

    Button {
      text: "Incrementar"
      onClick: count = count + 1
    }
  }
}
```
