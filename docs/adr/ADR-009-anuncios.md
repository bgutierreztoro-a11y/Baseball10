# ADR-009: Anuncios opcionales con proveedor intercambiable y política propia

**Estado:** Aceptada · **Fecha:** 2026-11-05 · **Sustituye en parte:** el no-objetivo «Monetización» de `02-documento-de-diseno.md`

## Contexto
Queremos ingresos sin romper el principio de juego justo. El juego es web y se puede distribuir en portales (Poki, CrazyGames) o en dominio propio, y cada canal tiene su SDK de anuncios y sus reglas.

## Decisión
- Interfaz única `AdService` (`src/ads/index.ts`) con proveedores `none`, `dev`, `h5` (Google AdSense H5 Games Ads / Ad Placement API), `poki` y `crazygames`. Se elige por `VITE_ADS` o por dominio; `?ads=dev|none` lo fuerza para QA. El SDK solo se inyecta para el proveedor elegido: la build por defecto no hace peticiones a terceros.
- Política propia y pura (`src/ads/policy.ts`, testeada) por encima de la de cada plataforma: *rewarded* siempre opcional y con aviso de la recompensa; intersticial solo entre partidas, nunca en las 2 primeras ni en los primeros 90 s, 3 min entre anuncios, nunca en botones de navegación y nunca para quien compró «Quitar anuncios».
- Recompensas: ×2 Fichas y una segunda oportunidad (3 outs / 15 s). Nunca stats ni ventaja en modos competitivos.

## Opciones consideradas
| | Interfaz propia + varios SDK | Un solo SDK (p. ej. solo AdSense) | Sin anuncios |
|---|---|---|---|
| Canales | Web propia + portales | Solo web propia | — |
| Control de frecuencia | Nuestro y testeado | El del SDK | — |
| Peso en la build | ~3 KB; SDK bajo demanda | Igual | 0 |
| Ingresos | Sí | Limitado (aprobación de AdSense) | 0 |

## Consecuencias
- Despliegue propio sin `VITE_ADSENSE_CLIENT` = sin anuncios (como antes). Los botones de recompensa no aparecen si no hay proveedor.
- El audio se suspende durante cada anuncio; `gameplayStart/Stop` se llaman al empezar, pausar y terminar los partidos.
- Pendiente: consentimiento (CMP) en la web propia antes de activar AdSense personalizado; los portales lo gestionan ellos.
