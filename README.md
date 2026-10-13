# Pulso Global · El mundo, sin censura

Proyecto creado y dirigido por **Luis Alejandro Cava Vassi ([Louis-689](https://github.com/Louis-689))**.

Centro global de noticias en tiempo real. Reúne titulares de todo el planeta, incluye medios que algunos gobiernos bloquean y ofrece rutas alternativas para leerlos, en la línea de la *Uncensored Library* de Minecraft.

## Qué hace

- **Solo fuentes confiables**: cada titular pasa por una lista de unos 250 medios con estándares editoriales y política de correcciones (`lib/trusted.ts`): agencias, emisoras públicas independientes, diarios de referencia, periodismo de investigación y en el exilio, verificadores de datos y organismos científicos. La propaganda estatal (RT, Sputnik, CGTN, Xinhua, TASS, PressTV, Telesur) queda fuera. Los titulares de Google News y GDELT se filtran según el medio real que los publicó, y el panel de fuentes dice cuántos se descartaron.
- **«Confirmada por N medios»**: si otros medios de la lista publican la misma historia, la tarjeta lo muestra (✅ 3) y el lector nombra a cada medio. El botón «Solo confirmadas» deja solo esas. Las que nadie más publicó aún llevan un aviso para compararlas antes de compartir.
- **Noticias en vivo**: ediciones regionales de Google News, GDELT, BBC, Al Jazeera, NPR, The Guardian, Noticias ONU, France 24, DW y canales temáticos. Se actualiza cada 60 s y marca lo nuevo.
- **Biblioteca libre**: 14 medios reportados como bloqueados en al menos un país (Meduza, The Moscow Times, BBC en ruso, persa y chino, DW, NYT, The Guardian, Efecto Cocuyo, El Pitazo, 14ymedio, Al Jazeera, Daily NK, IranWire, Confidencial y Global Voices). Al pasar el cursor sobre un medio, el globo ilumina dónde está bloqueado. La lista vive en `lib/library.ts`.
- **Rutas de acceso** en cada noticia: fuente original, copia en Archive.org, copia en archive.today y el proxy de traducción de Google (`*.translate.goog`), útil cuando el dominio original está bloqueado.
- **Señales**: sismos USGS, alertas GDACS, NASA e investigación en IA (arXiv).
- **11 idiomas** de interfaz (es, en, pt, fr, de, it, ru, ar con RTL, zh, ja, hi). El idioma elegido también prioriza la edición de noticias en ese idioma, el idioma del proxy de traducción y la voz del lector de titulares. Los nombres de países salen del navegador (`Intl.DisplayNames`).
- **Globo interactivo** en canvas (d3-geo): se arrastra, se toca un país para filtrar y vuela a la noticia que abres. Pulsos animados por país y arcos entre países mencionados juntos.
- **Animaciones GSAP**: entrada del titular con SplitText, tarjetas que aparecen al hacer scroll (ScrollTrigger), ticker de última hora infinito, contadores, pestañas con píldora deslizante y lector lateral animado. Respeta `prefers-reduced-motion`.
- **Siempre con imagen o video**: si el feed no trae foto, el servidor lee la cabecera de la página original y toma su imagen o video oficial (Open Graph). Si la página no declara ninguno, la tarjeta muestra un póster ilustrado con el ícono del tema. Sección **TV en vivo** con 11 canales internacionales (France 24, DW, Al Jazeera, euronews, NHK, CNN Brasil…), ordenados por tu idioma, y video en el lector de cada noticia.
- **Didáctica y divertida**: guía «¿Cómo funciona?» en 3 pasos, lista «Lee con ojo crítico» en cada noticia, «Otras miradas» con la misma historia contada por otros medios, botón 🎲 **Noticia sorpresa** que gira el globo, colores por tema y animaciones de celebración al guardar.
- **Pensado para países cerrados**:
  - **Leer aquí**: el servidor trae el texto del artículo (solo de medios de la lista) y lo muestra dentro de Pulso Global. Quien vive donde el medio está bloqueado solo necesita llegar a tu sitio.
  - **Imágenes por el espejo** (`/api/img`): las fotos pasan por tu servidor, porque los CDN de los medios suelen estar bloqueados también. Solo sirve imágenes de medios de la lista o vistas en los resultados, comprueba que el destino no sea una red interna y limita las peticiones por dirección.
  - **Modo ligero** 🪶: sin imágenes, videos ni animaciones, para conexiones lentas, caras o vigiladas.
  - **Sin conexión**: el service worker guarda las últimas noticias y la app abre aunque se caiga Internet.
  - **Descargar noticias**: un único archivo HTML, sin scripts ni imágenes, para pasar de mano en mano por USB o Bluetooth.
  - **Acceso seguro**: guía con Tor Browser (y GetTor por correo), Psiphon, Snowflake y consejos de seguridad.
  - Las fuentes tipográficas van dentro de la app: ninguna petición a Google.
- **Página compacta**: todo cabe en inicio, filtros y titulares. La TV en vivo y el Acceso seguro se abren como paneles; en el móvil las noticias se ven como lista con miniatura.
- Guardado local, lectura en voz alta, instalable como app (PWA), accesible con teclado (los paneles atrapan el foco y se cierran con Esc).

## Desarrollo

Requiere Node.js 20.9 o posterior.

```sh
npm install
npm run dev      # http://localhost:3000
npm run check    # TypeScript + 33 pruebas
npm run build && npm start
```

## Publicarlo gratis

La forma más simple es Vercel: sube la carpeta a un repositorio de GitHub, entra a vercel.com, «Add New Project», elige el repositorio y pulsa Deploy. No necesita variables de entorno. También funciona en cualquier servidor con Node (`npm run build && npm start`).

## Espejos y servicio onion

Un solo dominio es fácil de bloquear. Cuantas más copias haya, más difícil es censurarlo:

1. **Espejos**: publica el mismo repositorio en varios proveedores (Vercel, Netlify con Node, Render, Fly.io, un VPS). Cada espejo es independiente y no necesita configuración.
2. **Servicio onion de Tor**: en un VPS con `npm run build && npm start` (puerto 3000), instala Tor y añade a `/etc/tor/torrc`:
   ```
   HiddenServiceDir /var/lib/tor/pulso/
   HiddenServicePort 80 127.0.0.1:3000
   ```
   Reinicia Tor y tu dirección `.onion` estará en `/var/lib/tor/pulso/hostname`. Se abre con Tor Browser incluso donde Tor está filtrado (usando puentes Snowflake).
3. Comparte las direcciones por canales difíciles de cortar (correo, mensajería cifrada) y nunca pidas datos personales a quien lo usa.

## Estructura

```
app/            página, layout, estilos y APIs /api/pulse, /api/read, /api/img
components/     interfaz: pulso-app, globe, story-card, reader, ticker
lib/            datos: pulse-service (fuentes), pulse-data (lectura RSS/Atom),
                trusted (lista de confianza), verify (confirmación entre medios),
                extract y safe-fetch (espejo de lectura), offline (archivo para compartir),
                library (medios bloqueados y rutas de acceso), i18n, saved
tests/          pruebas con node:test
```

## Límites honestos

Ninguna app puede garantizar que una noticia sea verdad. Lo que Pulso Global garantiza es de dónde viene: solo medios con estándares editoriales, cada titular enlaza su fuente y se indica cuántos otros medios la confirman. La confirmación se calcula comparando palabras y países de los titulares, así que puede fallar entre idiomas distintos. La lista de confianza es editable: cualquiera puede proponer cambios en `lib/trusted.ts` con un enlace a la política editorial del medio. Los bloqueos cambian con el tiempo; la lista de la biblioteca se basa en reportes públicos (OONI, RSF, VE sin Filtro). Usar herramientas para saltar la censura puede ser peligroso en algunos países: la sección «Acceso seguro» da consejos, pero cada persona conoce mejor sus riesgos.
