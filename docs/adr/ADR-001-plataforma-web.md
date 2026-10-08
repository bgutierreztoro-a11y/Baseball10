# ADR-001: Plataforma web (navegador)

**Estado:** Aceptada · **Fecha:** 2026-10-08 · **Decide:** CTO/CEO

## Contexto
El análisis competitivo muestra que los juegos de bateo realistas exigen instalar o pagar (consola, VR, apps con IAP) y que el único hueco libre es *física realista + jugar al instante*. La distribución por enlace (WhatsApp, redes) es clave para LatAm.

## Decisión
Construir un juego **web** (WebGL2) que funcione en escritorio y móvil sin instalación, con opción de PWA más adelante.

## Opciones consideradas
### A: Web (WebGL2 + TypeScript)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Media |
| Coste | Bajo (hosting estático) |
| Escalabilidad | Muy alta (CDN) |
| Alcance | Máximo: un enlace |

**Pros:** cero fricción, se comparte por URL, iteración rápida. **Contras:** rendimiento menor que el nativo y diferencias entre navegadores.

### B: Unity o Godot con exportación nativa y web
| Dimensión | Evaluación |
|---|---|
| Complejidad | Media-alta |
| Coste | Medio |
| Escalabilidad | Alta |
| Alcance | Las tiendas exigen instalar; la build web pesa 10–30 MB |

**Pros:** editor y tooling maduros. **Contras:** builds web pesadas, arranque lento y dependencia de licencias y runtimes.

### C: App móvil nativa
**Pros:** rendimiento y hápticos. **Contras:** revisión de tiendas, instalación y el mismo terreno que HC2 y MLB HRD.

## Trade-off
Cedemos algo de techo gráfico a cambio de distribución inmediata y de un bundle de unos 216 KB gzip, que es nuestra ventaja competitiva principal.

## Consecuencias
- Más fácil: compartir, A/B testing, despliegues instantáneos.
- Más difícil: optimizar para GPUs móviles débiles (por eso los niveles de calidad).
- Revisar: PWA y offline (P1), y un *wrapper* nativo si los datos lo justifican.

## Acciones
1. [x] Proyecto Vite + TS con WebGL2.
2. [ ] PWA (manifest + service worker).
