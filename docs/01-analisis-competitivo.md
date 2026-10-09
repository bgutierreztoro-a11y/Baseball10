# 01 · Análisis competitivo: juegos de bateo

**Fecha:** 8 de octubre de 2026 · **Producto:** JONRÓN (web 3D, solo bateo, campaña lineal)
**Decisión que informa:** qué construir para el MVP, dónde diferenciarnos y qué evitar.
**Fuentes:** investigación web de esta sesión (fichas de tienda, reseñas, notas de prensa; ver lista al final). Donde no se pudo verificar un dato, se marca como *baja confianza*. Los datos de mercado móvil cambian rápido: revisar cada trimestre.

---

## 1. Mapa del terreno

| Nivel | Productos | Por qué compiten con nosotros |
|---|---|---|
| **Directos** (bateo puro) | Homerun Clash 1 y 2 (Haegin), MLB Home Run Derby (móvil), MLB Home Run Derby VR, Baseball Boy! (Voodoo), Homerun Battle 3D/2 (Com2uS) | El mismo "fantasy" (batear jonrones) para el mismo jugador casual |
| **Indirectos** (bateo dentro de un juego completo) | MLB The Show (Home Run Derby, Road to the Show), Super Mega Baseball 4 | Definen las expectativas de control (PCI, contacto/potencia, feedback de timing) |
| **Adyacentes** | Wii Sports (bateo), juegos web casuales (Poki *Flat Baseball*, CrazyGames *Baseball*, itch.io) | Compiten por los 5 minutos libres en el navegador |
| **Sustitutos** | Jaulas de bateo, simuladores físicos, ver jonrones en redes | Satisfacen la misma emoción por otra vía |

**Ejes del mapa:** *realismo de la física* (arcade ↔ simulación) frente a *barrera de entrada* (instalar o pagar ↔ jugar al instante en web).

```
            Física realista
                  ▲
   The Show ●     │     ● HRD VR (pago, VR)
     SMB4 ●       │
                  │            ★ JONRÓN (objetivo)
 ─────────────────┼──────────────────────────────►  Jugar al instante
   instalar/pagar │                                  (web, gratis)
   HR Clash 2 ●   │
   MLB HRD ●      │      ● Juegos web 2D
   HR Battle ●    │   ● Baseball Boy
                  │
            Arcade / casual
```

El cuadrante **física realista + jugar al instante en web** está vacío.

## 2. Ficha de cada competidor

| Juego | Plataforma / año | Control | Progresión | Monetización | Lo que elogian | Lo que critican |
|---|---|---|---|---|---|---|
| **Homerun Clash** | Móvil, 2018-19 | Mantener y soltar | PvP 1v1, Battle Royale, desafíos; skills y artefactos | F2P + IAP (top 10 en recaudación de deportes en más de 70 países, Haegin, nov-2020) | Controles simples y satisfactorios | Emparejamientos desiguales |
| **Homerun Clash 2** | Móvil, ago-2024 | Una mano: timing + dirección; bolas "debuff" | *World Tour* con 8 capítulos y 240 etapas; 1v1, 2v2 | F2P; personajes de unos 50 US$ (reseña) | Escala de contenido, leyendas reales | Pay-to-win, el reloj corre durante las animaciones, tutorial pobre |
| **MLB Home Run Derby** | Móvil, 2013 en adelante | Arrastrar y soltar | 30 estadios, cartas | MLBucks y mejoras de atributos | Física y estadios con licencia | "Diseñado alrededor de las compras", crashes, cargas lentas |
| **MLB HRD VR** | Quest/Steam, 2024, 29,99 US$ | Swing 1:1 | 100 niveles, temporadas trimestrales, rankings por exit velocity | Pago único + cosméticos | Inmersión, timing por estadio | "Todo son meatballs", bots en línea |
| **Baseball Boy!** | Móvil, 2018 | Un toque | Récord de distancia y mejoras | Anuncios + suscripción semanal | Vuelos cómicos | Un anuncio tras casi cada swing |
| **Homerun Battle 3D/2** | Móvil, 2009-11 | Inclinar + tocar | PvP corto, misiones | Premium + equipo | Partidas de menos de 2 min | "Imposible ganar sin equipo", online obligatorio |
| **Wii Sports** | Wii, 2006/2014 | Movimiento real | 3 entrenamientos que se desbloquean en orden | Ninguna | Intuitivo | Poco contenido |
| **MLB The Show 25/26** | Consolas | PCI + timing; contacto/normal/potencia | Derby por rondas con reloj; carrera | Premium + Stubs | Profundidad; exit velocity y launch angle tras cada swing | "Perfect-Perfect" que acaba en out; curva dura |
| **Super Mega Baseball 4** | Consolas/PC, 2023 | Retícula; contacto o potencia cargada | Dificultad "Ego" por disciplina | Premium | Fluido y responsivo | HUD confuso |
| **Juegos web** | Navegador | Un toque o mouse | Mundos temáticos, dianas | Anuncios | Instantáneos | 2D, sin física, sin feedback |

## 3. Matriz de capacidades

Escala: **Fuerte** · **Adecuado** · **Débil** · **Ausente**.

| Capacidad (por qué importa) | JONRÓN | HR Clash 2 | MLB HRD móvil | HRD VR | The Show | Web casual |
|---|---|---|---|---|---|---|
| **Acceso:** jugar sin instalar | Fuerte | Ausente | Ausente | Ausente | Ausente | Fuerte |
| **Control:** timing + apuntado (habilidad real) | Fuerte (PCI + timing en ms) | Adecuado | Adecuado | Fuerte | Fuerte | Débil |
| **Accesibilidad:** modo solo timing, zurdo, menos movimiento | Fuerte | Débil | Débil | Débil | Adecuado | Débil |
| **Física:** arrastre, Magnus, altitud | Fuerte (RK4 calibrado con Statcast) | Débil | Adecuado | Adecuado | Fuerte | Ausente |
| **Feedback:** EV, LA, distancia y timing en ms | Fuerte | Débil | Adecuado | Adecuado | Fuerte | Ausente |
| **Coaching:** explicar el porqué del resultado | Fuerte (línea de coach en cada swing) | Ausente | Ausente | Ausente | Débil | Ausente |
| **Progresión lineal con objetivos variados** | Fuerte (25 etapas, 5 tipos de misión) | Fuerte (240 etapas) | Adecuado | Fuerte | Adecuado | Débil |
| **Juego justo:** sin pay-to-win ni anuncios | Fuerte | Débil | Débil | Fuerte | Adecuado | Débil |
| **Contenido y escala** | Adecuado (MVP) | Fuerte | Fuerte | Fuerte | Fuerte | Débil |
| **Social / PvP** | Ausente (MVP) | Fuerte | Adecuado | Adecuado | Fuerte | Ausente |
| **Licencias reales** (equipos, jugadores) | Ausente (ficción) | Adecuado | Fuerte | Fuerte | Fuerte | Ausente |
| **Identidad hispana** | Fuerte | Débil | Débil | Débil | Débil | Ausente |

Siendo honestos: perdemos en **volumen de contenido, PvP y licencias**. Ganamos en **acceso, juego justo, física, coaching y voz en español**.

## 4. Posicionamiento

| Producto | Posicionamiento implícito |
|---|---|
| Homerun Clash 2 | "Duelos de jonrones con leyendas": competitivo, coleccionable |
| MLB HRD | "El derby oficial de MLB en tu móvil": licencia |
| HRD VR | "Batea como un profesional": inmersión |
| Baseball Boy | "Un toque y a volar": hipercasual |
| The Show / SMB4 | "El simulador completo": profundidad |

**JONRÓN:** *Para quien quiere sentir un jonrón de verdad en cinco minutos, JONRÓN es el juego de bateo 3D que se juega al instante en el navegador. A diferencia de los juegos móviles de derby, aquí cada batazo lo decide tu habilidad (física real y timing al milisegundo), nunca tu billetera, y cada swing te explica qué hiciste bien o mal.*

- **Posición sin dueño:** "habilidad + transparencia" (te enseñamos por qué).
- **Posición saturada:** "jonrones épicos" y "leyendas". No competimos ahí.
- **Posición vulnerable de otros:** "es justo" (HR Clash 2 y MLB HRD no lo cumplen por la monetización).

## 5. Fortalezas y debilidades clave de los rivales

- **Homerun Clash 2.** Fortalezas: escala de contenido, debuffs creativos y producción. Debilidades: pay-to-win y un reloj que castiga durante la animación.
- **MLB HRD (móvil y VR).** Fortalezas: licencia y física creíble. Debilidades: compras dentro del juego y una dificultad baja hasta los niveles Pro.
- **The Show.** Fortalezas: PCI y feedback del swing. Debilidades: lo complejo que es y los resultados que parecen azar ("perfect-perfect" que acaba en out).
- **Web casual.** Fortaleza: el acceso inmediato. Debilidad: poca profundidad.

### 5.1 Críticas a The Show sobre cómo se lee el lanzamiento

Son las quejas más repetidas de la comunidad sobre el bateo por zona (PCI) de MLB The Show:

1. **Hay que poner el PCI exactamente sobre la bola, y la bola apenas se lee.** Es pequeña, rápida y rompe tarde. Además, el propio PCI la tapa justo en el momento clave. El jugador nuevo siente que adivina en vez de leer.
2. **Los casi-fallos parecen azar.** Un swing con buen timing que se queda a milímetros del borde del PCI es un abanicado o un roletazo débil, sin término medio. Junto con el "perfect-perfect" que acaba en out, el resultado parece decidido por un dado.
3. **La ayuda es de todo o nada.** O juegas con zona (difícil) o con modo direccional/simple, donde el juego apunta por ti. No hay un punto intermedio que enseñe a leer el lanzamiento.
4. **Las ayudas de lectura son anecdóticas.** *Plate Vision* (PCI más grande) solo la tienen algunos jugadores con atributo alto, y el indicador de dónde cruzó la bola solo aparece cuando ya es tarde.

**Qué hace JONRÓN con esto:**
- **Zona aproximada de llegada.** Al soltar el lanzamiento aparece un área dorada difusa (radio 15 cm) por donde la bola cruzará *más o menos*. Su centro se desplaza al azar respecto al punto real (σ = 5,5 cm), pero el punto real siempre queda dentro. Orienta la mirada sin regalar la respuesta, y desaparece cuando la bola llega para que el jugador siga leyendo la bola, no el indicador.
- **Imán de bateo.** Al hacer swing, el PCI se acerca un poco al punto ideal de contacto: un 30 % del desfase dentro del PCI, y los casi-fallos de hasta 1,6 radios se rescatan justo dentro del borde. El imán apunta al punto ideal (algo por debajo de la bola), no al centro exacto, así que el *barrel* y el jonrón siguen dependiendo de leer bien.
- **Ayudas graduables.** Las dos ayudas se activan o desactivan por separado en Ajustes → Ayudas, además del modo casual (solo timing). Así hay un camino gradual de casual a pro.

## 6. Oportunidades

1. **3D con física de verdad en el navegador:** nadie lo ofrece.
2. **Coaching:** convertir los datos tipo Statcast en una explicación.
3. **Jugar justo:** progresión por habilidad y cosméticos ganados con estrellas.
4. **Compartir al instante:** un enlace con el resultado ("supera mi jonrón de 452 ft"), que encaja con WhatsApp en LatAm.
5. **Identidad hispana:** español primero, cantos de jonrón ("¡SE FUE!") y estadios inspirados en el Caribe y México.
6. **Fiabilidad técnica:** timestep fijo, timestamps de input del DOM y calibración de latencia.

## 7. Amenazas

- Que **HR Clash 2 o MLB HRD lancen una versión web o instantánea** (por ejemplo, un juego HTML5 en una plataforma social). *Mitigación:* moverse rápido en coaching y en juego justo, que a ellos les cuesta por su modelo de negocio.
- Que **el 3D no rinda en móviles de gama baja**. *Mitigación:* tres niveles de calidad, bajada automática según FPS y assets 100 % procedurales (bundle pequeño).
- Que **el contenido se agote pronto** (25 etapas). *Mitigación:* derby infinito y práctica en el MVP, y luego desafíos diarios.

## 8. Implicaciones estratégicas (qué hacemos)

| Decisión | Acción en el MVP |
|---|---|
| **Diferenciar** | Física calibrada, coaching en cada swing, timing en ms, calibración de latencia, español primero |
| **Igualar** | PCI con swing de contacto o de potencia (como The Show/SMB4), estrellas por etapa, práctica configurable |
| **Evitar** | Pay-to-win, anuncios, reloj durante animaciones, resultados que contradicen el feedback (sin azar que convierta un barrel en out) |
| **Posponer** | PvP, rankings online, licencias |
| **Vigilar** | Lanzamientos web de Haegin/MLB, temporadas de HRD VR, The Show 27 |

Todas las decisiones de diseño derivadas están en `02-documento-de-diseno.md`.

## Fuentes principales

droidgamers.com (HC2), gamedeveloper.com (HC2 prerregistro), appspy.com, worldsapps.com (reseñas de HC y HC2), imore.com y osftw.com (MLB HRD), mlb.com (HRD 2013 y HRD VR), gamechronicles.com y roadtovr.com (HRD VR), commonsensemedia.org (Baseball Boy), en.wikipedia.org (Homerun Battle 3D), toucharcade.com y pocketgamer.com (HB2), nintendoworldreport.com (Wii Sports Club), mp1st.com e inverse.com (The Show), destructoid.com (The Show 25), touchtapplay.com, sportskeeda.com y cogconnected.com (SMB4), poki.com, crazygames.com, itch.io, mlb.com (reglas del Derby 2024). *Baja confianza:* guías de terceros sobre The Show 26.
