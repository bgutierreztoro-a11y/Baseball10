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
- Animaciones con nombre: `fade-in`, `pop-in` (modales, estrellas), `slide-in` (tarjeta de bateo), `callout` (cantos), `pulse-ring` (etapa siguiente), `ability-pulse` (habilidad lista), `ability-glow` (habilidad activa).
- **Reducir movimiento:** `@media (prefers-reduced-motion)` **o** la clase `.reduced-motion` en `<html>` (ajuste del juego) dejan las animaciones en 1 ms. Los elementos transitorios (cantos, toasts) siguen visibles y los retira el código. El pulso y el brillo del botón de habilidad se eliminan del todo, y el carrusel de bateadores se desplaza sin animación.

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
| `.touch` | Abajo a la derecha (táctil) | BATEAR (104 px) + POTENCIA (interruptor) + habilidad (si la hay) |
| `.ability-btn` | Bajo el objetivo (escritorio) · sobre POTENCIA (táctil) | Habilidad especial del bateador (ver abajo) |

**Regla de oro:** el **centro de la pantalla (zona de strike) nunca se tapa**.

### Botón de habilidad (`.ability-btn`)
Habilidad especial del bateador (p. ej. «Peak máximo» de El Moro). Solo aparece si `HudVM.ability` no es `null`.

| Variante | Dónde | Forma |
|---|---|---|
| Píldora (escritorio) | En `.hud-tl`, bajo `.hud-goal` | Icono de rayo + etiqueta + estado + tecla `<kbd>E</kbd>` |
| Losa `.is-touch` | En `.touch`: encima de POTENCIA en horizontal; a su izquierda en vertical (≤ 720 px) | 104 px de ancho, icono arriba, etiqueta y estado centrados |

| Estado | Visual | Comportamiento |
|---|---|---|
| `is-ready` | Borde oro, degradado oro→marino, estado «Disponible» en oro, pulso `ability-pulse` (1,8 s) | Clic o toque → `onAbility()`; tras un clic con ratón pierde el foco para que Espacio no lo repita |
| `is-active` | Relleno oro, texto `#1b1300`, halo `ability-glow`, estado «Quedan N» | `aria-disabled="true"`; se anuncia «¡Peak máximo! N lanzamientos» por `aria-live` |
| `is-used` | Marino apagado, texto `--c-text-faint`, etiqueta tachada, estado «Sin usos» | `aria-disabled="true"`, `cursor: not-allowed` |

**Accesibilidad:** es un `<button>` real de al menos 44 px de alto. Su `aria-label` cambia con el estado: «Activar Peak máximo (tecla E)», «Peak máximo en marcha: quedan 2 lanzamientos», «Peak máximo: sin usos en este partido». El estado nunca depende solo del color: siempre lleva texto.
**Sin solapes:** en vertical, POTENCIA y la habilidad comparten fila sobre BATEAR, y `.coach-tip` sube a `bottom: 214px` (clase `.is-touch-ui` en la raíz) para no taparlas. La tarjeta de bateo, arriba, termina antes de esa fila.

### Tarjeta de bateo (`.hitcard`)
Abajo a la izquierda en escritorio y franja superior en móvil vertical. Lleva un borde izquierdo del color del resultado (`res-*`), título (Bebas), una cuadrícula de 4 estadísticas (Salida, Ángulo, Distancia, Vuelo), chips de timing y calidad, la línea de coach en cursiva y el lanzamiento. Se anuncia por `aria-live`.

### Canto (`.callout`)
Texto gigante en el tercio superior. Variantes: `homeRun` (oro con resplandor), `target` (azul), `bonus` (verde), `warning` (rojo), `info`.

### Burbuja del coach (`.coach-tip`) y toast (`.toast`)
La burbuja lleva el icono del silbato (26 px) y se puede cerrar. El toast es una píldora inferior de 2,6 s con `role="status"`.

### Menú principal: entrada «Bateadores»
Un `.btn` más del menú (`.btn-batters`) entre Derby y Ajustes. A la derecha lleva una píldora oro (`.batter-now`) con el casco y el nombre del bateador elegido; un texto oculto («Bateador:») completa el nombre accesible: «Bateadores, Bateador: El Mati». En pantallas horizontales bajas (≤ 520 px de alto) la portada pasa a dos columnas: marca a la izquierda y menú a la derecha.

### Selección de bateador (`.chars`, `.roster`, `.bcard`)
**Problema:** elegir entre personajes con alturas y físicos muy distintos (de 1,85 m a 7,80 m) y entender sus estadísticas y su habilidad en un vistazo.

| Pieza | Contenido |
|---|---|
| `.topbar` | Atrás (48 px), eyebrow «Elige tu bateador» y título «Bateadores» |
| `.bcard-art` | Retrato procedural (ver abajo) + insignia `.bcard-height` (Estatura) + insignia oro «✓ Elegido» si está elegido. Línea inferior de 4 px en el color del ribete (`--accent`) |
| `.bcard-head` | Nombre (Bebas 40) y apodo (Barlow Condensed, mayúsculas, `--c-text-dim`) |
| `.bstats` | `<dl>` en rejilla: etiqueta · barra oro (`value` 0–1, marca de base al 50 %) · detalle. Detalle verde si empieza por «+», naranja si empieza por «−», gris si es «Base» |
| `.bability` | Solo si hay habilidad: caja oro translúcida con rayo, «Habilidad especial», nombre y descripción |
| `.bcard-bio` | Biografía en `--c-text-dim` |
| `.bpick` | «Elegir» (secundario) o «✓ Elegido» (oro, `aria-pressed="true"`). Nunca rojo: con cuatro tarjetas habría cuatro CTA primarios |

| Tamaño | Disposición |
|---|---|
| ≥ 1000 × 600 | Rejilla `auto-fit, minmax(230px, 1fr)`; el cuerpo de la tarjeta se desplaza si no cabe |
| Móvil vertical | Carrusel con `scroll-snap` (tarjeta de `min(340px, 84vw)`, centrada) + puntos indicadores decorativos |
| Horizontal bajo (≤ 520 px de alto) | Carrusel de tarjetas horizontales (`min(560px, 76vw)`): retrato al 40 % a la izquierda y detalles a la derecha; cabecera compacta en una línea |

**Estados de la tarjeta:** hover (borde más claro y −3 px en escritorio) · `:focus-within` (borde `--c-info`) · `.is-selected` (borde oro de 2 px + halo oro suave). El relleno extra del carrusel, compensado con márgenes negativos, evita que el halo se recorte.
**Teclado y mando:** foco inicial en el botón del bateador elegido; ← / → saltan entre tarjetas y las centran; Tab recorre cada tarjeta en orden (cuerpo desplazable → botón); Escape vuelve. Tras elegir, el juego vuelve a llamar a `showCharacters` y la UI conserva el desplazamiento y el foco, y anuncia «Chamo sale a batear».
**Lector de pantalla:** `<ul aria-label="Bateadores">` de `<li aria-labelledby>`; cada cuerpo es un `role="group"` con el nombre; una línea oculta da «Bateador 2 de 4. Estatura: 1,93 m» (la insignia visual es `aria-hidden` para no leerla dos veces). Botones: «Elegir a El Mati» / «El Mati, elegido».

### Retrato procedural (`ui/portrait.ts`)
Ilustración plana en SVG generada **solo** desde `BatterLook`, con el mismo lenguaje que la UI: cielo marino, halo radial del color del ribete, dos haces de luz, el dorsal gigante al 7 % y el césped al pie.

| Dato | Cómo se dibuja |
|---|---|
| `heightM` | Altura relativa a 1,85 m. Si no cabe (gigante), se recorta a la altura de la nariz por el borde superior y aparece un bateador normal de 1,85 m a sus pies, a escala |
| `build`, `belly` | Ancho de hombros, cintura y cadera; con `belly` > 0,3, una barriga que cuelga sobre el cinturón |
| `muscle` | Espalda en V, cuello ancho, brazos gruesos con bíceps y pectorales marcados |
| `extraArms` | Dos brazos más: el par superior agarra el bate y el inferior va en jarras |
| `skin`, `hair`, `beard` | Hex exactos; pelo bajo el casco (más largo atrás); barba con boca visible. Los ojos llevan blanco para que se lean en cualquier tono de piel |
| `jersey`, `trim`, `number` | Camiseta y pantalón; ribete en casco, cuello, tapeta, mangas, rayas y medias; número en el pecho y de fondo |

El encuadre se adapta a la caja: un `ResizeObserver` redibuja con la proporción real para que nadie quede cortado salvo el gigante. El SVG es `aria-hidden`: la tarjeta ya dice todo en texto.

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

### Revisión de accesibilidad: bateadores y habilidad (9-oct-2026)
| # | Hallazgo | Criterio | Estado |
|---|---|---|---|
| 1 | El cuerpo desplazable de la tarjeta entraba en el orden de tabulación sin nombre ni foco visible | 4.1.2 · 2.4.7 | ✅ `role="group"` + `aria-labelledby` + anillo `--c-info` interior |
| 2 | La estatura se leía dos veces (insignia + texto oculto) | 1.3.1 | ✅ Insignia `aria-hidden` |
| 3 | El carrusel y las flechas usaban desplazamiento suave aun con «reducir movimiento» | 2.3.3 | ✅ `scroll-behavior: auto` y `behavior: 'auto'` |
| 4 | Pulso y halo de la habilidad | 2.3.3 | ✅ Sin animación con reducir movimiento |
| 5 | En vertical, la habilidad quedaba bajo la tarjeta de bateo y el consejo del coach | 1.4.10 | ✅ Fila POTENCIA + habilidad y coach más arriba |

Contraste medido sobre la tarjeta (`#101d36`): texto atenuado 9,2:1 · verde 7,0:1 · naranja 7,3:1 · oro 10,9:1 · tiza 14,9:1 · `#1b1300` sobre oro ≈ 12:1. Objetivos táctiles: 48 px (Atrás, Elegir) y ≥ 44 px (habilidad).

## 4. Do's y don'ts
| ✅ Hacer | ❌ No hacer |
|---|---|
| Un solo `.btn-primary` por pantalla | Varios CTA rojos compitiendo |
| Etiqueta de texto junto al color semántico | Comunicar timing solo con color |
| Cifras en `--f-num` con `tabular-nums` | Números con fuente proporcional en el HUD (bailan) |
| Respetar el centro libre durante el juego | Poner tarjetas o toasts sobre la zona de strike |
| Textos de la UI en `ui/strings.ts`; textos de juego en `i18n/game.ts` | Cadenas sueltas en los componentes |
| Dibujar personajes desde `BatterLook` (`ui/portrait.ts`) | Ramas por `id` o imágenes sueltas por personaje |
| Un solo estado «Elegido» en oro; «Elegir» en secundario | Cuatro botones rojos en la pantalla de bateadores |
