# ADR-008: Timing del swing con `event.timeStamp`, reloj real y *time-warp* visual

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Las ventanas de timing son de ±9 a ±95 ms. Si el swing se juzgara en el frame en que se procesa el input, a 30 FPS el error sería de hasta 33 ms. El análisis competitivo detectó juegos web cuya velocidad de bate dependía del framerate.

## Decisión
1. El lanzamiento corre en el **reloj real** (`performance.now()`): la posición es una función analítica del tiempo, sin acumular `dt`.
2. El swing usa el **`timeStamp` del evento DOM** (mismo reloj), menos la **latencia calibrada** por el jugador (metrónomo audiovisual de 8 golpes).
3. `contactTime = (timeStamp − latencia − suelta)/1000 + swingTime`; el resultado se calcula de inmediato.
4. **Time-warp visual:** si hubo contacto, la bola dibujada se reacelera o desacelera durante los ≤ 150 ms que tarda el swing para que bate y bola coincidan en pantalla. La física usa el tiempo verdadero.
5. La cámara lenta solo afecta al vuelo del batazo, nunca al lanzamiento.

## Opciones consideradas
| | timeStamp + reloj real | Juicio por frame | Física en un worker con un reloj propio |
|---|---|---|---|
| Error de medición | < 1 ms | Hasta 1 frame | < 1 ms |
| Complejidad | Baja | Mínima | Alta |
| Coherencia visual | Con *time-warp* | Natural | Requiere sincronizar |

## Consecuencias
- El timing es justo en máquinas lentas (verificado en headless con SwiftShader a pocos FPS).
- El mando se lee por *polling* (precisión de un frame); se documenta como limitación.
