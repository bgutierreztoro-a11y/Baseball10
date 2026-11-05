# 07 · Plan maestro v0.2 → v1.0 — JONRÓN

**Fecha:** 5-nov-2026 · **Estado:** v0.2 implementada en este cambio (Partido rápido con carreras, Estudio de jugadores, Fichas, Desafío diario, anuncios opcionales) · **Decisiones:** [ADR-009](adr/ADR-009-anuncios.md), [ADR-010](adr/ADR-010-carreras.md)

Este documento responde a tres preguntas: **qué tiene un juego de béisbol de calidad**, **qué le faltaba a JONRÓN** y **cómo lo construimos, lo monetizamos y lo hacemos crecer** sin perder lo que nos hace distintos (física legible, coaching, humor propio, jugar al instante en la web).

---

## 1. Investigación: cómo lo hacen los demás

| Juego | Qué copiamos (y mejoramos) | Qué evitamos |
|---|---|---|
| **MLB The Show** | Corrido de bases por comandos: *avanzar* y *regresar* para todos los corredores, barrida con timing y dirección | Demasiados botones (stick + bumpers + gatillos). Nosotros: 1 botón para correr/barrerse y 1 para regresar |
| **Super Mega Baseball 4** | Personalización profunda (apariencia, equipo, música) y modos cortos | Las reseñas piden un creador de jugadores de verdad: SMB4 solo deja editar agentes libres dentro de una liga |
| **Mario Superstar Baseball** | Habilidades estrella por personaje, *química*, controles de dos botones con techo de habilidad alto | Azar que decide el partido |
| **Backyard Baseball ’97** (remaster 2024-25) | Personajes con personalidad y *trash talk* infantil pero gracioso entre jugadas | — |
| **Homerun Clash 2** | 1v1, World Tour de 240 etapas, *debuffs* creativos, temporadas | Pay-to-win, emparejamiento desigual |
| **Wordle / juegos diarios** | Un reto al día igual para todos, una sola puntuación del día, compartir el resultado | Rachas que castigan (perder la racha no quita nada en JONRÓN) |
| **Poki / CrazyGames** | Anuncios en pausas naturales, *rewarded* siempre opcional, `gameplayStart/Stop` | Anuncio en botones de navegación; *rewarded* + intersticial entre los mismos dos niveles |

**Datos que calibran la mecánica nueva** (Statcast): velocidad de sprint media 27 ft/s, élite 30 ft/s, rango 23–30,5 ft/s. Con eso, de home a primera ≈ 4,3 s (promedio), 3,8 s (élite), 4,8 s (lento); un doble ≈ 8 s y un triple ≈ 11,7 s. Son exactamente los tiempos que da `sim/baserunning.ts`.

**Datos de monetización** (blogs de redes publicitarias: tomarlos como orientativos): en juegos casuales el *rewarded* es el formato que más ingresa (~45 %) y el intersticial se acerca (~44 %). Topes recomendados: 3–10 *rewarded* por sesión, 2–5 min entre anuncios, intersticial solo en pausas naturales, avisar siempre qué recompensa se recibe antes de ver el anuncio. Las plataformas aplican su propio *cooldown* (CrazyGames: 3 min).

Fuentes: guías de controles de MLB The Show (gamepur, gamespot, outsidergaming), reseñas de SMB4 (mp1st, gameinformer, sportskeeda), Mario Wiki (Star Swing, Chemistry), Gematsu / Niche Gamer (Backyard Baseball ’97), PocketGamer (Homerun Clash 2), MLB.com glosario Statcast (Sprint Speed), developers.google.com/ad-placement, docs.crazygames.com (SDK v3 y requisitos de anuncios), sdk.poki.com, appsamurai / venatus / cas.ai (*rewarded*), Axios (rachas de Wordle).

## 2. Qué tiene un juego de béisbol de calidad

1. **Sensación de contacto inmediata**: sonido, cámara, vibración y datos al instante. *JONRÓN ya lo tenía; v0.2 añade vibración háptica.*
2. **Decisiones después del batazo**: correr o frenar, arriesgar la extra, el tiro que llega justo. *Faltaba: v0.2 añade el corrido de bases.*
3. **Contexto de partido**: conteo, outs, corredores, marcador, entradas, walk-off. *Faltaba: v0.2 añade el Partido rápido.*
4. **Identidad del jugador**: crear tu bateador, verlo en el campo. *Faltaba: v0.2 añade el Estudio.*
5. **Razones para volver**: reto diario, rachas, progresión, coleccionables. *v0.2: Desafío diario, Fichas y piezas desbloqueables.*
6. **Juego justo y legible**: el resultado se explica y nunca lo decide la billetera. *Se mantiene como principio.*
7. **Humor y personalidad**: personajes memorables, narración con gracia. *Es nuestra marca: v0.2 la extiende a rivales, narración de carreras y piezas absurdas.*
8. **Compartir**: un resultado que se manda por WhatsApp. *Ya existía; v0.2 añade textos para Partido y Diario.*

## 3. Qué se construyó en v0.2

### 3.1 Corrido de bases (ADR-010)

Cuando la bola queda en juego en el **Partido rápido**, el jugador corre:

| Acción | Teclado / ratón | Táctil | Mando |
|---|---|---|---|
| ¡Corre! (sigue a la siguiente base) | Espacio / clic | Botón ¡CORRE! | A |
| Regresa (primero cancela la base extra, luego da la vuelta) | Shift+Espacio / clic derecho | Botón REGRESA | RT |
| ¡Bárrete! (cuando viene el tiro a esa base) | Espacio dentro de los últimos 4,5 m | El mismo botón se pone dorado | A |

- **Barrida con timing**: en los últimos 2,6 m gana 0,12 s; antes de tiempo pierde 0,12 s.
- **Coach de tercera** (ayuda que se apaga en Ajustes): semáforo verde «¡SIGUE, SIGUE!», amarillo «Mmm… arriesgado», rojo «¡QUIETO AHÍ!». Compara la llegada del corredor con el mejor tiro posible de la defensa.
- **Defensa con lógica real**: el jardinero más cercano persigue la bola (que rebota y rueda o pega en la pared), la recoge, hace el *crow hop* y tira **siempre a la base a la que vas**; si es imposible sacarte ahí, tira por delante para que no avances. Tiros largos pasan por un relevo.
- **Hits de piernas**: los roletazos que el modelo marca como out se pueden ganar corriendo (corredores rápidos y rodados lentos).
- **Doble play y bola escogida** cuando hay corredor forzado en primera.
- **Velocidad** es el 4.º atributo (0–25) de todos los bateadores: Arturek 22 (zancadas de 8 m), Chimon 20 (corre en cuatro patas), El Mati 15 (silla turbo; 18 con preentreno), Chamo 12, El Moro 10, Benjamin 6 (el abrigo largo no ayuda).
- **Determinista y testeado**: misma bola + mismas decisiones = mismo resultado. Ningún dado convierte una carrera bien leída en out.

### 3.2 Partido rápido

- 1, 3 o 5 entradas. Eres el equipo de casa: el rival batea arriba (simulado, carreras Poisson según dificultad) y tú abajo.
- Conteo real (4 bolas = base por bolas, 3 strikes = ponche, foul con dos strikes no cuenta), 3 outs por entrada, corredores fantasma en tus colores, elevado de sacrificio, walk-off, extra innings con corredor en segunda y empate tras 3 entradas extra.
- **Seis rivales con chistes del universo JONRÓN** y *trash talk* entre entradas: Los Ramiros (todos se llaman Ramiro, como el de iluvkiwiss), Pollos Furiosos (primos del lanzador de Chimon), Mandem FC («Valentina está en la grada, bro»), Vikokotores de Žilina («ojo, que traemos petardos»), Los Mamados del Iron Paradise y Huesos FC («no tenemos corazón. Literal»).
- Marcador estilo TV (equipos, entrada ▲/▼, diamante de bases, conteo B-S-O), pizarra de entradas al final y narración cómica: «Abanicó el aire acondicionado», «Lo agarraron como a un pollo», «¡Más ajustado que el pantalón de El Mati!».
- Todas las mecánicas de los personajes funcionan dentro del partido (peak, preentreno, centavo, mal genio, ladrón de Southampton, petardo).

### 3.3 Estudio de jugadores (creador de personajes)

Inspirado en los creadores de Mii, Road to the Show y los *presets* de Baldur’s Gate 3 (plantillas + sliders + aleatorio), con vista 3D en vivo que se gira arrastrando:

| Pestaña | Opciones |
|---|---|
| Cuerpo | Humano / **Mono** / **Esqueleto**, estatura 1,45–7,80 m (**gigante** desde 2,6 m), complexión, barriga, músculo, **cuatro brazos**, **silla de ruedas turbo**, **traje de rabino** |
| Cara | Piel (incluye verde y azul), pelo (o ninguno), barba, **bigote**, **gafas de sol / de abuelo**, **cuernos de villano**, **cabezón** (cabeza hasta ×1,9) |
| Uniforme | Color de camiseta y detalles, número |
| Bate | Madera, **baguette gigante**, **la chancla**, cuerno, raqueta, mancuerna |
| Rasgo | Peak máximo, Preentreno, Mal genio, Centavo de la suerte, Maldición del petardo, Comida de casa (+20 % en su estadio) y estadio de casa |
| Stats | 42 puntos para todos entre visión, contacto, poder y velocidad |

- **Plantillas graciosas**: El Panadero (baguette, bigote y barriga), La Chancla (gafas de abuelo, nadie se le escapa), El Cabezón, El Monstruo (esqueleto con cuernos), El Gigantón (6,5 m y cuatro brazos), Mono Loco.
- **Aleatorio** con nombres absurdos («Pepe Jonrón», «Barriga de Oro», «Doña Chancla») usando solo piezas que ya tienes.
- **Pruébatelo gratis**: cualquier pieza bloqueada se puede ver puesta; solo se paga (en Fichas) para guardar.
- **Justo**: las Fichas compran estilo, rasgos y huecos, nunca puntos de stats.
- Los jugadores creados aparecen en Bateadores con su retrato SVG, se editan y se borran; hasta 6 huecos (1 gratis).

### 3.4 Fichas (moneda blanda)

| Se ganan | Fichas | Se gastan | Fichas |
|---|---|---|---|
| Regalo de bienvenida | 300 | Piezas de cara/bate | 100–300 |
| Volver cada día | 50 | Cuerpos (mono, esqueleto) | 400 |
| Jonrón / hit / barrel | 5 / 2 / 1 | Gigante | 600 |
| Estrella nueva / etapa nueva | 25 / 40 | Rasgos | 150–300 |
| Partido: jugado / ganado | 40 / 120 | Hueco extra de jugador | 500 |
| Carrera / base extra / walk-off | 8 / 10 / 50 | | |
| Desafío diario + racha (×7 máx.) | 100 + 20/día | | |

La práctica está topada a 30 Fichas por sesión para que el camino sea jugar, no repetir.

### 3.5 Desafío diario

Una etapa por día, igual para todos (semilla = fecha): estadio, lanzador, arsenal y uno de cuatro retos (lluvia de jonrones, contrarreloj, el batazo del día, racha caliente). Puntuación = HR × 100 + distancia + barrels × 15, multiplicada por las estrellas si se completa. Se guarda el mejor del día, racha de días y se comparte («JONRÓN Diario #5: 812 pts · 5 HR»).

### 3.6 Anuncios (ADR-009)

Ver §4. Implementado en `src/ads/` con proveedores **Google H5 Games Ads** (Ad Placement API), **Poki**, **CrazyGames**, uno de **prueba** (`?ads=dev`) y **ninguno** (por defecto en un despliegue propio sin ID de AdSense).

### 3.7 Otros

- Vibración háptica en contacto, jonrón, barrida y out en las bases (se apaga en Ajustes).
- 4 nuevos tests unitarios de dominio (carreras, partido, economía/creador/diario, anuncios: +48 casos) y 2 E2E (Partido y Estudio).

## 4. Monetización: plan completo

**Principio**: *nunca pay-to-win*. Nadie batea más lejos por pagar o ver anuncios en un modo competitivo.

### 4.1 Ahora (v0.2)

| Formato | Dónde | Recompensa | Tope |
|---|---|---|---|
| *Rewarded* | Resultados | ×2 Fichas del partido | 1 por pantalla de resultados |
| *Rewarded* | Al perder una etapa, el Diario o el Derby | 3 outs más (o 15 s) | 1 por partido; se pregunta antes |
| Intersticial | Al pulsar Reintentar / Siguiente | — | No en las 2 primeras partidas, no en los primeros 90 s, 3 min entre anuncios (cuenta también los *rewarded*), nunca en menús ni en mitad de un turno, nunca con «Quitar anuncios» |

- 20 *rewarded* al día como máximo. Audio en silencio durante el anuncio. `gameplayStart/Stop` para Poki/CrazyGames.
- El Desafío diario con «segunda oportunidad» puntúa igual que sin ella (v0.3: marcar la puntuación «asistida» para el ranking).

### 4.2 Dónde publicar y cómo cobra cada canal

| Canal | Cómo se gana | Qué hacer |
|---|---|---|
| **Poki** | Reparto de ingresos de sus anuncios; tráfico enorme de jugadores web | Postular el juego; build con `VITE_ADS=poki` o detección por dominio |
| **CrazyGames** | Reparto de ingresos + tráfico; SDK v3 | Igual; cumplir sus requisitos (sin anuncio en navegación) |
| **Web propia (Vercel)** | AdSense H5 Games Ads (requiere aprobación del sitio) | `VITE_ADSENSE_CLIENT=ca-pub-…` y `VITE_ADS=h5`; `VITE_ADS_TEST=on` para probar |
| GameDistribution / itch.io | Distribución extra | v0.4 |

### 4.3 Siguiente (v0.3–v1.0)

1. **Pack Fundador / Quitar anuncios** (pago único 2,99–4,99 US$): sin intersticiales, 1 000 Fichas, uniforme dorado. Web: Stripe Checkout + verificación en servidor; en Poki/CrazyGames, su sistema de compras si lo ofrecen.
2. **Pase de temporada cosmético** (gratis + premium) cada 6–8 semanas con un tema gracioso (*Temporada del Pollo*, *Temporada Ramiro*): recompensas solo cosméticas (bates, estelas, celebraciones, piezas del Estudio), progreso por jugar, nunca por pagar.
3. **Tienda rotativa diaria** de piezas del Estudio por Fichas (*FOMO* suave, sin dinero real).
4. **Patrocinios in-game** coherentes con el humor (vallas del estadio), más adelante y opcionales.
5. **No haremos**: cajas de botín, energía/vidas, comprar stats, anuncios que no se pueden cerrar.

### 4.4 Métricas para decidir

D1 / D7 / D30, sesiones por día, partidas por sesión, % que ve un *rewarded* (meta 25–40 % de DAU), *rewarded* por usuario y día (meta 1,5–3), ARPDAU, % de jugadores que crean un personaje (meta > 50 %), % que completa el Diario, abandono justo después de un intersticial (alarma si > 8 %). Herramienta: PostHog o Vercel Analytics (sin datos personales, con consentimiento).

## 5. Ideas graciosas (backlog con el humor del juego)

Ordenadas por impacto/esfuerzo:

1. **Celebraciones desbloqueables**: el *flex* de Ronnie, el *moonwalk* del esqueleto, Arturek saludando con los cuatro brazos, la chancla voladora en vez del *bat flip*.
2. **Ramiro como narrador invitado**: comentarios por mensaje de texto «iluvkiwiss está escribiendo…» durante los partidos.
3. **Eventos de campo aleatorios** en el Partido: un perro que se roba la bola, el pollo del lanzador de Chimon invade el campo, lluvia de Monster en el Iron Paradise.
4. **Química** à la Mario: El Mati + Chimon juntos en la alineación → «Gym Bros» (+velocidad); Chamo + el mandem → mal rollo (−contacto).
5. **Alineación de 3–9 bateadores** en el Partido, mezclando el roster y tus creados.
6. **Lanzador creado**: el Estudio para lanzadores (el pollo, el rabino, Vikokotor como plantillas).
7. **Más bates absurdos**: pez espada, desatascador, guitarra, pata de jamón, un remo.
8. **Estadios nuevos**: *La Azotea* (un techo de Caracas con antenas como cerca), *El Crucero* (en la cubierta del barco de Southampton), *La Luna* (gravedad baja: la física ya lo soporta cambiando `GRAVITY` y la densidad del aire).
9. **Modo «Robo de bases»** y *pick-off*: el lanzador mira a primera; botón para salir antes.
10. **Logros con títulos ridículos**: «Se le cayó el sombrero» (jonrón con Benjamin), «Lightweight» (doble con El Mati en silla), «Valentina, vuelve» (que te roben 10 jonrones).
11. **Modo 2 jugadores local** (mismo dispositivo): Derby por turnos.
12. **Ranking diario** con validación en servidor: el determinismo de `sim/` permite reproducir la partida con la semilla y las entradas.

## 6. Hoja de ruta

| Versión | Contenido | Criterio de salida |
|---|---|---|
| **v0.2 (este cambio)** | Carreras, Partido rápido, Estudio, Fichas, Diario, anuncios opcionales, háptica | Tests verdes, E2E de Partido y Estudio, juego sin errores en consola |
| v0.3 | Logros + celebraciones, robo de bases, alineación, tienda rotativa, analítica con consentimiento | D7 ≥ 15 % en la web propia |
| v0.4 | Publicación en Poki y CrazyGames, Pack Fundador (Stripe), localización PT-BR | Aprobado en 1 portal; ARPDAU medido |
| v0.5 | Ranking diario con validación, perfiles en la nube opcionales | 0 puntuaciones imposibles en el ranking |
| v1.0 | Temporada 1 (pase cosmético), 2 estadios nuevos, lanzadores creados, modo 2 jugadores | D30 ≥ 5 %; ingresos cubren hosting + tiempo de desarrollo |

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Los anuncios espantan jugadores | Políticas más estrictas que las de las plataformas (§4.1), medir abandono tras intersticial y bajar frecuencia si sube |
| AdSense no aprueba el sitio | Empezar por Poki/CrazyGames, que ya traen anunciantes |
| Rendimiento con 7 fildeadores + corredores en móviles de gama baja | Solo en el Partido; rigs ligeros; futura reducción a fildeadores activos en calidad baja |
| Humor sobre personas reales (Netanyahu, Ronnie Coleman) en portales con normas de contenido | Revisar las políticas de cada portal antes de publicar; tener una build «familiar» con esos personajes renombrados si hiciera falta |
| Inflación de Fichas | Precios en `config/economy.ts` y `config/creator.ts`, fáciles de ajustar; tope en práctica |
