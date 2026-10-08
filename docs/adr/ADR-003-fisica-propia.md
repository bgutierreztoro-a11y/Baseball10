# ADR-003: Física propia en vez de un motor genérico

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
El núcleo del juego es: (1) un lanzamiento que debe llegar a un punto y en un instante exactos, para poder juzgar el timing al milisegundo, y (2) un batazo con arrastre y efecto Magnus que dé distancias creíbles. No hay colisiones complejas: solo suelo, pared y grada.

## Decisión
- **Lanzamiento:** modelo de **aceleración constante** (el de PITCHf/x y Statcast), analítico. Se elige el punto de cruce y el tiempo de vuelo, y se resuelve `v0`.
- **Batazo:** integración **RK4 a 240 Hz** con gravedad, arrastre cuadrático (Cd 0,37) y Magnus (Cl de Sawicki-Hubbard-Stronge), con la densidad del aire de cada estadio. El vuelo completo se precalcula en el contacto.

## Opciones consideradas
| | Física propia | Rapier (WASM) | cannon-es |
|---|---|---|---|
| Exactitud del timing | Exacta (analítica) | Depende del paso | Depende del paso |
| Magnus y arrastre | Nativos | Fuerzas manuales | Fuerzas manuales |
| Determinismo | Total, testeable en Node | Sí (WASM) | Parcial |
| Peso | ~4 KB | ~400 KB WASM | ~150 KB |

## Trade-off
Mantenemos unas 400 líneas de física a cambio de exactitud, determinismo, cero dependencias y tests sin navegador.

## Consecuencias
- Calibración verificada en tests (100 mph a 28° ≈ 406 ft) y balance de la campaña comprobado automáticamente.
- Añadir viento o temperatura es un término más en `makeDeriv`.
- Si en el futuro hiciera falta física de cuerpos (por ejemplo, fildeo), se podría añadir Rapier solo para eso.
