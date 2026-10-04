# Pruebas en dispositivo

Las pruebas automáticas (`npm run check`) cubren la lógica, la base local, las reglas del
servidor y las pantallas con datos simulados. Lo que sigue solo se puede comprobar en un
teléfono o emulador: la red real, el tiempo real entre dos dispositivos, las animaciones,
los gestos, los deep links del sistema y el rendimiento.

Marca cada casilla al probarla y anota lo que no salga como se espera.

## Preparación

1. **Supabase**
   - Authentication → Sign In / Providers → Email: desactivar "Confirm email" para poder
     crear cuentas de prueba sin confirmar el correo.
   - Realtime → Settings: desactivar "Allow public access", para que el canal de
     "Escribiendo…" solo acepte a los participantes.
2. **Development build.** Expo Go sirve para casi todo, pero el esquema
   `instagramclone://` solo existe en un build propio:
   ```bash
   npx expo run:android      # o npx expo run:ios
   ```
3. **Dos cuentas** (A y B) en dos dispositivos o emuladores, para mensajes y privacidad.
4. **Datos para listas largas**, en la cuenta que vaya a mirar el feed:
   ```bash
   SEED_EMAIL=a@correo SEED_PASSWORD=... SEED_COUNT=150 npm run seed
   SEED_EMAIL=a@correo SEED_PASSWORD=... npm run seed -- --clean   # para borrarlas después
   ```

## Sesión y navegación

- [ ] Registrarse con un usuario nuevo; un usuario ya existente muestra "Ese nombre de
      usuario ya está en uso".
- [ ] Cerrar la app y volver a abrirla: entra directo, sin ver el login.
- [ ] Cada pestaña conserva su pila: abrir un post en Explorar, cambiar a Inicio y volver;
      Explorar sigue en el post.
- [ ] Cerrar sesión desde Perfil vuelve al login, y al entrar con otra cuenta no queda
      nada de la anterior (feed, mensajes, historias).

## Módulo 1: feed, publicaciones y privacidad

- [ ] Publicar una foto de la galería; aparece al principio de Inicio y en el perfil.
- [ ] Like y quitar like; el contador cambia al instante.
- [ ] Comentar y responder a un comentario; la respuesta aparece con sangría.
- [ ] Con el post abierto en A, B comenta: el comentario aparece en A sin refrescar.
- [ ] Compartir un post abre el menú del sistema con un enlace `instagramclone://post/…`.
- [ ] B pone su cuenta como privada. A busca a B en Explorar: ve los contadores pero no
      las fotos ni las listas de seguidores, y el botón dice "Seguir".
- [ ] A pulsa Seguir: pasa a "Solicitado". B ve la solicitud en Actividad.
- [ ] B rechaza: A vuelve a ver "Seguir". A lo intenta otra vez y B acepta: A ve las fotos.

## Módulo 2: caché de imágenes y rendimiento

- [ ] Con 150 publicaciones, hacer scroll rápido hasta el final y volver arriba: las
      imágenes ya vistas aparecen sin hueco gris.
- [ ] Cerrar la app, activar el modo avión y abrirla: el feed se ve con sus imágenes
      (nivel de disco).
- [ ] Medir FPS y memoria (ver abajo).

### Cómo medir los 60 FPS

Siempre en un **build de release**: en desarrollo el JavaScript corre sin optimizar y los
números no sirven.

```bash
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

- **Android:** Opciones de desarrollador → "Renderizado de GPU del perfil" → "En pantalla
  como barras". Hacer scroll durante 20 s: las barras deben quedar casi siempre bajo la
  línea verde (16 ms). Para números:
  ```bash
  adb shell dumpsys gfxinfo <paquete> reset
  # hacer scroll 20 s
  adb shell dumpsys gfxinfo <paquete>     # "Janky frames" y percentiles
  ```
- **iOS:** Xcode → Open Developer Tool → Instruments → plantilla "Animation Hitches",
  grabar mientras se hace scroll.

El nombre del paquete (`<paquete>`) lo genera Expo al crear el build; se puede fijar en
`app.json` con `android.package` e `ios.bundleIdentifier`.

### Cómo medir la memoria

- **Android:** `adb shell dumpsys meminfo <paquete>` antes y después de recorrer las 150
  publicaciones dos veces. La memoria debe estabilizarse, no crecer en cada pasada.
- **iOS:** Xcode → Debug Navigator → Memory mientras se hace scroll; o Instruments →
  "Allocations".

### Resultados

| Prueba | Android | iOS |
|---|---|---|
| Fotogramas lentos al hacer scroll (%) | | |
| Memoria tras abrir la app (MB) | | |
| Memoria tras 2 pasadas por 150 posts (MB) | | |
| Imágenes vistas sin hueco gris al volver | | |

## Módulo 3: UI optimista y cola offline

- [ ] Activar el modo avión. Dar like a tres posts y comentar en uno: todo aparece al
      instante; el aviso dice "Sin conexión. 4 acciones se enviarán al reconectar" y el
      comentario muestra "Enviando…".
- [ ] Cerrar la app del todo con las acciones pendientes y volver a abrirla (aún en modo
      avión): siguen ahí.
- [ ] Quitar el modo avión: el aviso pasa a "Enviando…" y desaparece. Desde otro
      dispositivo, los likes y el comentario están en el servidor, en el orden en que se
      hicieron.
- [ ] En modo avión, dar y quitar like al mismo post varias veces; al reconectar el
      estado final coincide con el último toque.
- [ ] Conflicto: en modo avión, A comenta un post de B. B borra ese post (desde el panel
      de Supabase). A reconecta: el comentario desaparece de A sin errores ni bloqueos, y
      las acciones siguientes se envían igual.

## Módulo 4: mensajes directos

- [ ] A abre el perfil de B y pulsa Mensaje; escribe. B ve "Escribiendo…" y desaparece al
      dejar de escribir o a los pocos segundos.
- [ ] A envía: en A aparece "Enviado"; cuando B tiene la app abierta pasa a
      "Entregado"; cuando B abre el chat, a "Visto".
- [ ] Con varias conversaciones, un mensaje nuevo sube la suya al principio de la bandeja
      y el contador de no leídos de Inicio sube.
- [ ] A en modo avión envía dos mensajes ("Enviando…"); al reconectar llegan a B en orden.

## Módulo 5: navegación, deep links e historias

Deep link (development build):

```bash
npx uri-scheme open "instagramclone://post/<uuid>" --android   # o --ios
```

- [ ] Con la app cerrada y sesión iniciada: abre el post en la pestaña Inicio, con
      "atrás" llevando al feed.
- [ ] Con la app en segundo plano: igual.
- [ ] Sin sesión: muestra el login; al entrar, abre el post.
- [ ] Con un id que no existe o de una cuenta privada que no sigues: "Esta publicación no
      está disponible".

Historias:

- [ ] Añadir una historia desde la fila de historias.
- [ ] Abrir una historia: la barra avanza 5 s y pasa sola a la siguiente; tras la última,
      el visor se cierra.
- [ ] Mantener el dedo pulsado pausa la barra; al soltar sigue desde donde estaba.
- [ ] Tocar el tercio derecho pasa a la siguiente; el izquierdo, a la anterior.
- [ ] Al volver al feed, el círculo de ese autor pasa a gris. Cerrar y abrir la app: sigue
      gris.
