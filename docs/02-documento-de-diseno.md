# 02 · Documento de diseño (GDD / PRD) — JONRÓN

**Estado:** MVP implementado (v0.1) · **Fecha:** 8-oct-2026 · **Responsable:** producto + ingeniería (CTO/CEO)
**Tagline:** *Solo tú, el bate y la cerca.*

---

## 1. Problema

Batear un jonrón es el momento más emocionante del béisbol, pero los juegos que lo ofrecen obligan a elegir entre **profundidad** (simuladores de consola caros y complejos) y **acceso** (juegos móviles llenos de pay-to-win y anuncios, o juegos web 2D sin física). Ninguno explica al jugador **por qué** falló o acertó, y las reseñas repiten las mismas quejas: resultados que parecen azar, relojes que corren durante las animaciones y progresión comprada (ver `01-analisis-competitivo.md`). Para la audiencia hispanohablante, además, no hay ningún producto pensado en su idioma ni con su cultura beisbolera.

## 2. Objetivos

| # | Objetivo | Cómo sabremos que se cumplió |
|---|---|---|
| G1 | Un jugador nuevo conecta su primer hit en menos de 2 minutos desde que abre el enlace | Tiempo hasta el primer hit ≤ 120 s (mediana) |
| G2 | Que el bateo sea **habilidad legible**: cada resultado se explica | ≥ 90 % de los swings con contacto muestran la línea de coach; 0 resultados "azar" (sin RNG que convierta un barrel en out) |
| G3 | Partidas cortas que invitan a "una más" | Duración media por etapa entre 1 y 3 min; reintento ≥ 40 % tras perder |
| G4 | Funcionar en móviles de gama media sin instalar nada | ≥ 45 FPS en calidad *media*; primera carga < 1,5 MB comprimida |
| G5 | Ser justo: progresar solo con habilidad | 0 compras; todo el contenido se gana con estrellas |

## 3. No-objetivos (v1)

| No-objetivo | Por qué |
|---|---|
| Fildeo, corrido de bases, partidos completos | Es la premisa: solo bateo |
| PvP y rankings online | Requieren backend, anti-trampas y moderación. Primero validamos el core loop (P2) |
| Licencias de MLB, ligas o jugadores reales | Coste legal; la identidad propia es una ventaja |
| Monetización | Primero retención; nunca pay-to-win (decisión de principio) |
| App nativa | La web es la ventaja de distribución (ADR-001) |

## 4. Usuarios

- **Fanático casual (primario):** ve béisbol, juega en el móvil o el portátil en ratos libres y quiere sentir el jonrón sin aprender un simulador. Español primero.
- **Jugador de habilidad (secundario):** viene de The Show o SMB y quiere timing preciso, PCI y datos (EV, LA, ms).
- **Jugador con necesidades de accesibilidad:** zurdo, con poca motricidad fina o sensible al movimiento.

### Historias de usuario (por prioridad)

**Fanático casual**
- Como fanático casual, quiero jugar con un clic desde un enlace para no tener que instalar nada.
- Como fanático casual, quiero un modo en el que solo importe el momento del swing para disfrutar desde el primer lanzamiento.
- Como fanático casual, quiero que el juego me diga qué hice mal ("llegaste 30 ms tarde") para mejorar sin leer un manual.
- Como fanático casual, quiero celebrar cada jonrón (canto, fuegos artificiales, la distancia en el jumbotron) para sentir la recompensa.
- Como fanático casual, quiero compartir mi mejor batazo con un amigo para retarlo.

**Jugador de habilidad**
- Como jugador de habilidad, quiero apuntar el círculo de contacto y elegir entre contacto y potencia para tomar decisiones de riesgo.
- Como jugador de habilidad, quiero ver la velocidad de salida, el ángulo, la distancia y el timing en ms para medir mi progreso.
- Como jugador de habilidad, quiero lanzadores con repertorios distintos (slider, splitter, zurdos…) para que cada jefe sea un reto nuevo.
- Como jugador de habilidad, quiero calibrar la latencia de mi pantalla para que el timing sea justo.

**Accesibilidad**
- Como jugador zurdo, quiero batear a la zurda.
- Como jugador sensible al movimiento, quiero desactivar la cámara lenta, los temblores y los destellos.
- Como jugador de teclado o mando, quiero jugar y navegar los menús sin mouse.

**Casos límite**
- Si el navegador bloquea `localStorage`, el juego funciona igual (sin guardar).
- Si cambio de pestaña en pleno lanzamiento, el juego se pausa y ese lanzamiento se anula (no cuesta out).
- Si el dispositivo no aguanta, la calidad baja sola.

## 5. Diseño del juego

### 5.1 Bucle principal (≈ 4–8 s por lanzamiento)
```
Preparación (tempo del lanzador) → Windup (1,05 s) → Lanzamiento (0,37–0,55 s)
   ├─ Sin swing → Bola (gratis) / Strike cantado (out)
   ├─ Swing fallido → out
   └─ Contacto → hit-stop → vuelo cinematográfico → tarjeta de bateo con coaching
→ siguiente lanzamiento o fin de la etapa
```

### 5.2 Controles
| Entrada | Pro | Casual |
|---|---|---|
| Mouse | Mover = apuntar el PCI; clic = swing; clic derecho o Shift = potencia | Clic = swing (el PCI apunta solo, con un pequeño error) |
| Teclado | Flechas/WASD = apuntar; Espacio = swing; Shift = potencia; Q = alternar potencia; Esc/P = pausa | Igual, sin necesidad de apuntar |
| Teléfono (táctil) | Deslizar el dedo = apuntar (relativo); botón BATEAR; botón POTENCIA | Botón BATEAR |
| Mando | Stick izquierdo = apuntar; A = swing; RT = potencia; Start = pausa | — |

### 5.3 Modelo de contacto: dos habilidades
1. **CUÁNDO.** Error de timing Δt entre la llegada del bate y la de la bola al plano de contacto. Determina la dirección (temprano = la halas; tarde = al lado contrario) y la potencia. Ventanas: *contacto* perfecto ±12 ms, bien ±30 ms, foul hasta ±95 ms; *potencia* ±9 / ±22 / ±75 ms.
2. **DÓNDE.** Desfase entre la bola y el centro del PCI. Si la bola queda por encima del centro, el bate le pega por debajo y sale elevada (ángulo de salida = 10° + 62° × desfase normalizado). El desfase horizontal decide si entra en el punto dulce o en la punta/mango del bate.
3. **Velocidad de salida:** `EV = (0,2·v_lanzamiento + 1,2·v_bate) × factores de calidad`. El swing de contacto (29 m/s) da ~90–97 mph en el centro; el de potencia (34,5 m/s) da ~104–111 mph.
4. **Ayudas de lectura (activadas por defecto, desactivables).** *Zona aproximada de llegada*: un área dorada difusa, con su centro desplazado al azar, que siempre contiene el cruce real y desaparece al llegar la bola. *Imán de bateo* (modo pro): al hacer swing, el PCI se acerca al punto ideal de contacto y los casi-fallos de hasta 1,6 radios se rescatan. Responden a las críticas de The Show (ver 01 · §5.1); el código está en `src/sim/assist.ts`.
5. **Sin azar que contradiga el feedback.** El ruido es mínimo (±1,2 % de EV, ±1,5° de LA) y hit/out en juego se decide con reglas fijas tipo Statcast.

### 5.4 Física
El lanzamiento usa un modelo de aceleración constante (estilo PITCHf/x) y es analítico y exacto. El batazo se integra con RK4 a 240 Hz, con arrastre, sustentación Magnus y la densidad del aire de cada estadio. Está calibrado para que **100 mph a 28° ≈ 406 ft** y **110 mph a 30° ≈ 456 ft**. La altitud (La Cumbre, 1.600 m) añade ≈ 8 %.

### 5.5 Modos
- **Campaña (lineal):** 5 estadios × 5 etapas = 25 etapas. Cada etapa se desbloquea al completar la anterior.
- **Práctica:** estadio, tipos de lanzamiento, velocidad, ubicación y mano del lanzador configurables, sin límite.
- **Derby:** 10 outs; cualquier swing que no sea jonrón es out; un jonrón de 440 ft o más da un out extra. Se guarda el récord.

### 5.6 Reglas de una etapa
- Cualquier swing que no cumpla el objetivo y cualquier strike cantado **cuestan un out**. Las bolas tomadas no cuestan.
- **Bonus:** un jonrón de 440 ft o más da +1 out (o +5 s en los modos con tiempo).
- Las etapas por outs terminan en cuanto se cumple el objetivo, así que las estrellas premian la eficiencia.
- En los modos con tiempo **el reloj solo corre mientras el lanzador trabaja** (nunca durante el vuelo), por la queja nº 1 de HC2.
- **Estrellas:** ★ = completar el objetivo; ★★ y ★★★ = condiciones extra independientes (outs de sobra, jonrón más largo, barrels, EV máxima, sin abanicar…).

### 5.7 Campaña

| Cap. | Estadio | Ambiente / física | Lanzador | Arsenal | Etapas (objetivo) |
|---|---|---|---|---|---|
| 1 | **El Solar** | Día, solar de barrio, cercas de 285–315 ft | Tío Ramón (R) | Recta y cambio lentos | Primer contacto (3 hits) · Levántala (1 HR) · Tiro al blanco (2 dianas) · Cambio de ritmo (3 HR) · **Jefe: 5 HR en 60 s** |
| 2 | **Parque del Malecón** | Atardecer junto al mar; "El Muro" de 34 ft en LF; aire 1,17 | La Brisa (R) | Recta, sinker, cambio | Brisa marina · El Muro (dianas en la pared) · Sinker al suelo · Más allá del agua (410 ft) · **Jefe: 6 HR** |
| 3 | **Estadio Metropolitano** | Noche con luces y skyline | El Mago (**zurdo**) | Recta, slider, curva, cambio | Bajo las luces · El slider · Racha (3 HR seguidos) · Pantalla gigante · **Jefe: 7 HR en 75 s** |
| 4 | **La Cumbre** | Día, 1.600 m, aire 0,98 (la bola vuela más), parque grande | El Cóndor (R) | Recta, cutter, sweeper, splitter | Aire fino (440 ft) · Corte fino · Barrido · Doble racha · **Jefe: 8 HR** |
| 5 | **Coliseo de la Gran Final** | Noche con fuegos artificiales | El Ciclón (R, 100+ mph) | Arsenal completo | Calentamiento · Velocidad pura · Fuegos artificiales (dianas en la grada) · Sin red (5 seguidos) · **Gran Final: 10 HR en 90 s** |

Un test de balance (`tests/unit/content.test.ts`) verifica que **cada objetivo y cada estrella es físicamente alcanzable** con un swing de potencia perfecto, y que todas las dianas son alcanzables.

### 5.8 Progresión y recompensas
Las estrellas (75 en total) desbloquean bates **cosméticos**: Fresno (0) · Arce oscuro (8) · Neón (20) · Oro (40) · Cometa (60) · Leyenda (75). Ninguno mejora atributos.

### 5.9 Sensación ("juice")
Hit-stop de 70–100 ms; destello y chispas (onda expansiva dorada en los barrels); temblor de cámara según la calidad; *crack* sintetizado que cambia con la calidad del contacto; cámara de seguimiento; cámara lenta al pasar la cerca; canto de jonrón en español ("¡SE FUE!", "¡ADIÓS, PELOTA!"); fuegos artificiales; marcador de aterrizaje con la distancia; jumbotron; *bat flip*; público que reacciona (rugido, "uuuh", lamento); órgano al empezar la etapa.

### 5.10 Accesibilidad
Modo *casual* (solo timing), zona aproximada de llegada, imán de bateo, bateo a la zurda, reducir movimiento (sin cámara lenta, temblores ni destellos; también respeta `prefers-reduced-motion`), estela del lanzamiento, tipo de lanzamiento visible, calibración de latencia, navegación completa por teclado y mando, región `aria-live` que anuncia resultados, contraste AA y objetivos táctiles de 44 px o más.

### 5.11 Bateadores jugables
Cada bateador cambia el tamaño del PCI y la velocidad del bate (multiplicadores en `src/config/characters.ts`, aplicados por `swingProfile()` en `src/sim/contact.ts`). Se eligen en el menú **Bateadores** y la elección se guarda.

| Bateador | Inspiración | Aspecto | Contacto | Poder | Rasgo |
|---|---|---|---|---|---|
| **El Moro** | — | Modelo base, 1,85 m | Base | Base | **Peak máximo** (tecla E, botón PEAK o Y en el mando): durante 3 lanzamientos, PCI ×1,4 y bate ×1,1. Una vez por partido. Su novia virtual «iluvkiwiss» lo anima desde el marcador (es Ramiro haciéndole *catfish*, pero él no lo sabe). |
| **El Mati** | David "Big Papi" Ortiz | Enorme, 1,93 m | PCI base, bate +4 % | Bate +7 %, PCI +8 % | El más equilibrado. Su tamaño tapa mucha más pantalla. |
| **Arturek** | — | Gigante eslovaco rubio de 7,8 m con cuatro brazos | PCI +35 % | PCI +35 % | Alcanza casi todo; potencia media. |
| **Chamo** | Barry Bonds | 1,88 m, musculoso, cuernos de villano y un cuerno gigante como bate | PCI −22 %, bate −5 % | Bate +14 % | El swing de poder más fuerte; poco contacto. |

Swing de potencia perfecto en el Metropolitano (92 mph): Moro 434 ft (460 con peak), Mati 462, Arturek ≈ 420, Chamo 494.

## 6. Requisitos

### P0 — imprescindibles (implementados)
| Requisito | Criterios de aceptación |
|---|---|
| Lanzamiento y swing con timing exacto | Dado un swing con `event.timeStamp` *t*, el Δt se calcula sin cuantizar por frame; los tests verifican que el lanzamiento cruza el objetivo en `flightTime` (±1 µm) |
| Modelo de contacto (cuándo + dónde) | Temprano tira hacia el lado propio (diestro → izquierda) y se invierte para zurdos; la bola por encima del PCI sale con más ángulo; contacto perfecto + centro = barrel y jonrón (tests) |
| Física y estadio | Jonrón si la bola supera la cerca por encima de la pared; contra la pared rebota; fuera de las líneas es foul (tests) |
| Campaña lineal de 25 etapas con estrellas | La etapa N+1 se desbloquea al completar la N; se guarda la mejor marca de estrellas, nunca la peor (tests) |
| Coaching en cada swing | La tarjeta muestra EV, LA, distancia, vuelo, timing (ms), calidad y una línea de "por qué" |
| Pausa segura | Pausar durante el windup o el lanzamiento anula ese lanzamiento sin coste |
| Guardado local robusto | JSON corrupto o versiones viejas → partida válida (tests) |
| Rendimiento | Tres niveles de calidad y bajada automática si los frames superan los 22 ms durante 2 s |

### P1 — siguientes
- Desafíos diarios con semilla compartida (el RNG determinista ya lo permite).
- Repetición (*replay*) del último jonrón desde otra cámara.
- Telemetría anónima opcional (PostHog) para medir el embudo de §7.
- Narración por voz pregrabada o sintetizada en español.
- PWA instalable y offline (service worker).

### P2 — futuro (diseñar sin bloquear)
- Ranking por estadio y modo fantasma ("supera mi batazo" a partir de un enlace con semilla y resultado).
- Editor de estadios (la geometría ya es 100 % paramétrica).
- Viento por estadio (la física ya lo admite como un término más).

## 7. Métricas de éxito

| Tipo | Métrica | Objetivo (éxito / ambicioso) | Cuándo |
|---|---|---|---|
| Adelantada | Tiempo hasta el primer hit | ≤ 120 s / ≤ 60 s | 1ª semana |
| Adelantada | % que completa la 1-1 | 70 % / 85 % | 1ª semana |
| Adelantada | Swings por sesión | ≥ 25 / ≥ 40 | 1ª semana |
| Adelantada | Reintento tras perder una etapa | ≥ 40 % / ≥ 60 % | 2ª semana |
| Atrasada | Retención D1 / D7 | 25 % / 8 % (ambicioso 35 % / 12 %) | 1 mes |
| Atrasada | % que llega al capítulo 3 | 20 % / 35 % | 1 mes |
| Atrasada | Enlaces compartidos por cada 100 sesiones | 3 / 8 | 1 mes |
| Salud | FPS p50 en móvil (calidad media) | ≥ 45 / ≥ 55 | Continuo |

*Medición:* requiere la telemetría P1. Hasta entonces, prueba con usuarios y métricas de la build.

## 8. Preguntas abiertas
| Pregunta | Quién | ¿Bloquea? |
|---|---|---|
| ¿Exponer un tercer swing "normal" (como The Show) o mantener solo contacto y potencia? | Diseño, con datos de uso | No |
| ¿Dónde desplegar en producción (GitHub Pages, Vercel)? | Stakeholder | No (la build es estática) |
| ¿Telemetría con o sin consentimiento explícito por región (GDPR/LGPD)? | Legal | Sí, para P1 |
| ¿Ajustar las ventanas de timing después de la prueba con usuarios? | Diseño | No |

## 9. Fases
1. **v0.1 (este PR):** core loop, campaña completa, práctica, derby, accesibilidad, docs y CI.
2. **v0.2:** prueba con 10–20 jugadores → ajustar ventanas y estrellas; telemetría; PWA.
3. **v0.3:** desafíos diarios y modo fantasma compartible.
