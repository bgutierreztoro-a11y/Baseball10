# JONRÓN ⚾

**Solo tú, el bate y la cerca.** Juego web 3D de béisbol centrado en el bateo: campaña lineal de 25 etapas en 5 estadios, física real del batazo y una explicación de cada swing. Desde v0.2 también hay **Partido rápido** con conteo, entradas y **carreras entre bases**, un **Estudio** para crear tu propio bateador y un **Desafío diario**.

- **Juega al instante** en el navegador (escritorio y móvil): sin instalación y sin pay-to-win. Los anuncios son opcionales (con recompensa) y solo aparecen si el despliegue configura un proveedor (ver [ADR-009](docs/adr/ADR-009-anuncios.md)).
- **Habilidad legible:** timing al milisegundo + PCI (círculo de contacto); cada swing muestra velocidad de salida, ángulo, distancia, timing y un *coach* que explica por qué.
- **Física calibrada con Statcast:** arrastre, efecto Magnus y altitud (en La Cumbre la bola vuela ~8 % más).
- **100 % procedural:** estadios, personajes animados por IK, texturas y audio sintetizado; 0 assets binarios y ~310 KB gzip.

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

**Bateadores:** El Moro (base, con su *peak máximo* en la tecla E), El Mati (Ronnie Coleman en silla de ruedas, equilibrado, que batea con una mancuerna en vez de bate; con su *preentreno*, antes de cada lanzamiento hay un 10 % de que le caiga un preentreno con café, Monster y semen de caballo: se levanta de la silla convertido en el Ronnie Coleman de sus mejores años y durante 3 lanzamientos batea con visión 15, contacto 20 y poder 25; en su gimnasio juega en casa: +20 % de ojo y de velocidad de bate y el preentreno cae el 35 % de las veces), Arturek (gigante de 7,8 m con cuatro brazos: visión 20, contacto 5, poder 2; con él lanza Vikokotor, bajito y gordito, del MŠK Žilina y con el escudo del club flotando encima, y corre *la maldición de Bubenik*: antes de cada lanzamiento hay un 20 % de que tire un petardo encendido; si lo bateas, 50 % explota, mata a Arturek y quema todo el estadio, y se acaba el partido, y 50 % es jonrón seguro), Chamo (un esqueleto de 1,90 m con cuernos de villano y un cuerno como bate; swing inspirado en Barry Bonds: visión 10, contacto 5, poder 24; en el Estadio de Southampton está nerfeado: su primer jonrón lo atrapa detrás de la cerca un eslovaco de los «mandem», con su Nike Tech, que se escapa con la pelota y se va con Valentina, la ex de Chamo y ahora su novia; cuenta como out), Chimon (un mono con raqueta de tenis: si abanica 3 veces seguidas se enoja, se le pone la cara roja y cada pelota que toca sale a máxima potencia, 50 % jonrón seguro y 50 % foul hacia cualquier lado; se calma con un jonrón y luego necesita 10 swings para volver a enojarse; con él, el lanzador es un pollo; en la Cancha Central su ojo de bateo es un 15 % más grande) y Benjamin Gutenberg (un rabino; al entrar al partido, Netanyahu baja en su kipá volador a darle la bienvenida al juego; con él el lanzador también viste de rabino; antes de cada lanzamiento hay un 25 % de que aparezca un centavo en el campo, y si la pelota lo toca, Netanyahu baja en un kipá volador al ritmo de Hava Nagila y el ojo de bateo cubre el 85 % de la zona durante 3 lanzamientos). Fuera de la campaña están el **Estadio del Danubio** (Bratislava, con el castillo y el puente OVNI de fondo), donde Arturek batea con +25 % de potencia; el **Estadio de Southampton** (una ciudad británica donde llueve sin parar: en vez de gradas hay hileras de casas adosadas típicas de un vecindario británico, la afición mira desde las ventanas y detrás del jardín central están el puerto, las grúas y un crucero) y la **Cancha Central** (un estadio de tenis: una cancha dura gigante con su red pintada en el jardín, infield de arcilla y gradas como las de un torneo de tenis, con techo, silla del juez, jueces de línea y recogepelotas) y el **Gimnasio Iron Paradise** (el gimnasio de El Mati: un salón cerrado con techo de cerchas y luces, piso de goma, máquinas, racks, cintas, poleas, mancuernas y pesas por todo el jardín, espejos, estatuas doradas de Ronnie Coleman y una hinchada de puros fisicoculturistas). Se eligen en el menú **Bateadores**.

**Modos:** Campaña (El Solar → Malecón → Metropolitano → La Cumbre → Gran Final), Práctica configurable, Derby (10 outs; un jonrón de 440 ft o más da un out extra), **Partido rápido** (1, 3 o 5 entradas contra seis rivales con *trash talk*: Los Ramiros, Pollos Furiosos, Mandem FC, Vikokotores de Žilina, Los Mamados del Iron Paradise y Huesos FC) y **Desafío diario** (el mismo reto para todos cada día, con racha y puntuación para compartir).

**Carreras (Partido rápido):** cuando la bola queda en juego corres tú. Espacio / clic / ¡CORRE! para seguir a la siguiente base, Shift / clic derecho / REGRESA para volver y ¡BÁRRETE! (el mismo botón, en dorado) cuando viene el tiro. El coach de tercera te enseña un semáforo. Cada bateador tiene **velocidad** (Arturek 22, Chimon 20, El Mati 15, Chamo 12, El Moro 10, Benjamin 6).

**Estudio:** crea bateadores con cuerpo humano, de mono o de esqueleto, de 1,45 a 7,80 m, cabezón, bigote, gafas, cuernos, cuatro brazos, silla de ruedas turbo, bate de madera, baguette, chancla, cuerno, raqueta o mancuerna, y un rasgo del roster (peak, preentreno, mal genio, centavo, petardo…). Todos reparten los mismos 42 puntos; las **Fichas** (que se ganan jugando) solo compran estilo, rasgos y huecos.

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 159 tests unitarios y de balance (Vitest)
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
sim/     física y reglas (bateo, carreras, partido): TS puro, determinista, testeado sin navegador
ads/     anuncios: proveedores intercambiables + política de frecuencia
render/  three.js: estadio, personajes (IK), bola y VFX, cámara, overlay de zona
ui/      overlay DOM accesible + sistema de diseño
audio/   síntesis Web Audio
game/    App (flujo de pantallas) + Match (máquina de estados del turno al bate)
```

### Anuncios

Por defecto no hay anuncios. Para activarlos en la build: `VITE_ADS=h5` + `VITE_ADSENSE_CLIENT=ca-pub-…` (Google H5 Games Ads; `VITE_ADS_TEST=on` para pruebas), `VITE_ADS=poki` o `VITE_ADS=crazygames` (también se detectan por dominio). En desarrollo y con `?ads=dev` se muestra un anuncio de prueba.

## Documentación

| Documento | Contenido |
|---|---|
| [07 · Plan maestro](docs/07-plan-maestro.md) | Investigación, qué tiene un juego de béisbol de calidad, v0.2, monetización, ideas graciosas y hoja de ruta |
| [01 · Análisis competitivo](docs/01-analisis-competitivo.md) | Homerun Clash, MLB HRD, The Show, SMB4, Wii, web: matriz, posicionamiento, oportunidades |
| [02 · Documento de diseño (GDD/PRD)](docs/02-documento-de-diseno.md) | Visión, objetivos, historias, mecánicas, campaña, requisitos P0–P2, métricas |
| [03 · Diseño de sistema](docs/03-diseno-de-sistema.md) | Requisitos no funcionales, componentes, flujo de datos, física, render, trade-offs |
| [ADRs](docs/adr/README.md) | 10 decisiones: web, three.js, física propia, UI DOM, procedural, build, persistencia, timing, anuncios, carreras |
| [04 · Sistema de diseño](docs/04-sistema-de-diseno.md) | Tokens, componentes, auditoría |
| [05 · Estrategia de pruebas](docs/05-estrategia-de-pruebas.md) | Pirámide de tests, cobertura, huecos |
| [06 · Checklist de despliegue](docs/06-checklist-de-despliegue.md) | Pre y post despliegue, rollback |
| [Convenciones](docs/CONVENTIONS.md) | Sistema de coordenadas, unidades, capas |

## Limitaciones conocidas (v0.1)
- En móvil vertical se juega, pero la experiencia recomendada es en horizontal.
- El mando se lee por *polling* (precisión de un frame), a diferencia del mouse y el teclado, que usan el timestamp exacto del evento.
- Sin ranking online ni guardado en la nube: el progreso (incluidos los jugadores creados y las Fichas) vive en `localStorage` del navegador.
- Las tipografías se cargan desde Google Fonts; sin conexión se usan las del sistema.
