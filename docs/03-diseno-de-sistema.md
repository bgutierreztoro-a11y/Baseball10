# 03 · Diseño de sistema — JONRÓN

**Fecha:** 8-oct-2026 · **Alcance:** cliente web 100 % estático (sin backend en v1).
Las decisiones con alternativas evaluadas están en `docs/adr/`. Las convenciones de coordenadas y capas, en `docs/CONVENTIONS.md`.

---

## 1. Requisitos

### Funcionales
- Lanzamientos con 8 tipos (FF, SI, FC, SL, ST, CU, CH, FS) y lanzadores diestros o zurdos, con ubicación y comando.
- Swing de contacto o de potencia con PCI; juicio de **timing** (ms) y de **ubicación**; resultado físico del batazo (EV, LA, spray, spin, trayectoria, HR/hit/out/foul, dianas).
- Campaña lineal (25 etapas, 5 estadios), práctica y derby; reglas de outs, tiempo, rachas, bonus y estrellas.
- Escena 3D: estadio, 4 personajes animados, bola, VFX, cámara cinematográfica, HUD, menús y audio.
- Guardado local de progreso y ajustes; calibración de latencia; ES/EN.

### No funcionales
| Atributo | Objetivo | Cómo se cumple |
|---|---|---|
| **Precisión de timing** | Error de medición < 1 ms, independiente de los FPS | `event.timeStamp` + modelo analítico del lanzamiento (ADR-008) |
| **Rendimiento** | 60 FPS en escritorio, ≥ 45 en móvil medio | 3 niveles de calidad, bajada automática, geometría fusionada, multitud animada en el shader |
| **Peso** | < 300 KB gzip de JS, 0 assets binarios | Recursos procedurales (ADR-005); build actual: 216 KB gzip |
| **Arranque** | Interactivo en < 2 s en banda ancha | Bundle único y generación del estadio < 300 ms |
| **Determinismo** | Misma semilla, mismo resultado | `Rng` (mulberry32) en toda la simulación; nada de `Math.random` en `sim/` |
| **Robustez** | Nunca bloquearse por datos guardados | `migrate()` valida y corrige cualquier JSON |
| **Accesibilidad** | WCAG AA, teclado y mando, menos movimiento | DOM semántico, `aria-live`, modo casual |

### Restricciones
- Equipo pequeño y entrega inmediata, de modo que el stack debe ser simple, sin backend, desplegable en cualquier hosting estático.
- Debe correr en navegadores con WebGL2 (todos los modernos).

## 2. Arquitectura de alto nivel

```
┌──────────────────────────────── Navegador ────────────────────────────────┐
│                                                                           │
│  main.ts ──► App (shell: pantallas, ajustes, guardado, pausa, compartir)  │
│               │                                                           │
│               ├──► Match (máquina de estados del turno al bate)           │
│               │      │  usa                                               │
│               │      ▼                                                    │
│               │   ┌──────────── sim/ (TS puro, sin DOM ni three) ──────┐  │
│               │   │ pitch.ts   flight.ts   contact.ts   pitcher.ts     │  │
│               │   │ session.ts (reglas)    field.ts (geometría común)  │  │
│               │   └────────────────────────────────────────────────────┘  │
│               │                                                           │
│               ├──► World (escena del estadio actual)                      │
│               │      render/stadium · render/characters · render/fx       │
│               │      ZoneOverlay · CameraDirector · Renderer (bloom)      │
│               │                                                           │
│               ├──► InputManager (mouse · táctil · teclado · mando)        │
│               ├──► UI (overlay DOM: pantallas, HUD, tarjetas) ◄── VMs     │
│               ├──► AudioEngine (Web Audio, síntesis procedural)           │
│               └──► persistence/save (localStorage versionado)             │
│                                                                           │
│  config/ (estadios, lanzamientos, lanzadores, campaña, constantes)        │
│  contracts.ts + */api.ts (contratos entre módulos)                        │
└───────────────────────────────────────────────────────────────────────────┘
```

**Reglas de dependencia:** `sim/` no depende de nada visual. `render/`, `ui/` y `audio/` dependen solo de los contratos (y de `sim/field.ts`, la geometría común). Solo `game/` los conoce a todos. Esta separación permite **testear el 100 % de la jugabilidad sin navegador** (87 tests unitarios).

## 3. Flujo de datos de un lanzamiento

```
choosePitch(rng, selector) ──► planPitch(request) ──► PitchPlan {p0, v0, a, flightTime, plateCross}
                                                         │
          (reloj real)  releaseAtMs = now + 1,05 s       │
                                                         ▼
 render: pitchPosition(plan, τ) cada frame      ◄── τ = (now − releaseAtMs)/1000
                                                         │
 input: keydown/pointerdown ──► timeStamp ───────────────┤
                                                         ▼
 contactTime = (timeStamp − latencia − releaseAtMs)/1000 + swingTime
 evaluateSwing(plan, {kind, contactTime, aim, batter}) ──► SwingEvaluation
     ├─ whiff (timing o ubicación)
     └─ contact ──► simulateFlight(launch, estadio) ──► BattedBall {trayectoria, outcome, ...}
                                                         │
 Session.record(result) ──► SessionEvent[] (out, homeRun, bonus, streak, goalMet, finished)
                                                         │
 Match ──► VMs ──► UI.showHitCard / updateHUD / showCallout; Audio; FX; Cámara
```

**Clave:** el resultado se conoce **en el instante del contacto**, porque la trayectoria entera se precalcula. Eso permite planificar la cámara, la cámara lenta, el canto del jonrón y el sonido antes de que la bola vuele.

## 4. Inmersión técnica

### 4.1 Máquinas de estado
**App:** `Title → {Campaign → StageIntro | Practice | Derby | Settings} → Match → Results`.
**Match:**
```
intro ─► ready ─► windup ─► pitch ─┬─ sin swing / fallo ─► result ─┐
                                   └─ contacto ─► contact (hit-stop) ─► flight ─► result ─┤
           ▲                                                                             │
           └──────────────────── siguiente lanzamiento ◄──────────────────────────────────┘ ─► ended
```
- **Pausa:** en `windup` o `pitch` sin swing, el lanzamiento **se anula** (vuelve a `ready`), así que pausar nunca cuesta outs.
- **Reloj del modo contrarreloj:** `Session.tick(dt)` solo en `ready`, `windup` y `pitch`.

### 4.2 Modelo de datos
- **Contenido** (inmutable, `config/`): `StadiumDef` (cercas, alturas, densidad del aire, paleta, rasgos), `PitchTypeDef`, `PitcherDef`, `StageDef` (objetivo, límite, estrellas, arsenal, dianas), `BatDef`.
- **Simulación:** `PitchPlan`, `SwingEvaluation`, `BattedBall` (con `trajectory[]` a 120 Hz).
- **Persistencia (`SaveData` v1):** `{version, settings, stages: {id: {stars, completed, bestLongestFt}}, stats, derbyBest, selectedBat, seenTips}` bajo la clave `jonron.save`. Escritura inmutable (`recordStage` devuelve un objeto nuevo) y validación en cada lectura.

### 4.3 Contratos entre módulos
`src/contracts.ts` (datos), `src/render/api.ts` (StadiumView, BatterRig, PitcherRig, CatcherRig, UmpireRig, BallView, Effects), `src/audio/api.ts` y `src/ui/api.ts` (UI + view-models). Cambiar un contrato es un cambio de arquitectura y debe actualizar este documento.

### 4.4 Física (resumen)
| Fase | Modelo | Integración |
|---|---|---|
| Lanzamiento | Aceleración constante (gravedad + arrastre medio + quiebre "inducido") | Analítica: se resuelve `v0` para cruzar el objetivo exacto en `T` |
| Batazo | Gravedad + arrastre `½ρCdA v²` + Magnus (`Cl` de Sawicki-Hubbard-Stronge) | RK4, `dt = 1/240 s` |
| Estadio | Cerca (Catmull-Rom por ángulo), pared con rebote amortiguado, gradas a 28° (`standHeight`) | Cruce de radio por paso |

Calibración con Statcast verificada en tests: 100 mph a 28° → 390–420 ft; 110 mph a 30° → 440–470 ft; la altitud añade entre 5 y 12 %.

### 4.5 Render
- **Escena:** cúpula de cielo con shader (gradiente, sol, nubes, estrellas), niebla, luz hemisférica + clave direccional con sombras ajustadas a la zona home→montículo.
- **Estadio:** ~20–40 draw calls gracias a la geometría fusionada por material. Multitud con `InstancedMesh` y animación en el *vertex shader* (uniforms `uTime` y `uExcite`), sin coste de CPU por espectador.
- **Personajes:** torso con huesos e interpolación de poses; brazos y piernas con IK analítica de dos huesos. El bate se define por la posición del mango y su dirección, y las manos van al grip. Todo se anima por tiempo, nunca por frames.
- **Post-proceso:** RenderPass, UnrealBloom (intensidad según la hora del día), OutputPass (ACES + sRGB), MSAA 4× en calidad alta.
- **Capas del suelo:** calcomanías con `renderOrder` y sin escritura de profundidad, para que no haya z-fighting entre capas coplanares.

### 4.6 Manejo de errores
| Fallo | Comportamiento |
|---|---|
| `localStorage` bloqueado o lleno | Se juega sin guardar (`safeStorage` → `null`) |
| JSON corrupto o versión vieja | `migrate()` → partida válida con valores corregidos |
| Sin Web Audio | `AudioEngine` hace no-ops |
| Pestaña oculta | Pausa automática y audio suspendido |
| Input antes de la suelta (> 100 ms) | Se ignora (sin outs accidentales) |
| FPS bajos sostenidos | Bajada automática de calidad (alta → media → baja) |

## 5. Escala y fiabilidad

- **Carga del servidor:** nula; son archivos estáticos detrás de un CDN, así que escala horizontalmente sin coste marginal.
- **Presupuesto por frame** (objetivo 16,6 ms en escritorio): simulación < 0,2 ms (el vuelo se precalcula en el contacto, ~2–4 ms una sola vez); render 8–12 ms en calidad alta.
- **Memoria:** texturas en canvas ≤ 512² salvo el jumbotron (1024×~480); el estadio se libera (`dispose`) al cambiar de parque.
- **Monitoreo (P1):** telemetría opcional de FPS p50/p95, nivel de calidad, embudo de etapas y errores JS (por ejemplo, PostHog + `window.onerror`).

## 6. Trade-offs principales

| Decisión | Ganamos | Cedemos |
|---|---|---|
| Web + three.js | Distribución instantánea, bundle pequeño | Sin toolkit de editor; menos rendimiento que nativo |
| Física propia | Exactitud, determinismo, tests | Mantener nosotros el código de física |
| Assets procedurales | 0 MB de assets, sin licencias, todo parametrizable | Estética estilizada, no fotorrealista |
| DOM para la UI | Accesibilidad, texto nítido, CSS | Sincronizar dos capas (DOM y WebGL) |
| Sin backend | Coste cero, privacidad | Sin ranking global ni nube (P2) |
| Time-warp visual en el contacto | El bate y la bola siempre coinciden en pantalla | Una aceleración o desaceleración de la bola de hasta ±50 % durante ≤ 0,15 s en swings muy desajustados |

## 7. Qué revisaríamos al crecer
1. **Backend ligero** (edge functions + KV) para el ranking y los desafíos diarios con semilla compartida; la simulación determinista permite validar resultados en el servidor reejecutando la semilla.
2. **Carga diferida por estadio** (code-splitting de `render/stadium/scenery`) si el contenido crece.
3. **Web Worker** para precalcular trayectorias si se añaden repeticiones o fantasmas.
4. **WebGPU** cuando el soporte sea universal (más multitud, sombras en cascada).
5. **Personajes con GLB rigged** si se busca más fidelidad; los contratos `BatterRig`/`PitcherRig` ya aíslan esa decisión.
