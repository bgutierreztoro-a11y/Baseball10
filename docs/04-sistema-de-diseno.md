# 04 · Sistema de diseño — JONRÓN

**Fuente de verdad:** `src/ui/styles.css` (tokens en `:root`) y `src/ui/index.ts` (componentes).
**Estética:** gráficos de transmisión deportiva nocturna. Paneles de vidrio azul marino sobre la escena 3D, tipografía condensada y contundente, blanco tiza, un solo acento rojo costura y oro para estrellas y jonrones.

---

## 1. Tokens

### Color
| Token | Valor | Uso |
|---|---|---|
| `--c-bg` | `#0b1426` | Fondo base y carga |
| `--c-panel` | `rgba(11,20,38,.80)` + `blur(14px) saturate(140%)` | Paneles sobre la escena |
| `--c-panel-strong` | `#12203a` | Insignias, fondos sólidos |
| `--c-panel-soft` | `rgba(255,255,255,.04)` | Botones secundarios, tarjetas internas |
| `--c-line` / `--c-line-strong` | blanco al 10 % / 20 % | Bordes |
| `--c-text` | `#f4f1e8` (tiza) | Texto principal |
| `--c-text-dim` / `--c-text-faint` | `#b9c0cf` / `#8590a6` | Secundario / deshabilitado |
| `--c-brand` (`-hi`) | `#d7263d` (`#ef3d55`) | **Rojo costura**: CTA principal y marca |
| `--c-gold` | `#ffc83d` | Estrellas, jonrón, timing perfecto, barrel |
| `--c-success` | `#2fbf71` | Hit, bonus, buen timing |
| `--c-info` | `#3ec1f3` | Foco, coach, temprano, bola |
| `--c-warn` | `#ff8c42` | Tarde, potencia, foul, últimos segundos |
| `--c-danger` | `#ff4d5e` | Out, strike, fallo, borrado |

**Semántica de resultados:** jonrón = oro, hit = verde, out/strike/fallo = rojo, foul = naranja, bola = azul. **Timing:** perfecto = oro, bien = verde, temprano = azul, tarde = naranja. El significado nunca depende solo del color: siempre va acompañado de una etiqueta de texto (TEMPRANO / TARDE…).

### Tipografía
| Token | Familia | Uso |
|---|---|---|
| `--f-display` | **Bebas Neue** → Barlow Condensed → Impact | Logotipo, títulos de pantalla, cantos ("¡SE FUE!") |
| `--f-body` | **Barlow** → system-ui | Texto, botones |
| `--f-num` | **Barlow Condensed** (`tabular-nums`) | Cifras: EV, distancia, outs, reloj, etiquetas en mayúsculas |

Escala: display 150/96/64/52/44/40/32 · cuerpo 20/18/16/15/14/13/12. Las etiquetas (`.eyebrow`) van en mayúsculas con tracking de 0,14 em.

### Espaciado, radios y elevación
- Espaciado (base 4): `--sp-1…7` = 4 · 8 · 12 · 16 · 24 · 32 · 48 px.
- Radios: `--r-sm` 10 · `--r-md` 16 · `--r-lg` 24 · píldora 999.
- Sombras: `--shadow-1` (0 6 20, 35 %) · `--shadow-2` (0 18 50, 50 %).

### Movimiento
- Duraciones: `--t-fast` 160 ms · `--t-med` 240 ms · `--t-slow` 420 ms. Curva: `--ease` = `cubic-bezier(.2,.8,.2,1)`.
- Animaciones con nombre: `fade-in`, `pop-in` (modales, estrellas), `slide-in` (tarjeta de bateo), `callout` (cantos), `pulse-ring` (etapa siguiente).
- **Reducir movimiento:** `@media (prefers-reduced-motion)` **o** la clase `.reduced-motion` en `<html>` (ajuste del juego) dejan las animaciones en 1 ms. Los elementos transitorios (cantos, toasts) siguen visibles y los retira el código.

## 2. Componentes

### Botón (`.btn`)
| Variante | Uso |
|---|---|
| `.btn-primary` | Una acción principal por pantalla (¡A batear!, Siguiente) |
| `.btn` (secundario) | Acciones alternativas (Práctica, Reintentar) |
| `.btn-ghost` | Acciones de bajo énfasis (Atrás, Menú) |
| `.btn-gold` | Reservado para celebraciones o recompensas |
| `.btn-lg` / `.btn-icon` | CTA grande (60 px) / icono cuadrado de 48 px |

| Estado | Visual |
|---|---|
| Hover | Fondo +6 %, borde más claro, −1 px en Y |
| Active | Escala 0,98 |
| Focus | Anillo de 3 px `--c-info` (`:focus-visible`) |
| Disabled | Opacidad 45 % y `cursor: not-allowed` |

**Accesibilidad:** siempre un `<button>` real con al menos 48 px de alto (44 en chips) y `aria-label` cuando es solo un icono.

### Chip (`.chip`)
Píldora para datos (arsenal, timing, calidad, insignias). Si es un `<button>`, se convierte en interruptor con `aria-pressed`. Con `.tone` + `.tone-*` toma el color semántico en el borde y el texto.

### Panel (`.panel`) y modal (`.modal`)
Vidrio con desenfoque. El modal usa `role="dialog"`, `aria-modal="true"`, un título con `aria-labelledby` y foco inicial en `[data-autofocus]`; Escape ejecuta "atrás".

### Control segmentado (`.seg`) · interruptor (`.switch`) · deslizador (`.range`)
Segmentado = grupo de `<button aria-pressed>`. Interruptor = `<input type="checkbox" role="switch">` estilizado. Deslizador = `<input type="range">` con `<output>` en vivo.

### Estrellas (`.star`, `.stars`)
SVG de 24 px; `.on` = oro con resplandor. En resultados son de 74 px, aparecen escalonadas (`pop-in`) y llevan `.new` si son nuevas. Siempre con `role="img"` y `aria-label="n/3"`.

### HUD
| Pieza | Posición | Contenido |
|---|---|---|
| `.hud-chip` | Arriba a la izquierda | Etiqueta de la etapa (roja) + nombre |
| `.hud-goal` | Debajo | Objetivo y valor + barra de progreso dorada |
| `.hud-box` | Arriba a la derecha | Racha 🔥, marcador, outs (pelotas, `+N` en verde para bonus), reloj (naranja en ≤ 10 s) |
| `.hint` · `.pitch-label` | Abajo al centro | Controles (se ocultan a los 6 s) · tipo de lanzamiento |
| `.touch` | Abajo a la derecha (táctil) | BATEAR (104 px) + POTENCIA (interruptor) |

**Regla de oro:** el **centro de la pantalla (zona de strike) nunca se tapa**.

### Tarjeta de bateo (`.hitcard`)
Abajo a la izquierda en escritorio y franja superior en móvil vertical. Lleva un borde izquierdo del color del resultado (`res-*`), título (Bebas), una cuadrícula de 4 estadísticas (Salida, Ángulo, Distancia, Vuelo), chips de timing y calidad, la línea de coach en cursiva y el lanzamiento. Se anuncia por `aria-live`.

### Canto (`.callout`)
Texto gigante en el tercio superior. Variantes: `homeRun` (oro con resplandor), `target` (azul), `bonus` (verde), `warning` (rojo), `info`.

### Burbuja del coach (`.coach-tip`) y toast (`.toast`)
La burbuja lleva el icono del silbato (26 px) y se puede cerrar. El toast es una píldora inferior de 2,6 s con `role="status"`.

## 3. Auditoría (8-oct-2026)

**Resumen:** 14 componentes revisados · 4 hallazgos menores · **puntuación 86/100**.

| Categoría | En tokens | Valores sueltos | Nota |
|---|---|---|---|
| Color | 15 tokens | 17 hex sueltos (degradados del CTA, insignia de jefe, textos sobre oro/naranja) y 55 `rgba` (velos y bordes) | Los degradados son variaciones del brand: extraer `--c-brand-grad` y `--c-on-gold` |
| Espaciado | 7 tokens | Paddings de chips y HUD en px | Aceptable: son ajustes de componente |
| Tipografía | 3 familias | Tamaños en px dentro de `font:` | Crear `--fs-*` si la escala crece |
| JS | — | 5 hex en `ui/index.ts` (SVG del logotipo y el spinner) | Pasar a `currentColor` + clases |

| Componente | Estados | Variantes | Docs | Puntuación |
|---|---|---|---|---|
| Botón | ✅ | ✅ | ✅ | 10/10 |
| Chip | ✅ | ✅ | ✅ | 9/10 |
| Modal | ✅ | ⚠️ (un solo tamaño + `style` en línea) | ✅ | 8/10 |
| HUD | ✅ | ✅ | ✅ | 9/10 |
| Tarjeta de bateo | ✅ | ✅ | ✅ | 9/10 |
| Controles de formulario | ✅ | ✅ | ✅ | 9/10 |

**Acciones prioritarias**
1. Tokenizar los degradados del CTA y los colores de texto sobre oro o naranja (`--c-on-gold`).
2. Sustituir los `style=""` en línea de los modales y las tarjetas de derby por modificadores (`.modal--wide`, `.modal--narrow`).
3. Llevar los colores del SVG del logotipo a `currentColor` para soportar temas.

## 4. Do's y don'ts
| ✅ Hacer | ❌ No hacer |
|---|---|
| Un solo `.btn-primary` por pantalla | Varios CTA rojos compitiendo |
| Etiqueta de texto junto al color semántico | Comunicar timing solo con color |
| Cifras en `--f-num` con `tabular-nums` | Números con fuente proporcional en el HUD (bailan) |
| Respetar el centro libre durante el juego | Poner tarjetas o toasts sobre la zona de strike |
| Textos de la UI en `ui/strings.ts`; textos de juego en `i18n/game.ts` | Cadenas sueltas en los componentes |
