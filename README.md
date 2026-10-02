# Instagram Clone — Parcial Desarrollo Móvil

React Native (Expo SDK 57, Expo Router) + Supabase.

## Arrancar

```bash
npm install
cp .env.example .env.local   # pegar URL y publishable key del proyecto de Supabase
npx expo start
```

Si falta alguna variable de `.env.local`, la app falla al arrancar indicando cuál.

## Comprobaciones

```bash
npm run lint        # ESLint
npm run typecheck   # regenera los tipos de rutas y corre TypeScript
npm test            # pruebas unitarias (Jest); van junto al código como *.test.ts, fuera de src/app
npm run test:rls    # reglas de privacidad
npm run check       # las cuatro anteriores, lo mismo que corre el CI
```

`.github/workflows/ci.yml` ejecuta estas comprobaciones en cada pull request y en `main`.

## Base de datos

El esquema y las reglas de privacidad (RLS) están en `supabase/migrations/`.

```bash
supabase login
supabase link --project-ref <ref-del-proyecto>
supabase db push          # aplica las migraciones al proyecto remoto
npm run test:rls          # prueba las reglas en un Postgres embebido, sin Docker
npm run gen:types         # regenera src/data/remote/database.types.ts desde el esquema
```

Tras cada migración nueva: `supabase db push` y `npm run gen:types`.

## Estructura

```
src/
  app/            Rutas (Expo Router). Solo layouts y re-exportaciones de pantallas.
  presentation/   Pantallas, componentes, hooks, sesión y tema.
  domain/         Entidades, contratos de repositorios, casos de uso y errores.
                  No importa React, Supabase ni ninguna otra capa.
  data/
    local/        SQLite: apertura, migraciones versionadas y aviso de cambios.
    image-cache/  Caché de imágenes de dos niveles (memoria + disco) con LRU.
    remote/       Cliente de Supabase, tipos generados y fuentes remotas.
    media/        Reducción, compresión y subida de imágenes.
    mappers/      Conversión fila (snake_case) ↔ entidad (camelCase).
    repositories/ Implementaciones de los contratos de domain/.
  di/             Raíz de composición: crea las implementaciones y las entrega a la UI.
  testing/        Utilidades de prueba (SQLite en memoria, repositorios falsos).
supabase/
  migrations/     Esquema SQL + RLS.
  tests/          Pruebas de las reglas de privacidad.
```

Las dependencias van hacia adentro: `app → presentation → domain ← data`. ESLint lo
hace cumplir (`eslint.config.js`): importar `data/` o Supabase desde la UI, o cualquier
cosa externa desde `domain/`, es un error de lint.

### Flujo de datos

SQLite es la única fuente de verdad de la UI:

1. La pantalla se suscribe con `repositorio.watch(...)` y recibe de inmediato lo que
   haya en el dispositivo, sin esperar a la red.
2. `repositorio.refresh(...)` trae los datos de Supabase y los escribe en SQLite.
3. `ChangeNotifier` avisa de que la tabla cambió y la suscripción vuelve a leer.

Sin conexión, el paso 2 falla y la pantalla se queda con lo guardado. El perfil propio
(`use-profile.ts`) es el primer ejemplo; los demás módulos siguen el mismo patrón.

El esquema local cambia solo añadiendo migraciones al final de
`src/data/local/migrations.ts`; la versión aplicada se guarda en `PRAGMA user_version`.

### Sesión

- `SessionProvider` expone la sesión que emite `AuthRepository.onSessionChange`.
- El layout raíz mantiene la pantalla de carga hasta conocerla y protege las rutas con
  `Stack.Protected`: sin sesión solo existe `(auth)`; con sesión, todo lo demás. Entrar y
  salir no navega a mano: cambia la sesión y el layout muestra lo que corresponde.
- Al quedarse sin sesión se vacían las tablas locales (`src/di/container.ts`).

### Caché de imágenes

Motor propio en `data/image-cache/`; la UI lo usa a través de `<CachedImage>`. No se usa
`expo-image` ni la carga por URL de `<Image>`: al componente nativo solo se le entregan
archivos locales que la caché controla.

| Nivel | Qué guarda | Límite | Desalojo |
|---|---|---|---|
| 1. Memoria (`LruMap`) | clave → URI del archivo local | 300 entradas | LRU |
| 2. Disco (`DiskIndex` + archivos) | el archivo, más tamaño y último uso en SQLite | 200 MB | LRU |

- **Clave:** `bucket/ruta` en Storage. La URL de descarga de un bucket privado cambia,
  la ruta no.
- **Flujo de `load()`:** memoria → índice de disco → red. Lo descargado se guarda en
  ambos niveles y después se comprueba el límite de disco.
- **Descargas compartidas:** dos celdas que piden la misma imagen esperan una sola
  descarga (`inFlight`).
- **Cancelación:** cada `load()` devuelve `cancel()`. `<CachedImage>` lo llama al
  desmontarse o reciclarse; cuando nadie más espera la imagen se aborta la descarga con
  un `AbortSignal`, sin dejar archivo ni fila en el índice.
- **Usos en memoria:** un acierto en el nivel 1 no toca el disco, así que se anotan en
  `pendingTouches` y se escriben juntos antes de cada desalojo. Sin eso, el LRU de disco
  borraría justo las imágenes más vistas.
- **Hilos:** la descarga y la escritura del archivo ocurren en hilos nativos
  (`expo-file-system`); el hilo de JS solo coordina promesas. El nivel de memoria guarda
  rutas, no bitmaps: la decodificación y su memoria las gestiona el `<Image>` nativo.
- **Privacidad:** al cerrar sesión se vacían los dos niveles.

### Feed y publicaciones

- **Una sola consulta para todas las listas.** La función SQL `get_posts` sirve Inicio
  (`only_following`), Explorar, la cuadrícula de un perfil (`by_author`) y una publicación
  suelta (`by_id`). Devuelve el autor y `liked_by_me` en la misma fila, así no hay una
  consulta extra por publicación. Es `security invoker`: la visibilidad la decide la RLS.
- **Paginación por cursor.** Se pide "lo anterior a `(created_at, id)` de la última
  publicación guardada". Con `OFFSET`, una publicación nueva desplazaría las páginas y se
  repetirían filas; con cursor no. El `id` desempata fechas iguales.
- **En local** (`data/local/post-store.ts`): `posts` guarda cada publicación una vez y
  `feed_entries` dice a qué listas pertenece. Refrescar reemplaza la lista en una
  transacción; cargar más añade.
- **Like y comentario** se escriben en SQLite y pasan por la cola de sincronización
  (ver más abajo): la UI los muestra al instante, con o sin conexión.
- **Comentarios en tiempo real:** `useComments` abre un canal de Supabase Realtime
  mientras la pantalla está abierta; cada evento se escribe en SQLite y la lista se
  actualiza sola. El eco de un comentario propio se ignora porque el id ya existe.
- **Hilos:** `domain/comment-threads.ts` agrupa los comentarios en hilos de un nivel.
- **Crear publicación:** la imagen se reduce a 1080 px de ancho y se comprime en un
  módulo nativo antes de subirla a `media/{user_id}/`. Si falla guardar la fila, se borra
  la imagen subida.
- **Rendimiento:** las listas usan FlashList, que recicla las celdas. `use-feed.ts`
  conserva el mismo objeto de cada publicación que no cambió, así un like vuelve a
  renderizar solo esa tarjeta.

### Privacidad

Toda la privacidad se decide en el servidor (RLS en `supabase/migrations/`); la app solo
elige qué mensaje mostrar.

1. Seguir una cuenta privada crea un `follow` con estado `pending`; el estado lo fija un
   trigger y el cliente no tiene permiso para enviarlo.
2. El dueño ve la solicitud en la pestaña Actividad: aceptar la pasa a `accepted`;
   rechazar borra la fila.
3. Hasta que se acepta, `get_posts`, las listas de seguidores y la descarga de imágenes
   devuelven vacío o error para ese usuario, aunque conozca los ids.

### Escrituras en SQLite

Todas las escrituras y transacciones pasan por una cola (`serializeWrites` en
`data/local/sql-database.ts`) y se ejecutan de una en una; las lecturas no esperan. En
`expo-sqlite` todas las llamadas comparten una conexión, y sin la cola una escritura
lanzada mientras otra parte de la app tiene una transacción abierta quedaría dentro de
ella.

### UI optimista y cola de sincronización

Dar like y comentar no esperan a la red. `data/sync/outbox.ts` implementa el patrón
*outbox*:

1. **Encolar.** En una sola transacción de SQLite se aplica el cambio local (el like, el
   comentario) y se inserta la operación en la tabla `outbox`. O quedan las dos cosas o
   ninguna, aunque la app se cierre en ese instante. La UI ya muestra el resultado.
2. **Enviar.** Un único procesador toma siempre la operación más antigua (`ORDER BY id`),
   la envía y, si sale bien, la borra. Nunca hay dos en vuelo, así que el servidor las
   recibe en el orden en que se hicieron.
3. **Disparadores.** Al encolar, al arrancar la app, al recuperar la conexión (NetInfo)
   y al volver a primer plano. Sin conexión no se intenta nada.

Qué pasa cuando un envío falla (`classify-error.ts`):

| Tipo | Ejemplo | Qué hace la cola |
|---|---|---|
| Red | sin conexión, sin respuesta | Reintenta sin límite. No se pierde nada por estar mucho tiempo sin red. |
| Servidor | saturado, tiempo agotado, token caducado | Reintenta; tras 8 intentos descarta la operación. |
| Permanente | el post se borró, la RLS ya no lo permite | Descarta la operación y deja la copia local como el servidor. |

- **Reintentos con espera exponencial** (1 s, 2 s, 4 s… hasta 60 s). La cola se detiene
  en la operación que falló en vez de saltársela: adelantar un "quitar like" a su "like"
  cambiaría el resultado.
- **Idempotencia.** Si la respuesta se pierde, la operación se reenvía. Un like repetido
  no cuenta doble (clave primaria `post_id + user_id`) y un comentario repetido se
  ignora porque su id lo generó el cliente.
- **Conflictos.** Al refrescar, los datos del servidor aún no incluyen lo que sigue en la
  cola. `saveFromServer` vuelve a aplicar encima los likes y comentarios pendientes, y
  `replaceComments` no borra los comentarios en cola. Si el servidor rechaza una
  operación, gana el servidor: se descarta y la copia local se corrige. La base remota
  nunca recibe datos inválidos, porque las restricciones y la RLS se aplican allí.
- **Hilos.** La cola corre en el hilo de JavaScript, pero todo lo que hace es asíncrono:
  SQLite y la red trabajan en hilos nativos, así que no bloquea la interfaz.
- **Límite conocido.** Las operaciones se envían mientras la app está abierta o al
  volver a abrirla. Con la app cerrada no se ejecuta nada; quedan guardadas en SQLite.
- **Cerrar sesión** vacía la cola: las acciones pendientes no se envían con otra cuenta.
- Pasan por la cola los likes, los comentarios y los mensajes directos. Publicar,
  seguir y cambiar la privacidad necesitan conexión.

### Mensajes directos

- **Mensajes nuevos:** `MessagingConnection` mantiene un canal de Supabase Realtime
  (WebSocket) abierto mientras hay sesión. Escucha los `INSERT` de `messages`; no hace
  falta filtrar, porque la RLS solo envía filas de conversaciones del usuario. Cada
  evento se escribe en SQLite y las pantallas se actualizan desde ahí.
- **Bandeja:** `get_inbox` trae en una consulta el otro participante, el último mensaje
  y los no leídos. La lista se ordena en la consulta local por `last_message_at`, así
  que al guardarse un mensaje nuevo la conversación sube sola.
- **Enviar:** pasa por la misma cola que likes y comentarios. El mensaje aparece al
  instante como "Enviando…", se envía en orden y sobrevive a quedarse sin conexión. El id
  lo genera el cliente; el eco que devuelve Realtime no se duplica y sustituye la hora
  del dispositivo por la del servidor.
- **Entregado y visto:** no hay un acuse por mensaje. Cada participante guarda dos
  marcas por conversación, "recibido hasta" y "leído hasta", y un mensaje está entregado
  o visto si es anterior a la marca (`domain/message-status.ts`). Las marcas solo se
  escriben con `mark_delivered()` y `mark_read()`, que usan la hora del servidor; el
  cliente no tiene permiso para escribirlas directamente. Los cambios llegan al
  remitente por el mismo canal de Realtime.
- **"Escribiendo…":** es un evento efímero, así que va por Realtime Broadcast y no se
  guarda en ninguna tabla. El canal `conversation:{id}` es privado: unas políticas sobre
  `realtime.messages` solo dejan escuchar y emitir a los participantes. Al escribir se
  avisa como mucho cada 2 s, y el indicador caduca a los 4 s sin avisos por si el "dejó
  de escribir" no llega nunca.
- **Canales:** el de mensajes vive mientras hay sesión; el de escritura, solo mientras
  el chat está abierto. Los dos se cierran en la limpieza de su `useEffect`.
- **Compartir una publicación:** un enlace `instagramclone://post/{id}` pegado en un
  mensaje se muestra con un botón "Ver publicación".

Para que el canal privado sea obligatorio hay que desactivar "Allow public access" en
los ajustes de Realtime del proyecto de Supabase.

## Navegación

```
src/app/
  _layout.tsx          Stack raíz: lo que cubre las pestañas se declara aquí.
  (auth)/              Inicio de sesión y registro.
  (tabs)/              Las cuatro pestañas.
    (home,explore,activity,profile)/
      _layout.tsx      Stack que se instancia una vez por pestaña.
      post/[id].tsx    Publicación con sus comentarios.
      user/[id].tsx    Perfil de otro usuario.
      follows/[userId].tsx  Seguidores o seguidos.
  messages/            Bandeja y chat, a pantalla completa sobre las pestañas.
  create-post.tsx      Modal.
  story/[userId].tsx   Modal a pantalla completa.
```

- Cada pestaña conserva su propia pila, porque el Stack del grupo compartido se
  instancia una vez por pestaña.
- Las pantallas del grupo compartido se abren dentro de la pestaña en la que estás:
  navegar a `/post/{id}` o `/user/{id}` empuja la pantalla en la pila actual.
- Los modales viven fuera de `(tabs)` para poder tapar la barra de pestañas.

### Deep link

`instagramclone://post/{uuid}` abre la publicación en la pestaña Inicio.

`post/[id]` existe en las cuatro pestañas, así que el enlace es ambiguo.
`src/app/+native-intent.tsx` lo reescribe a `/(tabs)/(home)/post/{uuid}` antes de que el
enrutador lo resuelva (lógica y pruebas en `presentation/navigation/incoming-link.ts`).
Sin sesión abierta, el enlace lleva al inicio de sesión y no se retoma después.

El esquema `instagramclone://` solo existe en un development build
(`npx expo run:android` o `npx expo run:ios`). En Expo Go se prueba con:

```bash
npx uri-scheme open "exp://127.0.0.1:8081/--/post/123" --ios
```
