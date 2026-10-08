# Convenciones de ingeniería — JONRÓN

## Sistema de coordenadas (mundo 3D)

| Eje | Sentido |
|-----|---------|
| **+X** | Lado de primera base (derecha del cátcher mirando al lanzador) |
| **+Y** | Arriba |
| **+Z** | Hacia el lanzador / jardín central |
| **Origen** | Punta trasera del home plate (vértice del diamante) |

- Unidades SI en todo el código: metros, segundos, kilogramos, radianes.
  Pies, mph, pulgadas y grados **solo** en archivos de configuración y en la UI (conversión con `src/config/constants.ts`).
- Frente del plato (plano de contacto y zona de strike): `z = PLATE.frontZ` (0,432 m).
- Goma del lanzador: `z = 18,44 m`; punto de suelta ≈ `z = 16,55 m`, `y = 1,78 m`.
- Ángulo de dispersión (*spray*): `atan2(x, z)`; positivo hacia el jardín derecho. Foul si `|spray| > 45°`.
- Bateador derecho (R): se para en `x ≈ -0,95` (lado de 3B) mirando a `+X`. Zurdo (L): espejo en X.
- Lanzador derecho: suelta en `x ≈ -0,55`; zurdo en `x ≈ +0,55`. El quiebre "lado del brazo" es `-X` para un derecho.

## Tiempo

- La simulación es **analítica o de paso fijo** (`FIXED_DT = 1/240 s`), nunca depende del framerate.
- El timing del swing se juzga con `event.timeStamp` (mismo reloj que `performance.now()`), no con el frame en el que llega el input.
- El render interpola/muestrea la trayectoria precalculada.

## Capas y dependencias

```
config ─┐
contracts ─┼─> sim (puro, sin three.js, 100% testeable)
           ├─> render (three.js)  ─┐
           ├─> audio (Web Audio)   ├─> game (orquestador) ─> main.ts
           ├─> input (DOM)         │
           └─> ui (DOM)           ─┘
persistence ────────────────────────┘
```

- `sim/` no importa `three`, ni DOM, ni `Math.random` (usa `core/rng.ts` con semilla).
- `render/`, `audio/`, `ui/` no importan nada de `sim/` excepto tipos y `sim/field.ts` (geometría compartida).
- Solo `game/` conoce a todos.

## Estilo

- TypeScript estricto, módulos ES, sin `any` implícito.
- Nombres en inglés en el código; textos de usuario en `es`/`en` (`LocalizedText`).
- Recursos procedurales (geometría, texturas en canvas, audio sintetizado): sin archivos binarios en el repo.
- Liberar recursos de three.js (`dispose()`) al cambiar de estadio.
