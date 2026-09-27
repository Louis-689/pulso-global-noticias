# Pulso Global

Proyecto creado y dirigido por **Luis Alejandro Cava Vassi ([Louis-689](https://github.com/Louis-689))**. Desarrollo realizado con asistencia de herramientas de IA.

Atlas geoespacial de noticias y señales públicas recientes. La interfaz combina un globo 3D, un lector multimedia, búsqueda por país/ciudad/pueblo, conexiones documentadas, fuentes contrastables y rankings explicables.

## Qué hace hoy

- Reúne titulares públicos de GDELT, 11 ediciones regionales de Google News, BBC y RT en Español.
- Separa noticias de señales tempranas públicas: USGS, GDACS, NASA y arXiv.
- Muestra imágenes o video únicamente cuando el feed de origen los entrega.
- Ubica en el mapa solo coordenadas publicadas o países mencionados explícitamente.
- Permite filtrar por tema, país, localidad, periodo, multimedia y ubicación.
- Ofrece Top 10 de impulso/presión por día o semana sobre la muestra realmente recuperada. Mes y año quedan reservados para una futura base histórica continua; no se simulan con una portada reciente.
- Admite guardado local, briefing por voz, avisos opt-in mientras la aplicación está activa y modo instalable PWA.
- Incluye cliente de escritorio aislado para Windows y flujos de compilación para macOS/Linux.

## Límites de producto

Pulso Global no afirma contener “todo Internet”, no accede a redes privadas u ocultas y no convierte una publicación en un hecho verificado. La presencia de un medio —incluidos medios estatales o restringidos en algunas jurisdicciones— representa la perspectiva atribuida de esa fuente. Los enlaces originales, estado del proveedor, hora, evidencia geográfica y notas de cobertura se muestran para facilitar el contraste.

Los avisos sísmicos informan eventos detectados por fuentes oficiales. No predicen terremotos. Los rankings son análisis léxicos exploratorios, no juicios de verdad, importancia o valor moral. La traducción automática de titulares todavía requiere integrar un proveedor de traducción con términos y credenciales adecuados; actualmente se conserva el idioma original de cada fuente.

## Desarrollo y verificación

Requiere Node.js 22.13 o posterior.

```sh
npm ci
npm run dev
npm run check
npm run build
```

`npm run check` ejecuta ESLint, TypeScript y las pruebas de datos, RSS, URL, geografía, solicitudes y persistencia local.

## Aplicación de escritorio

El cliente Electron abre la versión publicada con `contextIsolation`, sandbox, Node desactivado y enlaces externos fuera de la aplicación. Solo admite notificaciones originadas por Pulso Global; cámara, micrófono, ubicación y los demás permisos web permanecen denegados.

```sh
cd desktop
npm ci
npm run dist:win
```

Los tags `v*` activan `.github/workflows/desktop-release.yml`, que genera artefactos para Windows, macOS y Linux y los adjunta a una GitHub Release. El ejecutable Windows no está firmado con un certificado comercial; Windows puede mostrar SmartScreen hasta que exista firma y reputación.

## Publicación

La web usa Sites/Vinext y su configuración está en `.openai/hosting.json`. El acceso público o privado depende de la política configurada en el proyecto alojado.
