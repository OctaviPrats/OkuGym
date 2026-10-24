# PRD: Nutrición — objetivo calórico y registro de comidas

| | |
|---|---|
| **Estado** | Borrador para revisión |
| **Fecha** | 24 oct 2026 |
| **Alcance v1** | Déficit calórico (dieta hipocalórica). Mantenimiento y volumen quedan preparados en el modelo de datos, sin UI |
| **Contexto de uso** | La app se usa en local (APK o navegador en modo invitado), **sin servidor**. Todo lo de esta feature tiene que funcionar así, y **gratis** |
| **Diseños** | [Canvas "OkuGym Nutrición"](https://claude.ai/artifact/PhCW89AfNnr3ay4dATrRHS) (privado) — pantallas citadas como **[P1]…[P12]** |

---

## 1. Resumen

OkuGym ya mide la mitad de la ecuación de la composición corporal: peso, % de grasa y entrenamientos. Falta la
otra mitad, lo que comes. Esta feature añade:

1. **Un objetivo diario de calorías y macros**, calculado a partir de tus datos (y de lo que la app ya sabe de ti),
   con un déficit que eliges tú y unos límites de seguridad.
2. **Un registro de comidas que no exige saber nutrición.** Escribes "café con leche grande del Starbucks y un egg
   sandwich" y la app te propone los alimentos con calorías y macros estimados, que confirmas o corriges. Lo que
   comes a menudo queda a un toque.
3. **Un "cuánto me queda hoy"** siempre visible, y más adelante una revisión semanal que contrasta lo que comes
   con cómo se mueve tu peso y ajusta el objetivo con datos reales.

## 2. Problema

- **No hay forma de saber por qué el peso no baja.** La app enseña la curva del peso y la del % de grasa contra un
  objetivo, pero no la causa. Sin datos de ingesta, una semana de +1 kg es un misterio.
- **El usuario no sabe cuánto debe comer.** "Comer menos" no es accionable; "1890 kcal y 160 g de proteína" sí.
- **Registrar comida es la parte difícil.** El usuario no sabe cuántas calorías o gramos de grasa tiene lo que
  come, sobre todo fuera de casa: *"hoy he desayunado un café con leche del Starbucks y un egg sandwich, ¿cómo
  registro eso?"*. Las apps clásicas obligan a buscar en una base de datos, elegir entre 40 resultados parecidos
  y adivinar gramos. Es la razón número uno por la que se abandona el conteo.

## 3. Objetivos y no-objetivos

**Objetivos (v1)**

| # | Objetivo | Cómo sabemos que se cumple |
|---|---|---|
| O1 | Fijar un objetivo de kcal/día razonado, con déficit configurable | El usuario completa la calculadora en < 1 min y entiende de dónde sale el número |
| O2 | Traducir el objetivo a gramos de proteína, grasa y carbohidratos | Los tres valores visibles en el objetivo y en la pantalla del día |
| O3 | Registrar una comida sin saber nutrición | Comida nueva en < 30 s; comida repetida en < 5 s |
| O4 | Saber en todo momento cuánto queda del día | Visible en Home y en la pantalla de Nutrición, sin cálculos mentales |
| O5 | Respetar los principios de OkuGym | Datos en tu perfil y en el backup; sin telemetría; la IA es opcional, gratuita (con tu propia clave) y desactivada por defecto |

**No-objetivos (v1)**

- Volumen o mantenimiento en la UI (el modelo de datos ya los admite: `mode`).
- Micronutrientes, vitaminas, sodio. La fibra queda como campo opcional, sin objetivo.
- Planes de comidas, recetas generadas o listas de la compra.
- Integración con Apple Health / Google Fit / básculas.
- Sumar al objetivo las calorías quemadas en el entreno (ver §6.2: ya van dentro del factor de actividad).
- Objetivos distintos para días de entreno y de descanso (ciclado de carbohidratos): fase posterior.

## 4. Usuarios y escenarios

- **Persona principal:** alguien que entrena 3–4 días por semana con OkuGym, quiere bajar grasa sin perder
  fuerza, y no sabe (ni quiere aprender) tablas nutricionales.
- **Escenarios clave**
  1. *Primera vez:* configura su objetivo con la calculadora → ve "1890 kcal · P 160 · G 64 · C 168".
  2. *Desayuno fuera:* describe lo que ha tomado en una frase → revisa la estimación → la añade.
  3. *Lo de siempre:* repite el desayuno de ayer con un toque, o elige un favorito.
  4. *Producto envasado:* escanea el código de barras → elige la cantidad.
  5. *No sé qué es esto pero sé las calorías:* "añadir rápido" con kcal (y macros si los sabe).
  6. *Revisión semanal (fase 3):* "En las 3 últimas semanas comiste 1920 kcal de media y tu peso tendencia bajó
     0,6 kg: tu gasto real ronda las 2140 kcal, menos de lo calculado (2362). ¿Bajamos el objetivo 150 kcal?".

## 5. Experiencia propuesta

### 5.1 Navegación

**Recomendación:** una pestaña nueva **Comida** que sustituye a *Ejercicios* en la barra inferior
(Inicio · Plan · Empezar · Comida · Stats). La biblioteca de ejercicios pasa a un botón en la cabecera de *Plan*,
que es desde donde se usa casi siempre (al editar rutinas). Registrar comida es una acción diaria, varias veces
al día, y necesita un acceso de primer nivel; la biblioteca es consulta ocasional. → **D1: aprobado.**

Además, **Home** gana una tarjeta "Nutrición" bajo la semana [P1] con el resumen del día y un botón "+".

### 5.2 Configurar el objetivo: calculadora en 3 pasos [P7–P9]

Se abre la primera vez que se entra en *Comida* y desde Ajustes → Nutrición → "Recalcular".

1. **Tus datos [P7].** Sexo (prerrellenado con el "diagrama corporal" de Ajustes), edad, altura, peso
   (prerrellenado: último pesaje) y % de grasa (prerrellenado: último registro). Actividad diaria, con una
   sugerencia basada en el plan semanal ("tu plan tiene 3 entrenos/semana → Ligera"). Si hay % de grasa, edad y
   altura son opcionales (ver §6.1).
2. **Tu déficit [P8].** Muestra el mantenimiento estimado ("≈ 2360 kcal/día") y tres opciones —
   **Suave −10 %**, **Moderado −20 %** (recomendado), **Agresivo −25 %** — más un ajuste fino. Para cada opción:
   kcal/día, ritmo esperado (kg/semana) y fecha estimada para llegar al peso objetivo si existe. Aviso visible si
   el ritmo supera el 1 % del peso por semana o si el objetivo cae por debajo del mínimo seguro.
3. **Tus macros [P9].** Proteína y grasa en g/kg con stepper; los carbohidratos se calculan con lo que sobra.
   Barra apilada con el reparto en kcal. "Guardar objetivo".

Modo **manual**: quien ya tenga sus números (de un nutricionista, p. ej.) puede escribir kcal y macros
directamente y saltarse la calculadora.

### 5.3 Pantalla del día [P2]

- Cabecera con fecha y flechas (día anterior/siguiente), como la tira semanal de Home.
- **Bloque principal:** kcal **restantes** en grande ("Quedan 1360"), con consumidas / objetivo debajo y una barra.
  Tres barras de macros (P/G/C) con "consumido / objetivo g".
- **Comidas del día:** Desayuno, Comida, Merienda, Cena (renombrables; ocultables). Cada una con su total y la
  lista de alimentos (nombre, cantidad, kcal). Toque → editar cantidad o borrar. "+ Añadir" en cada una.
- Pasarse del objetivo **no se pinta en rojo**: se muestra "120 kcal por encima" en color neutro (ver §11, riesgos).

### 5.4 Añadir comida [P3]

Hoja inferior (patrón `sheet` de la app) con, en este orden de prioridad:

1. **Campo "Describe lo que has comido"** con micrófono (dictado del teclado del sistema) y botón de **foto**.
   → Estimación con IA (§7.1). Solo aparece si has conectado un proveedor de IA [P12]; si no, en su lugar se
   muestra "Conectar IA gratis".
2. Accesos: **Escanear código** · **Buscar** · **Añadir rápido**.
3. **"Repetir desayuno de ayer"** (o la comida equivalente del último día con registro en esa franja).
4. Pestañas **Recientes · Favoritos · Mis alimentos**, con un toque para añadir la ración habitual.

### 5.5 Cómo se registra tu desayuno de hoy [P3 → P4 → P5]

1. Toca "+ Añadir" en Desayuno y escribe (o dicta): *"café con leche grande del starbucks y un egg sandwich"*.
2. La app responde en unos segundos con dos alimentos [P4]:
   - **Caffè Latte Grande (leche semidesnatada)**, ≈ 150 kcal · P 11 · G 5 · C 15 — *confianza alta*,
     basado en la información nutricional publicada para ese producto.
   - **Egg sandwich (huevo, queso, bacon)**, ≈ 380 kcal · P 19 · G 18 · C 34 — *confianza media*,
     estimación a partir de productos similares.
   - Debajo, los **supuestos** como chips que se pueden cambiar: *Tamaño: Grande · Leche: semidesnatada*.
3. Si algo no cuadra, toca el alimento [P5]: cambia tamaño, tipo de leche o cantidad, y los valores se recalculan.
4. "Añadir 2 alimentos" → se guardan en Desayuno **y** en *Mis alimentos*. Mañana aparecen en Recientes y basta
   un toque, sin volver a llamar a la IA.

> Los valores de este ejemplo son ilustrativos. Parte del diseño es justamente no fingir precisión: cada
> estimación lleva su confianza y su origen, y siempre se puede corregir.

### 5.6 Código de barras [P6] (fase 2)

Cámara a pantalla completa con marco guía → al detectar un EAN, ficha del producto desde Open Food Facts (§7.2)
con valores por 100 g y por ración, selector de cantidad y "Añadir". Si el producto no existe: "Créalo desde la
etiqueta" (formulario por 100 g) — y queda en *Mis alimentos*.

### 5.7 Revisión semanal [P10] (fase 3)

Tarjeta en *Comida* y en *Stats*, cada lunes:

- Media de kcal de la semana vs objetivo, días registrados (6/7).
- Cambio de **peso tendencia** (media de 7 días, ya calculada en la app) vs el esperado.
- **Gasto real estimado** (TDEE adaptativo, §6.5) y una propuesta: mantener, o ajustar ±X kcal. Nunca se aplica
  sin confirmación.

### 5.8 Ajustes → Nutrición [P11]

Objetivo actual (con "Recalcular"), comidas del día (nombres y orden), **Estimaciones con IA** (proveedor, clave,
activar/desactivar y qué se envía; conexión en [P12]), mostrar/ocultar macros, unidad de energía (kcal; kJ en
fase posterior).

## 6. Cálculos

Todo vive en un helper puro `src/lib/nutrition.js` **con tests** (`nutrition.test.js`), como pide CONTRIBUTING
para la lógica que decide números.

### 6.1 Metabolismo basal (BMR)

- **Con % de grasa → Katch-McArdle** (preferida: no necesita edad ni altura y tiene en cuenta la masa magra):
  `masa magra = peso × (1 − %grasa/100)` · `BMR = 370 + 21,6 × masa magra`
- **Sin % de grasa → Mifflin-St Jeor:**
  `BMR = 10 × peso + 6,25 × altura(cm) − 5 × edad + 5` (hombre) / `− 161` (mujer)
- El usuario puede forzar Mifflin (p. ej. si su % de grasa viene de una báscula de bioimpedancia, que puede
  desviarse varios puntos).

### 6.2 Gasto total (TDEE)

`TDEE = BMR × factor de actividad`

| Nivel | Factor | Descripción en la UI |
|---|---|---|
| Sedentaria | 1,2 | Trabajo sentado, poco movimiento, sin entrenos |
| Ligera | 1,375 | Trabajo sentado + 1–3 entrenos/semana |
| Moderada | 1,55 | 3–5 entrenos/semana o trabajo de pie |
| Alta | 1,725 | 6–7 entrenos/semana o trabajo físico |

- Sugerencia automática a partir de `S.week` (rutinas planificadas por semana): 0 → Sedentaria, 1–3 → Ligera,
  4–5 → Moderada, 6–7 → Alta. El usuario puede cambiarla.
- **Las calorías del entreno no se suman al objetivo:** ya van dentro del factor. Sumarlas contaría dos veces.

### 6.3 Déficit, ritmo y límites

- `objetivo = redondear(TDEE × (1 − déficit%), 10)`; déficit entre 5 % y 30 % (presets 10 / 20 / 25).
- Ritmo esperado: `kg/semana ≈ (TDEE − objetivo) × 7 / 7700`.
- Fecha estimada: `(peso actual − peso objetivo) / ritmo` semanas, solo si hay `targetW` y es menor que el peso.
  Se muestra como mes aproximado ("≈ finales de febrero"), nunca como fecha exacta.
- **Límites (guardarraíles):**
  - El objetivo nunca baja de `max(BMR, 1500 kcal hombre / 1200 kcal mujer)`; si el déficit elegido lo empujaría
    por debajo, se ajusta al mínimo y se explica.
  - Aviso (no bloqueo) si el ritmo supera el **1 % del peso corporal por semana**.
  - En modo manual se aplican los mismos avisos.

### 6.4 Macros

| Macro | Por defecto | Rango del stepper | kcal/g |
|---|---|---|---|
| Proteína | 2,0 g/kg | 1,6 – 2,6 g/kg | 4 |
| Grasa | 0,8 g/kg | 0,6 – 1,2 g/kg (mínimo absoluto: 20 % de las kcal) | 9 |
| Carbohidratos | el resto | — | 4 |

- Base: peso actual. Si el % de grasa es alto (> 25 % hombre, > 32 % mujer) se usa el **peso objetivo** para la
  proteína, para no inflarla.
- Si proteína + grasa no dejan carbohidratos ≥ 50 g, aviso y se baja la grasa hacia su mínimo.

**Ejemplo (persona de ejemplo, no datos reales):** 80 kg, 22 % de grasa, trabajo sentado, 3 entrenos/semana.
Masa magra 62,4 kg → BMR 1718 → TDEE (×1,375) 2362 → déficit moderado −20 % → **1890 kcal** (−472 kcal/día,
≈ 0,43 kg/semana). Macros: **P 160 g** (640 kcal) · **G 64 g** (576 kcal) · **C 168 g** (672 kcal).

### 6.5 Gasto adaptativo (fase 3)

Las fórmulas fallan ±10–15 % de una persona a otra. Con datos reales se corrige:

`TDEE real ≈ media kcal ingeridas + (Δ peso tendencia en kg × 7700) / días`

- Ventana de 14–28 días, solo si se registró ≥ 80 % de los días (los días sin registro se excluyen, no cuentan
  como 0).
- Peso tendencia = media móvil que la app ya calcula (`BodyAverages`).
- Propuestas de ajuste de como mucho ±150 kcal por semana, siempre con confirmación.

## 7. Fuentes de datos de alimentos

Orden de preferencia al mostrar resultados: **Mis alimentos** (lo que ya has usado) → **base genérica incluida** →
**Open Food Facts** → **estimación con IA**.

### 7.1 Estimación con IA (texto y foto): gratis y sin servidor

- **Qué hace:** a partir de una frase y/o una foto, devuelve una lista de alimentos con ración, gramos, kcal,
  P/G/C, **confianza** (alta/media/baja), **origen** ("info publicada por la cadena" / "estimación genérica") y
  **supuestos** editables (tamaño, tipo de leche…).
- **Cómo, sin servidor:** la app llama directamente desde el móvil (o el navegador) a un proveedor de IA con
  **tu propia clave gratuita**. Para el uso previsto (≈ 1 registro al día) no hace falta servidor ni pagar nada.
  - Un único adaptador, `src/lib/ai.js`, que habla el formato de chat "compatible con OpenAI". Lo ofrecen Google
    Gemini, Groq, OpenRouter y Ollama, así que cambiar de proveedor es cambiar URL base, clave y modelo.
    Sin dependencias nuevas: `fetch`.
  - Respuesta en JSON con esquema (`response_format`), validada en el cliente antes de mostrarla.
  - Fotos: se reducen en el dispositivo a ~1024 px antes de enviarlas.
  - En el APK, las llamadas salen por `CapacitorHttp` (ya incluido en `@capacitor/core`) para evitar problemas
    de CORS.
  - Búsqueda en la web (para cadenas como Starbucks) solo si el proveedor la incluye gratis (Gemini: "Grounding
    with Google Search" en algunos modelos Flash). Si no, el modelo estima con lo que sabe y lo marca con
    confianza media/baja.
- **Proveedores gratuitos** (presets en la pantalla de conexión [P12]):

| Proveedor | Modelos | Coste | Plan gratis (aprox., cambia a menudo) | Fotos | A favor / en contra |
|---|---|---|---|---|---|
| **Google Gemini** (recomendado) | Flash / Flash-Lite | 0 €, sin tarjeta | de ~20 a cientos de peticiones/día según el modelo | Sí | Conoce bien productos de cadenas y puede buscar en Google. En el plan gratis, Google puede usar lo enviado para mejorar sus productos |
| **Groq** | Abiertos (Qwen, Llama…) | 0 €, sin tarjeta | ~1000 peticiones/día en sus modelos principales | Según el modelo | **Open source** y muy rápido; sabe menos de productos concretos y no busca en la web |
| **OpenRouter** | Modelos `:free` | 0 € | 50 peticiones/día | Según el modelo | Muchos modelos abiertos; el catálogo gratis cambia a menudo |
| **Ollama** (en tu ordenador) | Qwen-VL, Gemma… | 0 € | Sin límite | Sí | 100 % privado. Solo si usas OkuGym en el ordenador; necesita ~8 GB de RAM y es más lento y menos preciso |

  Con 1 registro al día sobra cualquier plan gratuito. Como los límites cambian, un error 429 ("límite alcanzado")
  se explica con claridad y se ofrece "añadir rápido" como alternativa.
- **Descartado:** un modelo dentro del propio móvil. Pide descargar varios GB, es lento y su precisión
  nutricional es baja.
- **Reglas de producto:** nunca se guarda nada sin confirmar; la estimación se puede editar; lo confirmado se guarda
  en *Mis alimentos* para no volver a llamar a la IA por lo mismo.
- **Solo se envía** el texto y/o la foto de la comida y el idioma. Nunca peso, % de grasa, historial ni nombre.
- **La clave de API** se guarda solo en el dispositivo y fuera del estado `S`: no se sincroniza, no entra en el
  backup ni en "Compartir plan", y se puede revocar en la web del proveedor.

### 7.2 Código de barras y búsqueda: Open Food Facts

- Base abierta (ODbL), con buena cobertura en España. Gratis y sin clave.
- **Directamente desde el dispositivo.** En el APK, vía `CapacitorHttp` con un `User-Agent` propio
  (`OkuGym/<versión>`), como pide OFF. Los productos ya consultados quedan en *Mis alimentos*, así que el mismo
  código no se vuelve a pedir.
- Límites de OFF: 15 consultas/min de producto y 10/min de búsqueda, por usuario: de sobra para uso personal.
  **La búsqueda se lanza al pulsar "Buscar", nunca mientras se escribe.**
- Escáner: `BarcodeDetector` donde exista (Chrome/Android); en iOS Safari no existe → en la app Capacitor haría
  falta un plugin nativo (dependencia nueva) y en la PWA de iOS, teclear el código. → **Decisión D4**.

### 7.3 Base genérica incluida (fase 2)

~300–500 alimentos básicos (huevo, pechuga de pollo, arroz cocido, plátano, aceite de oliva…) con raciones
típicas, empaquetados como el catálogo de ejercicios: funciona sin red, en el modo demo y en el APK sin servidor.
Fuente con licencia compatible (p. ej. USDA FoodData Central, dominio público) y nombres traducidos.
→ **Decisión D5** (fuente e idiomas).

### 7.4 Mis alimentos, recientes, favoritos y comidas guardadas

- Cualquier alimento confirmado (de IA, OFF o manual) se guarda en *Mis alimentos* con su ración habitual.
- **Recientes:** ordenados por frecuencia y recencia en esa franja (lo que desayunas aparece primero en Desayuno).
- **Favoritos:** estrella en cualquier alimento.
- **Repetir comida:** copia todos los alimentos de esa franja del último día con registro.
- **Comidas guardadas** (fase 2): "Desayuno Starbucks" = varios alimentos en un toque.

### 7.5 Añadir rápido y alimento propio

- **Rápido:** nombre opcional + kcal (+ P/G/C opcionales). Para "no sé qué es, pero la etiqueta dice 250 kcal".
- **Alimento propio:** desde la etiqueta, por 100 g o por ración, con raciones con nombre ("1 rebanada = 30 g").

## 8. Modelo de datos

Todo dentro del estado del perfil (`S`), como el resto de la app: se sincroniza con `PUT /api/data`, entra en
el backup JSON y en el espejo de fichero del APK.

```js
S.nutrition = {
  profile: { sex: 'male', birthYear: null, heightCm: null, activity: 'light' },
  goals: [                                   // historial: cada día se evalúa con el objetivo vigente ese día
    { from: '2026-10-24', mode: 'cut', method: 'katch', tdee: 2362, deficitPct: 20,
      kcal: 1890, p: 160, f: 64, c: 168 }
  ],
  slots: ['breakfast', 'lunch', 'snack', 'dinner'],   // nombres editables vía `slotNames`
  ai: { on: true, provider: 'gemini', model: '<id del modelo>', search: true },   // la clave NO va aquí (§7.1)
  foods: [                                   // "Mis alimentos"
    { id, name, brand, src: 'ai' | 'off' | 'base' | 'user', barcode,
      per: { g: 100 }, kcal, p, f, c, fiber,
      servings: [{ label: 'Grande', g: 473 }], fav: false, uses: 12, last: '2026-10-24' }
  ],
  meals: [ { id, name, items: [{ foodId, qty, serving }] } ],      // comidas guardadas (fase 2)
  log: {
    '2026-10-24': [
      { id, t, slot: 'breakfast', foodId, name, qty: 1, serving: 'Grande', g: 473,
        kcal: 150, p: 11, f: 5, c: 15, src: 'ai', conf: 'high' }
    ]
  }
}
```

- **Cada entrada guarda una copia de sus valores** (kcal y macros) además del `foodId`: editar un alimento después
  no reescribe días pasados. Es el mismo principio que con las series de un entreno, que nunca se reescriben.
- **Tamaño:** ~180 B por entrada × 8 al día × 365 ≈ 0,5 MB/año. Sin servidor, el límite que importa es el de
  `localStorage` (~5 MB por origen en la mayoría de navegadores y WebViews), que comparte con el resto del estado;
  el APK además guarda el espejo en fichero. Da para años, pero hay que vigilarlo: si el log supera ~1 MB, moverlo
  a IndexedDB o a su propio fichero, por meses (riesgo R4). Con servidor aplica además el límite de 5 MB de
  `PUT /api/data`.
- **Importar backup** sigue sustituyendo el estado; "Compartir plan" **no** incluye nutrición.
- **Migración:** `DEF.nutrition = null`; la UI de Comida muestra la calculadora mientras sea `null`.

## 9. Cambios técnicos

**Sin servidor (caso principal).** Todo vive en el cliente y funciona igual en el APK, en el navegador en modo
invitado y en el modo demo:

| Módulo | Qué hace |
|---|---|
| `src/lib/nutrition.js` (+ tests) | BMR, TDEE, déficit, límites, macros, totales del día, gasto adaptativo |
| `src/lib/ai.js` (+ tests del parseo) | Adaptador "compatible con OpenAI": presets de proveedor, petición, validación del JSON, errores (429, clave inválida) |
| `src/lib/off.js` | Open Food Facts: producto por código y búsqueda |
| `capacitor.config.json` | Activar `CapacitorHttp` para que las peticiones del APK no choquen con CORS |

- La clave de API va en `localStorage` (`gym_ai_key`) y, en el APK, en el almacenamiento privado de la app.
  Nunca en `S`.
- Nada nuevo en `api/` y **ninguna dependencia nueva**.

**Con servidor (opcional, fase posterior).** Para quien aloje OkuGym para varias personas, el mismo adaptador
podría correr en `api/server.js` (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_DAILY_LIMIT`), con un proxy y una
caché compartida de Open Food Facts, para que cada usuario no tenga que crear su propia clave. No hace falta para
tu caso.

## 10. Coste

**0 €** con cualquiera de los proveedores gratuitos de §7.1: con ~1 estimación al día no se roza ningún límite.
Lo que comes a menudo, además, sale de *Mis alimentos* y Recientes, sin llamar a la IA.

Si algún día los planes gratuitos desaparecen, el adaptador admite cualquier API compatible. Como referencia, un
modelo pequeño de pago (p. ej. Claude Haiku 5.5, a $0,10 / $0,50 por millón de tokens) saldría a unos
**0,02 $ al mes** a 1 estimación diaria.

## 11. Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Estimaciones de la IA erróneas o inventadas | Confianza y origen visibles; supuestos editables; preferencia por info publicada (búsqueda web) y por etiquetas (OFF); nunca guardar sin confirmar |
| R2 | Los planes gratuitos cambian o se recortan (ya ha pasado) | Proveedor intercambiable en Ajustes; 1 petición/día queda muy por debajo de cualquier límite; si falla, "añadir rápido" y Open Food Facts siguen funcionando |
| R3 | Relación poco sana con la comida | Tono neutro; sin rojo ni "fallaste" al pasarse; mínimo de kcal; sin rachas de días "perfectos"; opción de ocultar números (fase 2) |
| R4 | El estado sincronizado crece | Entradas compactas; plan de separar el log por meses si supera ~1 MB |
| R5 | Límites de Open Food Facts | Proxy con caché compartida; búsqueda solo al enviar; `User-Agent` identificado |
| R6 | Privacidad: fotos y descripciones salen a un tercero, y en los planes gratis el proveedor puede usarlas para mejorar sus productos | Opt-in explícito, con ese aviso al conectar; solo se envía la comida; alternativa 100 % privada con Ollama en el ordenador |
| R9 | La clave de API vive en el dispositivo | Fuera de `S`: ni sincronización, ni backup, ni "Compartir plan"; se puede revocar en la web del proveedor |
| R7 | La fórmula no encaja con la persona | Explicar que es un punto de partida; revisión semanal adaptativa (fase 3) |
| R8 | i18n: 12 idiomas | ~80 textos nuevos vía `t()`; números con `fmtNum`; la base genérica empieza en EN/ES (D5) |

## 12. Métricas de éxito (sin telemetría)

OkuGym no envía analítica, así que las métricas se calculan en el dispositivo y se enseñan al propio usuario en
la revisión semanal:

- Días registrados por semana (meta: ≥ 5/7).
- % de alimentos añadidos desde Recientes/Favoritos (indicador de baja fricción; meta: > 60 % tras 2 semanas).
- Media de kcal dentro de ±10 % del objetivo.
- Ritmo real de bajada vs esperado.

## 13. Fases

| Fase | Contenido | Criterio de "hecho" |
|---|---|---|
| **1 — MVP** | Calculadora (3 pasos + manual) · pantalla del día · tarjeta en Home · pestaña Comida · **conectar IA gratis** con tu clave · añadir con **IA (texto)**, **añadir rápido**, **Recientes/Favoritos**, **repetir comida**, **Mis alimentos** · Ajustes → Nutrición · `nutrition.js` y `ai.js` con tests · backup | Registrar el desayuno del ejemplo de §5.5 en < 30 s la primera vez y en < 5 s la segunda |
| **2** | Foto con IA · código de barras y búsqueda OFF · base genérica offline · comidas guardadas · alimento propio desde etiqueta · ocultar números | Un producto envasado se registra escaneando, sin escribir |
| **3** | Revisión semanal + gasto adaptativo · gráfica kcal vs peso en Stats · recordatorio opcional para registrar | Tras 3 semanas de registro, la app propone un objetivo corregido con datos reales |

## 14. Decisiones pendientes

| # | Pregunta | Estado |
|---|---|---|
| D1 | ¿Pestaña "Comida" sustituyendo a "Ejercicios" (biblioteca → cabecera de Plan) o solo tarjeta en Home? | ✅ **Aprobado:** pestaña Comida |
| D2 | ¿Qué IA, y a qué coste? | ✅ **Resuelto:** gratis, con tu propia clave y llamadas desde el dispositivo. Por defecto Google Gemini (Flash / Flash-Lite); alternativa open source: Groq (Qwen, Llama) |
| D3 | ¿Búsqueda web activada por defecto? | Sí, cuando el proveedor y el plan gratis la incluyan (Gemini); si no, estimación con confianza visible |
| D4 | Escáner en iOS: ¿plugin nativo (dependencia nueva) o teclear el código? | Pendiente. Recomendación: teclear en v1; plugin si se usa mucho |
| D5 | Base genérica: ¿fuente e idiomas iniciales? | Pendiente. Recomendación: USDA (dominio público), EN + ES primero |
| D6 | ¿SDK de un proveedor concreto o `fetch`? | ✅ **Resuelto:** `fetch` con formato compatible con OpenAI; ninguna dependencia nueva |
| D7 | ¿Pedir edad y altura aunque haya % de grasa? | Pendiente. Recomendación: opcionales; solo obligatorias sin % de grasa |
| D8 | ¿Objetivos distintos en días de entreno? | Fase posterior |
