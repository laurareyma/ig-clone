# Guía para la defensa

En la defensa cada integrante responde preguntas al azar sobre cualquier módulo, con
contrapreguntas sobre patrones, hilos, memoria, concurrencia y manejo de errores. Esta
guía resume qué se hizo, dónde está y cómo justificarlo. Cada respuesta remite al código:
abrir el archivo y explicarlo con él delante es la mejor práctica.

Las decisiones con sus alternativas descartadas están en
[arquitectura.md](arquitectura.md).

## Mapa: requisito → implementación → prueba

| Requisito del enunciado | Dónde está | Cómo se prueba |
|---|---|---|
| Barra inferior persistente | `src/app/(tabs)/_layout.tsx` | `src/__tests__/navigation.test.tsx` |
| Crear posts con imagen | `create-post-screen.tsx`, `offline-first-post-repository.ts`, `expo-post-image-uploader.ts` | `offline-first-post-repository.test.ts` |
| Likes dinámicos | `PostCard`, `setLiked` del repositorio de posts | repositorio + `screens.test.tsx` |
| Comentarios anidados en tiempo real | `comment-threads.ts`, `comment-source.ts` (Realtime), `post-screen.tsx` | `comment-threads.test.ts`, `offline-first-comment-repository.test.ts` |
| Compartir enlaces o referencias | `share()` en `post-card.tsx`; enlaces dentro de mensajes en `chat-screen.tsx` | `screens.test.tsx` |
| Cuentas privadas y solicitudes | RLS en `supabase/migrations/`, `activity-screen.tsx`, `profile-source.ts` | `supabase/tests/rls.test.mjs`, `screens.test.tsx` |
| Caché de dos niveles con LRU | `src/data/image-cache/` | `lru-map.test.ts`, `two-level-image-cache.test.ts` |
| Cancelar descargas al salir del viewport | `cancel()` en `cached-image.tsx` y en el motor | `cached-image.test.tsx`, motor |
| 60 FPS en listas largas | FlashList, `reuseUnchanged`, `memo` | Manual: `docs/pruebas-en-dispositivo.md` |
| UI optimista (0 ms percibidos) | `Outbox.enqueue` | `outbox.test.ts`, repositorios |
| Cola de sincronización en SQLite | `src/data/sync/outbox.ts`, tabla `outbox` | `outbox.test.ts` |
| Orden cronológico estricto | `ORDER BY id`, un solo envío en vuelo | `outbox.test.ts` |
| Conflictos sin corromper la base remota | `classify-error.ts`, `discard`, `saveFromServer` | `classify-error.test.ts`, repositorios |
| Chat por WebSockets | `message-source.ts` (Realtime) | `offline-first-message-repository.test.ts` |
| Escribiendo, entregado, visto | `joinTyping`, `mark_delivered`/`mark_read`, `message-status.ts` | repositorio, `message-status.test.ts`, RLS |
| Bandeja ordenada por último mensaje | `get_inbox`, `readInbox` | repositorio |
| Pila de navegación por pestaña | `(home,explore,activity,profile)/_layout.tsx` | `navigation.test.tsx` |
| Deep link `instagramclone://post/{uuid}` | `+native-intent.tsx`, `incoming-link.ts`, `pending-link.ts` | `incoming-link.test.ts`, `pending-link.test.ts`, `stories.test.tsx` |
| Historias de 24 h | `get_stories`, `story-groups.ts` | `story-groups.test.ts`, repositorio, RLS |
| Barras de progreso y pausa | `story-viewer-screen.tsx` | Manual (en Jest las animaciones terminan al instante) |
| "Visto" de historias persistente | tabla `story_views` | `offline-first-story-repository.test.ts` |

## Hilos: qué corre dónde

Es la contrapregunta más probable en cualquier módulo.

| Hilo | Qué hace en esta app |
|---|---|
| **UI (principal)** | Dibuja las vistas nativas. Ejecuta los worklets de Reanimated (barra de las historias) y los gestos de Gesture Handler (pausar). |
| **JavaScript** | React, la lógica de repositorios y la cola de sincronización. Todo es asíncrono: lanza trabajo a otros hilos y espera promesas, nunca bloquea. |
| **Nativos de fondo** | Consultas de SQLite (`expo-sqlite` async), red (fetch, WebSocket de Realtime), descarga y escritura de archivos (`expo-file-system`), redimensionado y compresión (`expo-image-manipulator`), decodificación de imágenes. |

Frase para recordar: *"El hilo de JavaScript coordina; el trabajo pesado lo hacen hilos
nativos; las animaciones y los gestos que deben ir a 60 FPS se resuelven en el hilo de UI
sin pasar por JavaScript."*

Matiz honesto: la cola de sincronización "en segundo plano" significa asíncrona, no un
hilo propio, y solo mientras la app está abierta. Con la app cerrada las operaciones
esperan en SQLite.

## Preguntas probables por módulo

### Arquitectura

**¿Por qué capas y no llamar a Supabase desde la pantalla?**
Para que cada parte cambie por un solo motivo y se pueda probar sola. El dominio no
importa nada externo; la UI solo conoce interfaces. Mostrar `eslint.config.js` (la regla
que lo impide) y `src/di/container.ts` (único lugar donde se juntan).

**¿Qué es un repositorio aquí?**
Una interfaz del dominio (por ejemplo `PostRepository`) que oculta de dónde vienen los
datos. La implementación (`OfflineFirstPostRepository`) combina SQLite y Supabase. Las
pruebas usan otra implementación en memoria (`src/testing/fake-dependencies.ts`).

**¿Cómo se entera la pantalla de que cambió un dato?**
Patrón observador. `watchQuery` (`src/data/local/watch-query.ts`) lee SQLite y se
suscribe a `ChangeNotifier`; cada escritura avisa a su tabla y la consulta se repite.
Contrapregunta: *¿y si llegan dos lecturas desordenadas?* Se descarta la vieja con un
contador (`lastRead`).

**¿Cómo se evitan fugas al desmontar una pantalla?**
Todo `watch`, `subscribe`, `connect` y `joinTyping` devuelve una función para darse de
baja, que el `useEffect` devuelve como limpieza. Las respuestas que llegan tarde se
ignoran comprobando la clave o un flag `active`.

### Módulo 1: feed y privacidad

**¿Cómo funciona la paginación?**
Por cursor: se pide lo anterior a `(created_at, id)` de la última publicación guardada.
Explicar por qué no `OFFSET`. Ver `get_posts` en la migración `feed_queries` y
`loadMoreFeed`.

**¿Dónde se decide que no puedo ver una cuenta privada?**
En el servidor, con RLS: `can_view_profile_content` en la migración inicial. La app solo
elige el mensaje (`canViewContent` en `profile-visibility.ts`). Aunque alguien llame a la
API a mano con un id, no recibe nada; lo prueba `rls.test.mjs`.

**¿Qué impide aceptarse a uno mismo una solicitud?**
La política `follows_accept`: solo el dueño de la cuenta seguida puede pasar de
`pending` a `accepted`. Y el cliente no puede enviar el estado inicial: lo pone un
trigger (`set_follow_status`) y no tiene permiso sobre esa columna.

**¿Cómo se actualizan los comentarios en tiempo real?**
Canal de Realtime con `postgres_changes` filtrado por post (`comment-source.ts`). Cada
evento se guarda en SQLite; la lista se actualiza sola. El eco de un comentario propio
no se duplica porque el id ya existe (`INSERT OR IGNORE`).

**¿Por qué los contadores los lleva un trigger?**
Para que sean consistentes aunque escriban muchos usuarios a la vez: el cliente no puede
tocarlos (permiso por columna) y el trigger se ejecuta en la misma transacción que el
like.

### Módulo 2: caché e imágenes

**Explica los dos niveles.**
Memoria: `LruMap`, clave → URI local, síncrono. Disco: archivos más índice en SQLite con
tamaño y último uso, límite de 200 MB. Flujo de `load()`: memoria → disco → red. Ver
`two-level-image-cache.ts`.

**¿Cómo funciona el LRU?**
`Map` de JavaScript mantiene el orden de inserción; cada uso borra y reinserta la clave,
así la primera es la menos usada. O(1). En disco, `ORDER BY last_accessed`.
Contrapregunta: *¿y si una imagen se ve mucho pero siempre desde memoria?* Se anotan los
usos en `pendingTouches` y se escriben antes de desalojar; sin eso el disco borraría las
más vistas.

**¿Qué pasa cuando una celda sale de pantalla?**
`CachedImage` llama a `cancel()` en la limpieza del efecto. Si nadie más espera esa
imagen, se aborta la descarga con `AbortController` y no queda archivo a medias.

**¿Qué guarda la memoria, bitmaps?**
No: rutas. Los bitmaps los decodifica y cachea el componente `Image` nativo, fuera del
alcance de JavaScript. Decirlo así es mejor que afirmar lo contrario.

**¿Cómo se consiguen los 60 FPS?**
- FlashList recicla las vistas;
- las tarjetas no cambiadas no se vuelven a renderizar (`reuseUnchanged` + `memo`);
- el alto de cada imagen se reserva con su aspect ratio;
- las imágenes se suben ya reducidas a 1080 px;
- la decodificación y la descarga ocurren fuera del hilo de JavaScript.

Mencionar que se mide en build de release (`docs/pruebas-en-dispositivo.md`).

### Módulo 3: offline

**Recorre lo que pasa al dar like sin conexión.**
`setLiked` → `outbox.enqueue` → en una transacción: `UPDATE posts` (efecto local) +
`INSERT INTO outbox`. Se avisa a la UI (ya se ve el like). `process()` no envía nada
porque `isOnline()` es falso. Al volver la red, NetInfo dispara `resume()`, que envía la
operación más antigua, la borra y sigue.

**¿Por qué en la misma transacción?**
Atomicidad: si la app se cierra a mitad, o quedan las dos cosas o ninguna. Nunca un like
visible sin operación pendiente, ni al revés.

**¿Cómo garantizas el orden?**
Siempre se toma `ORDER BY id LIMIT 1` y nunca hay dos envíos en vuelo (`draining`). Si
una falla por red, la cola se detiene ahí en vez de saltársela.

**¿Qué pasa si la respuesta del servidor se pierde y se reenvía?**
Idempotencia: el like es `upsert` con clave primaria `(post_id, user_id)`; comentarios y
mensajes llevan id generado en el cliente y el duplicado se ignora.

**¿Cómo resuelves conflictos?**
- *Post borrado o sin permiso:* error permanente (clase SQLSTATE 23 o 42) → se descarta y
  la copia local se corrige con lo que diga el servidor.
- *Refrescar con acciones pendientes:* los datos del servidor aún no las incluyen;
  `saveFromServer` las vuelve a aplicar encima.
- *Dar y quitar like sin red:* llegan en orden; gana el último.

El servidor siempre tiene la última palabra y sus restricciones impiden datos inválidos.

**¿Y si el servidor está caído una hora?**
Fallo de red: reintentos sin límite, con espera exponencial de 1 s a 60 s. Fallo del
servidor que sí responde: hasta 8 intentos y se descarta, para no bloquear la cola.

### Módulo 4: mensajes

**¿Cómo llega un mensaje en tiempo real?**
WebSocket de Supabase Realtime, canal `inbox` con `postgres_changes` sobre `messages`
(`message-source.ts`). No se filtra en el cliente: la RLS hace que el servidor solo
envíe mensajes de conversaciones propias.

**¿Cómo sabes que está "Visto"?**
Marcas de agua: comparar la hora del mensaje con `other_last_read_at` del otro
(`message-status.ts`). Las marcas las pone el servidor con `mark_read()`; el cliente no
puede escribirlas.

**¿Por qué "Escribiendo…" no va a la base de datos?**
Es efímero y frecuente: guardarlo sería una escritura por tecla. Va por Broadcast, con
límite de un aviso cada 2 s y caducidad de 4 s. El canal es privado (políticas sobre
`realtime.messages` en la migración `direct_messages`).

**¿Cómo se reordena la bandeja?**
El trigger `touch_conversation` actualiza `last_message_at`; en local, cada mensaje nuevo
hace lo mismo (`bumpConversation`) y la consulta ordena por ese campo.

### Módulo 5: navegación e historias

**¿Cómo mantiene cada pestaña su propia pila?**
El grupo `(home,explore,activity,profile)` tiene un `_layout` con un `Stack` que Expo
Router instancia una vez por pestaña.

**¿Cómo funciona el deep link?**
`+native-intent.tsx` recibe la URL antes que el enrutador, la reescribe a la pestaña
Inicio (`incoming-link.ts`) y, si no hay sesión, la guarda (`pending-link.ts`) para
abrirla tras el login. El layout raíz no monta el navegador hasta saber si hay sesión,
así un enlace con la app cerrada no rebota contra la guardia.

**¿Cómo se pausa una historia?**
Gesto `LongPress` de Gesture Handler; su callback corre en el hilo de UI y llama a
`cancelAnimation` sobre el valor compartido. Al soltar, `withTiming` con el tiempo que
faltaba. Al terminar, `scheduleOnRN` pasa al hilo de JavaScript para cambiar de
historia.

**¿Por qué animar `scaleX` y no el ancho?**
Cambiar el ancho obliga a recalcular el layout en cada fotograma; una transformación no.

**¿Dónde se guarda que vi una historia?**
Solo en SQLite, tabla `story_views`, separada de `stories` para que sobreviva a cada
refresco.

## Límites conocidos (mejor decirlos antes de que pregunten)

- Con la app cerrada no se sincroniza nada; requeriría `expo-background-task`.
- Solo likes, comentarios y mensajes van por la cola; publicar, seguir y cambiar la
  privacidad necesitan conexión.
- Cerrar sesión sin conexión descarta las acciones pendientes (para no enviarlas con
  otra cuenta).
- No hay subida de avatar, edición de perfil, borrado de posts ni notificaciones de
  likes.
- Las animaciones, los gestos y el rendimiento solo se verifican en dispositivo.

## Cómo repartirse el estudio

Como las preguntas son al azar, cada integrante debería poder recorrer al menos estos
cinco flujos con el código abierto:

1. Un like sin conexión, desde el toque hasta el servidor.
2. Una imagen del feed, desde que la celda aparece hasta que se pinta y se cancela.
3. Seguir una cuenta privada y que el dueño acepte.
4. Un mensaje enviado, entregado y visto.
5. Un deep link con la app cerrada y sin sesión.
