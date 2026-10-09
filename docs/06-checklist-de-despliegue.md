# 06 · Checklist de despliegue — JONRÓN v0.1

**Fecha:** 2026-10-08 · **Tipo:** sitio estático (sin backend, sin migraciones, sin feature flags)
**Artefactos:** `dist/` (sitio multi-archivo con hashes) y `dist-single/index.html` (un solo archivo, ~222 KB gzip).

## Antes de desplegar
- [x] CI en verde: `typecheck`, `test` (87 unit/integración), `build`, `build:single`, `e2e` (5 tests de humo)
- [x] `npm audit`: 0 vulnerabilidades
- [x] Balance de campaña validado por test (objetivos, estrellas y dianas alcanzables)
- [x] QA visual: 5 estadios, personajes, VFX, flujo completo de etapa (★★★), móvil vertical y horizontal, build de un solo archivo abierto desde `file://`
- [ ] Revisión del PR aprobada
- [x] Sin bugs críticos conocidos (ver "Limitaciones conocidas" en el README)
- [x] **Rollback:** desplegar el artefacto anterior (hosting estático = cambio atómico de archivos; los assets llevan hash, así que no hay mezcla de versiones)
- [x] **Compatibilidad del guardado:** `SaveData.version = 1`; `migrate()` tolera saves futuros o corruptos sin bloquear el juego

## Desplegar
1. **Vercel (hosting elegido):** importar el repo en [vercel.com/new](https://vercel.com/new) como proyecto `jonron`. `vercel.json` fija el framework, la instalación (`npm ci`), el build y la salida `dist/`. La rama de producción es la rama por defecto del repo y cada push despliega solo.
   - Comprobar en *Settings → Deployment Protection* que **Vercel Authentication** esté en "Standard Protection" (solo *previews*), para que la URL de producción se abra sin cuenta.
   - Otras opciones válidas: GitHub Pages, Netlify o S3 + CloudFront publicando `dist/`. `base: './'` funciona en cualquier subruta.
2. Encabezados (ya incluidos en `vercel.json`): `Cache-Control: public, max-age=31536000, immutable` para `assets/*`; `no-cache` para `index.html`.
3. Prueba de humo en producción (2 minutos):
   - [ ] La pantalla de título carga con el estadio 3D y sin errores en la consola
   - [ ] Campaña → 1-1 → ¡A batear! → un swing muestra la tarjeta de bateo
   - [ ] Ajustes → cambio de idioma → persiste al recargar
   - [ ] En un móvil real: botones BATEAR y POTENCIA, arrastrar para apuntar, vertical y horizontal
4. Vigilar durante 15 minutos (cuando haya telemetría P1): errores JS por sesión y FPS p50.

## Después de desplegar
- [ ] Notas de versión (resumen del PR)
- [ ] Compartir el enlace con los probadores de la v0.2 (10–20 jugadores)
- [ ] Abrir issues con los hallazgos de la prueba

## Disparadores de rollback
- Errores JS no capturados en más del 2 % de las sesiones
- La pantalla de título no se vuelve interactiva en 5 s en banda ancha
- El flujo "1-1 → primer swing" falla en cualquier navegador principal (Chrome, Safari, Firefox, Edge)
- FPS p50 por debajo de 30 en escritorio de gama media
