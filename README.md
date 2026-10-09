# JONRÓN ⚾

**Solo tú, el bate y la cerca.** Juego web 3D de béisbol centrado únicamente en el bateo: no hay fildeo ni corrido de bases. Es una campaña lineal de 25 etapas en 5 estadios, con física real del batazo y una explicación de cada swing.

- **Juega al instante** en el navegador (escritorio y móvil): sin instalación, sin anuncios, sin pay-to-win.
- **Habilidad legible:** timing al milisegundo + PCI (círculo de contacto); cada swing muestra velocidad de salida, ángulo, distancia, timing y un *coach* que explica por qué.
- **Física calibrada con Statcast:** arrastre, efecto Magnus y altitud (en La Cumbre la bola vuela ~8 % más).
- **100 % procedural:** estadios, personajes animados por IK, texturas y audio sintetizado; 0 assets binarios y ~216 KB gzip.

## Cómo jugar

| | Pro | Casual |
|---|---|---|
| Apuntar | Mouse / flechas / deslizar el dedo (teléfono) / stick | Automático |
| Batear | Clic / Espacio / BATEAR / A | Igual |
| Potencia | Shift / clic derecho / POTENCIA / RT (círculo más pequeño, más distancia) | Igual |
| Pausa | Esc / P / Start | Igual |
| Peak (El Moro) | E / botón PEAK / Y | Igual |

Haz swing **un instante antes** de que la bola llegue (el bate tarda ~0,12 s; 0,15 s en potencia). Pon el círculo **un poco por debajo** de la bola para elevarla. Si conectas **temprano** la halas; si conectas **tarde**, va al lado contrario.

**Ayudas (activadas por defecto, se apagan en Ajustes):** una *zona dorada* muestra más o menos por dónde pasará cada lanzamiento (nunca el punto exacto), y el *imán de bateo* acerca el círculo a la bola cuando fallas por poco.

**Bateadores:** El Moro (base, con su *peak máximo* en la tecla E), El Mati (enorme y equilibrado), Arturek (gigante de 7,8 m con cuatro brazos y un círculo enorme) y Chamo (el que más pega, con poco contacto). Se eligen en el menú **Bateadores**.

**Modos:** Campaña (El Solar → Malecón → Metropolitano → La Cumbre → Gran Final), Práctica configurable y Derby (10 outs; un jonrón de 440 ft o más da un out extra).

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 99 tests unitarios y de balance (Vitest)
npm run typecheck      # TypeScript estricto
npm run e2e            # build + Playwright (WebGL por SwiftShader)
npm run build          # dist/ (hosting estático)
npm run build:single   # dist-single/index.html (un solo archivo, funciona offline desde file://)
```

### Publicar en Vercel (para compartir)

El repo ya incluye `vercel.json` (Vite, `npm ci`, `npm run build`, salida `dist/`, caché inmutable para `assets/*`).

1. Entra en [vercel.com/new](https://vercel.com/new) e importa el repositorio `bgutierreztoro-a11y/Baseball10` (si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso).
2. Pon como nombre del proyecto `jonron` y deja la configuración detectada. Pulsa **Deploy**.
3. Comparte la URL de producción (`https://jonron.vercel.app` o la que asigne Vercel). Es pública: no hace falta tener cuenta en Vercel. Las URL de *preview* sí piden iniciar sesión.
4. Cada `git push` a la rama de producción vuelve a desplegar solo.

Herramientas de QA visual: `sandbox/stadium.html`, `sandbox/characters.html`, `scripts/shot.mjs` (capturas) y `scripts/play.mjs` (partida guiada que apunta y batea sola).

## Arquitectura (resumen)

```
config/  contenido (estadios, lanzamientos, lanzadores, campaña)
sim/     física y reglas: TS puro, determinista, 100 % testeado sin navegador
render/  three.js: estadio, personajes (IK), bola y VFX, cámara, overlay de zona
ui/      overlay DOM accesible + sistema de diseño
audio/   síntesis Web Audio
game/    App (flujo de pantallas) + Match (máquina de estados del turno al bate)
```

## Documentación

| Documento | Contenido |
|---|---|
| [01 · Análisis competitivo](docs/01-analisis-competitivo.md) | Homerun Clash, MLB HRD, The Show, SMB4, Wii, web: matriz, posicionamiento, oportunidades |
| [02 · Documento de diseño (GDD/PRD)](docs/02-documento-de-diseno.md) | Visión, objetivos, historias, mecánicas, campaña, requisitos P0–P2, métricas |
| [03 · Diseño de sistema](docs/03-diseno-de-sistema.md) | Requisitos no funcionales, componentes, flujo de datos, física, render, trade-offs |
| [ADRs](docs/adr/README.md) | 8 decisiones: web, three.js, física propia, UI DOM, procedural, build, persistencia, timing |
| [04 · Sistema de diseño](docs/04-sistema-de-diseno.md) | Tokens, componentes, auditoría |
| [05 · Estrategia de pruebas](docs/05-estrategia-de-pruebas.md) | Pirámide de tests, cobertura, huecos |
| [06 · Checklist de despliegue](docs/06-checklist-de-despliegue.md) | Pre y post despliegue, rollback |
| [Convenciones](docs/CONVENTIONS.md) | Sistema de coordenadas, unidades, capas |

## Limitaciones conocidas (v0.1)
- En móvil vertical se juega, pero la experiencia recomendada es en horizontal.
- El mando se lee por *polling* (precisión de un frame), a diferencia del mouse y el teclado, que usan el timestamp exacto del evento.
- Sin ranking online ni guardado en la nube: el progreso vive en `localStorage` del navegador.
- Las tipografías se cargan desde Google Fonts; sin conexión se usan las del sistema.
