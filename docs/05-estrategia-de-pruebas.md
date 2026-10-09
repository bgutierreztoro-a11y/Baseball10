# 05 · Estrategia de pruebas — JONRÓN

**Principio:** la jugabilidad es lógica pura (`src/sim/`), así que la mayor parte de la confianza viene de tests unitarios rápidos y deterministas. El navegador se prueba con pocos tests e2e de humo y con QA visual por capturas.

```
            /  E2E (5)  \          Playwright + SwiftShader: arranque, menús, ajustes, swing real, pausa
           / Integración  \        Balance de campaña: física × contenido (33 casos)
          /  Unit (54+)     \      Vitest: lanzamiento, vuelo, contacto, reglas, guardado, audio
```

## 1. Qué se prueba y cómo

| Área | Tipo | Archivo | Qué garantiza |
|---|---|---|---|
| Modelo de lanzamiento | Unit | `tests/unit/pitch.test.ts` | Cruza el objetivo exacto en `flightTime` (8 tipos); velocidad ±4 %; tiempos reales (90 mph ≈ 0,42–0,46 s); quiebres con el signo correcto para diestros y zurdos; zona de strike |
| Aerodinámica del batazo | Unit | `tests/unit/flight.test.ts` | Calibración Statcast (100 mph a 28° → 390–420 ft; 110 mph a 30° → 440–470 ft); monotonía con la EV; la altitud añade 5–12 %; ángulo óptimo entre 25 y 36°; jonrón, pared, foul y dianas |
| Modelo de contacto | Unit | `tests/unit/contact.test.ts` | Timing perfecto + punto dulce = barrel y jonrón; potencia > contacto; rangos de EV realistas; fallo por timing o ubicación; temprano tira hacia el lado propio (espejo para zurdos); bola sobre el PCI = elevado; determinismo con semilla; definición Statcast de barrel |
| Reglas de sesión | Unit | `tests/unit/session.test.ts` | Outs, bolas gratis, strike cantado, bonus de 440 ft, rachas, hits, reloj, estrellas independientes, distancia |
| Guardado | Unit | `tests/unit/save.test.ts` | Ida y vuelta; JSON corrupto; valores fuera de rango; sin `localStorage`; desbloqueo lineal; mejores marcas; bates por estrellas |
| Audio | Unit | `tests/unit/audio.test.ts` | Degrada a no-ops sin Web Audio |
| **Balance de contenido** | Integración | `tests/unit/content.test.ts` | 25 etapas, ids únicos, 1 jefe por capítulo; referencias válidas; **cada objetivo y cada estrella es alcanzable físicamente**; **todas las dianas son alcanzables** |
| Juego en navegador | E2E | `tests/e2e/smoke.spec.ts` | Arranca sin errores con WebGL2; campaña lineal; los ajustes persisten; **un swing real se juzga y muestra la tarjeta de bateo**; pausa con Esc |
| Calidad visual | Manual asistida | `scripts/shot.mjs`, `scripts/play.mjs`, `sandbox/*.html` | Capturas de estadios, personajes y partidas guiadas para revisar el resultado |

Ejemplo de un test de balance (atrapó dos errores reales durante el desarrollo: una estrella imposible en 5-5):

```ts
it.each(STAGES)('%s', (stage) => {
  const carry = maxCarryFt(stage); // swing de potencia perfecto contra su lanzamiento más rápido
  if (stage.goal.type === 'distance') expect(carry).toBeGreaterThan(stage.goal.ft + 10);
  for (const c of stage.stars) if (c.type === 'longestHR') expect(carry).toBeGreaterThan(c.ft + 5);
});
```

## 2. Objetivos de cobertura

| Módulo | Objetivo | Razón |
|---|---|---|
| `src/sim/**` | ≥ 90 % de líneas | Es la lógica que decide resultados; un bug aquí es injusticia para el jugador |
| `src/persistence/**` | ≥ 90 % | Perder progreso es el peor bug posible |
| `src/config/**` | 100 % validado por el test de contenido | El contenido roto debe fallar en CI, no en producción |
| `src/render/**`, `src/ui/**` | Humo e2e + QA visual | Lo visual se valida mejor viéndolo; los tests de píxeles serían frágiles |

## 3. Cómo correr

```bash
npm test            # unit + integración (≈ 3 s)
npm run typecheck   # TypeScript estricto
npm run e2e         # build + preview + Playwright (≈ 2 min con SwiftShader)
node scripts/play.mjs http://localhost:5173/ ./out 1-1 3   # partida guiada con capturas
```

## 4. CI (`.github/workflows/ci.yml`)
1. `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm run build:single`.
2. Job e2e: `npx playwright install --with-deps chromium` → `npm run e2e`, y sube la traza si falla.

## 5. Huecos conocidos y próximos pasos
| Hueco | Riesgo | Plan |
|---|---|---|
| Sin tests de regresión visual automática | Medio: un cambio de shader podría romper la estética | Capturas de referencia por estadio con un umbral amplio (P1) |
| Sin test de rendimiento automatizado | Medio en móviles | Medir FPS con `performance` en un e2e headful en el dispositivo objetivo (P1) |
| Lógica de `Match` (máquina de estados) solo vía e2e | Bajo-medio | Extraer el reloj como dependencia inyectable y testear las transiciones en Vitest (P1) |
| Accesibilidad sin auditoría automática | Medio | `@axe-core/playwright` en el e2e de menús (P1) |
| Mando: solo prueba manual | Bajo | Simular `navigator.getGamepads` en un e2e |
