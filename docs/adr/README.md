# Architecture Decision Records

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](ADR-001-plataforma-web.md) | Plataforma: web en el navegador | Aceptada |
| [ADR-002](ADR-002-motor-3d.md) | Motor 3D: three.js sin framework | Aceptada |
| [ADR-003](ADR-003-fisica-propia.md) | Física propia (lanzamiento analítico + RK4) en vez de un motor genérico | Aceptada |
| [ADR-004](ADR-004-ui-overlay-dom.md) | UI como overlay DOM con TypeScript vanilla | Aceptada |
| [ADR-005](ADR-005-assets-procedurales.md) | Recursos 100 % procedurales (geometría, texturas, audio) | Aceptada |
| [ADR-006](ADR-006-build-y-despliegue.md) | Build con Vite + TypeScript; hosting estático y versión de un solo archivo | Aceptada |
| [ADR-007](ADR-007-persistencia-local.md) | Persistencia local versionada, sin backend en v1 | Aceptada |
| [ADR-008](ADR-008-timing-de-input.md) | Timing del swing con `event.timeStamp`, reloj real y *time-warp* visual | Aceptada |

Formato: contexto → decisión → opciones con tabla → trade-offs → consecuencias → acciones.
