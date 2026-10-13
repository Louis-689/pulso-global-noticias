# Cómo contribuir a Pulso Global

¡Gracias por ayudar! Este proyecto existe para quienes viven donde la información está bloqueada. Toda ayuda cuenta.

## Proponer un medio

La lista de confianza vive en `lib/trusted.ts` y la biblioteca de medios bloqueados en `lib/library.ts`.

Para añadir un medio, abre un *pull request* o un *issue* con:

1. El dominio del medio, por ejemplo `ejemplo.com`.
2. Un enlace a su **política editorial** o de **correcciones**.
3. Para la biblioteca: el país donde está bloqueado y una fuente pública que lo documente (OONI, RSF, una orden oficial…).

No se aceptan medios financiados y controlados por un Estado que funcionen como propaganda, ni sitios sin responsables editoriales identificables.

## Traducir

Los textos de la interfaz están en `lib/i18n.ts`, `lib/i18n-extra.ts` y `lib/i18n-trust.ts`. Copia el bloque en español, traduce cada frase y añade tu idioma a `LANGUAGES`.

## Código

```sh
npm install
npm run dev     # http://localhost:3000
npm run check   # debe pasar antes de enviar un cambio
```

- Mantén los cambios pequeños y con una prueba cuando corrijas un error.
- Piensa en conexiones lentas: nada de librerías pesadas sin necesidad.
- Nunca añadas rastreadores, analíticas ni nada que registre quién lee qué.

## Seguridad

Si encuentras un fallo que podría poner en riesgo a los lectores, no lo publiques en un *issue*: escribe directamente a [@Louis-689](https://github.com/Louis-689).

---

*English: propose outlets with a link to their editorial policy, translate the UI in `lib/i18n*.ts`, and run `npm run check` before sending a pull request. Never add trackers or analytics.*
