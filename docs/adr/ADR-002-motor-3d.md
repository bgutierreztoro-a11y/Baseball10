# ADR-002: Motor 3D: three.js sin framework

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Necesitamos un render 3D web con sombras, post-proceso (bloom), instancing y shaders propios. El bucle es muy sensible al rendimiento y a la latencia.

## Decisión
**three.js (r186) directo**, sin React Three Fiber. Addons de `three/examples/jsm` para el post-proceso.

## Opciones consideradas
| | three.js | Babylon.js | PlayCanvas | React Three Fiber |
|---|---|---|---|---|
| Peso (min+gz) | ~150 KB | ~1 MB (núcleo completo) | ~300 KB + editor | three + React (~45 KB extra) |
| Control fino del bucle | Total | Alto | Medio (editor) | Indirecto (reconciliación) |
| Ecosistema | Enorme | Grande | Medio | Grande |
| Curva | Media | Media | Baja (editor) | Media |

**three.js.** Pros: ligero, flexible y documentado. Contras: hay que montar más uno mismo (no hay editor).
**Babylon.js.** Pros: muy completo (física, GUI, inspector). Contras: más peso, y no necesitamos su física ni su GUI.
**PlayCanvas.** Pros: editor colaborativo. Contras: flujo atado al editor y la nube.
**R3F.** Pros: declarativo. Contras: añade React y la reconciliación al *hot path*; nuestra UI ya es DOM.

## Trade-off
Más código propio (personajes, estadio) a cambio de control total y del menor peso.

## Consecuencias
- Contratos propios (`render/api.ts`) que aíslan la implementación: se podría migrar a WebGPU o a otro motor por módulos.
- Revisar: `WebGPURenderer` de three cuando su soporte sea universal.
