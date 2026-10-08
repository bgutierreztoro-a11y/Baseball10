# ADR-004: UI como overlay DOM con TypeScript vanilla

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Hay menús, HUD, tarjetas de datos, formularios de ajustes y calibración. Requisitos: accesibilidad (teclado, lector de pantalla), texto nítido a cualquier DPI, i18n y responsive.

## Decisión
Una capa **DOM** sobre el canvas (`#ui` con `pointer-events: none` salvo en los controles), escrita en **TS vanilla** con un helper `h()`, sin `innerHTML` con datos, y un sistema de diseño en CSS custom properties. El juego entrega *view-models* con textos ya localizados.

## Opciones consideradas
| | DOM vanilla | React/Preact | UI dentro del canvas (three-mesh-ui) |
|---|---|---|---|
| Accesibilidad | Nativa | Nativa | Hay que construirla |
| Peso | 0 KB | 4–45 KB | ~100 KB + fuentes SDF |
| Nitidez del texto | Perfecta | Perfecta | Depende del SDF |
| Productividad | Media | Alta | Baja |

## Trade-off
Algo más de código imperativo a cambio de 0 KB extra y accesibilidad nativa. Las pantallas son pocas y estáticas, así que no hace falta un diff virtual.

## Consecuencias
- El HUD se actualiza con un diff barato (comparar el VM anterior) para no tocar el DOM en cada frame.
- Revisar: Preact si la UI crece (tienda de cosméticos, perfiles).
