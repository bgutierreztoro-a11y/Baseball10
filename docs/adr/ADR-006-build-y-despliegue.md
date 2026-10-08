# ADR-006: Build con Vite + TypeScript; hosting estático y versión de un solo archivo

**Estado:** Aceptada · **Fecha:** 2026-10-08

## Contexto
Hace falta tipado estricto, HMR para iterar, tests rápidos y una salida que se pueda alojar en cualquier CDN y también compartir como un único HTML (vista previa, uso offline).

## Decisión
- **Vite 8 + TypeScript 7 (estricto)**, **Vitest** para unit tests y **Playwright** para e2e.
- `npm run build` genera `dist/` (estático, `base: './'`).
- `npm run build:single` genera `dist-single/index.html` con JS y CSS en línea mediante un **plugin propio de unas 30 líneas** en `vite.config.ts`. Se descartó `vite-plugin-singlefile` porque arrastraba `micromatch`/`braces` con un aviso de seguridad (DoS) en `npm audit`.
- CI en GitHub Actions: typecheck, tests, build y e2e.

## Opciones consideradas
| | Vite | webpack | esbuild directo |
|---|---|---|---|
| Configuración | Mínima | Alta | Media |
| HMR | Excelente | Bueno | No |
| Tests integrados | Vitest | Jest | Aparte |

## Consecuencias
- Desplegable en GitHub Pages, Vercel, Netlify o S3+CloudFront sin cambios.
- `npm audit` limpio (0 vulnerabilidades).
