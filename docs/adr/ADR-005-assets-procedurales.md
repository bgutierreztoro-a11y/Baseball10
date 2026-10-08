# ADR-005: Recursos 100 % procedurales

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Un juego web debe cargar rápido; los modelos GLB, las texturas y los audios pesan varios MB y traen licencias. Los personajes necesitan animaciones sincronizadas con la simulación (el bate en el punto exacto).

## Decisión
Generar en tiempo de ejecución: geometría (estadios, gradas, personajes con IK), texturas (canvas 2D: césped, tierra, costuras, carteles) y audio (Web Audio: crack, público, órgano, fanfarrias).

## Opciones consideradas
| | Procedural | Assets importados (GLB/OGG) | Generados por IA (imagen a 3D) |
|---|---|---|---|
| Peso | ~0 KB | 5–30 MB | 5–20 MB |
| Licencias | Propias | Hay que comprarlas o crearlas | Revisar términos; mallas sin rig |
| Animación sincronizada | Exacta (IK por código) | Requiere rig y *retargeting* | Sin rig |
| Fidelidad visual | Estilizada | Alta | Variable |

## Trade-off
Estética estilizada tipo "juguete de diseño" a cambio de carga instantánea, cero licencias y parámetros (paleta, cercas, altitud) que cambian todo de forma coherente. Se descartó generar modelos con IA en esta versión: las mallas sin rig no sirven para un swing sincronizado y tendrían coste.

## Consecuencias
- Cinco estadios distintos salen de los datos de `config/stadiums.ts`.
- Revisar: personajes GLB con rig si se busca más realismo (los contratos `BatterRig`/`PitcherRig` lo permiten).
