# ADR-010: Corrido de bases determinista con decisiones del jugador

**Estado:** Aceptada · **Fecha:** 2026-11-05 · **Cambia:** el no-objetivo «sin corrido de bases» (solo en el nuevo modo Partido; la campaña sigue siendo solo bateo)

## Contexto
Un partido de béisbol necesita qué pasa después del batazo. Antes, hit/out salía de cubos tipo Statcast sin fildeadores. Queríamos decisiones con riesgo (¿voy por el doble?) sin introducir azar que contradiga lo que el jugador ve.

## Decisión
- `src/sim/baserunning.ts` (puro, sin three.js): plan de fildeo por bola (quién la recoge, dónde y cuándo: rebote, rodado, pared), tiempos de tiro con relevo, velocidad del corredor desde el atributo `speed` (7,0–9,3 m/s) y una clase `BaseRunningPlay` que avanza en tiempo real con tres comandos: avanzar, regresar y barrerse.
- La defensa tira siempre a la base a la que va el corredor (o una por delante si es imposible sacarlo). Out si la bola llega antes por el tiempo de toque (0,08 s).
- `src/sim/game.ts` aplica el resultado a las reglas del partido (conteo, outs, corredores forzados, sacrificio, doble play, walk-off, extra innings).
- El render (`render/characters/fielders.ts`) solo dibuja lo que dice la simulación; la cámara *overview* encuadra corredor y bola.

## Opciones consideradas
| | Determinista con decisiones | Probabilidades por tipo de hit | Física completa de fildeadores |
|---|---|---|---|
| Legible / justo | Sí: misma jugada, mismo resultado | No: azar visible | Sí |
| Esfuerzo | Medio | Bajo | Muy alto |
| Testeable sin navegador | Sí | Sí | Difícil |

## Consecuencias
- Tiempos calibrados con Statcast (home→1.ª 4,3 s promedio) y cubiertos por tests (sencillo, doble a la pared, hit de piernas, barrida, doble play, determinismo).
- Los corredores que no controla el jugador avanzan por reglas simplificadas (`applyPlay`), no por carrera simulada: suficiente para v0.2; revisar si se añade robo de bases.
- Los hits que no cambian con la carrera (jonrones, fly outs) mantienen la clasificación anterior: la campaña no cambia.
