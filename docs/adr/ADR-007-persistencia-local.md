# ADR-007: Persistencia local versionada, sin backend en v1

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Hay que guardar el progreso (estrellas, desbloqueos), los récords y los ajustes. En v1 no hay cuentas ni ranking global.

## Decisión
Un único documento JSON versionado (`jonron.save`, `version: 1`) en `localStorage`. Toda lectura pasa por `migrate()`, que valida tipos, acota rangos y descarta claves desconocidas; las escrituras son inmutables.

## Opciones consideradas
| | localStorage versionado | IndexedDB | Backend con cuentas |
|---|---|---|---|
| Complejidad | Baja | Media | Alta |
| Coste | 0 | 0 | Servidor + autenticación + privacidad |
| Multi-dispositivo | No | No | Sí |

## Consecuencias
- Funciona en modo privado (sin guardar) gracias a `safeStorage()`.
- La migración está cubierta por tests (JSON corrupto, valores fuera de rango).
- Revisar en P2: sincronización opcional en la nube y ranking (el determinismo permite validar puntuaciones en el servidor).
