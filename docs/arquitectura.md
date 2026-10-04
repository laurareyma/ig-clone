# Decisiones de arquitectura

Cada decisión con el problema que resuelve, lo que se descartó y lo que cuesta. Los
detalles de implementación están en el [README](../README.md).

## 1. Capas con dependencias hacia adentro

**Problema.** La UI, Supabase y SQLite cambian por motivos distintos. Si las pantallas
llaman a Supabase directamente, cambiar la fuente de datos obliga a tocar pantallas, y
no se pueden probar sin red.

**Decisión.** `app → presentation → domain ← data`. El dominio (`src/domain/`) define
entidades, contratos de repositorio y reglas puras, sin importar React ni Supabase. Los
repositorios de `src/data/` implementan esos contratos. `src/di/container.ts` es el único
archivo que conoce las dos partes y entrega las implementaciones a la UI por un contexto
(`useDependencies`).

**Cómo se garantiza.** `eslint.config.js` convierte en error de lint importar `data/` o
Supabase desde la UI, o cualquier cosa externa desde el dominio.

**Coste.** Más archivos e interfaces que llamar a Supabase desde la pantalla.

## 2. SQLite como única fuente de verdad de la UI

**Problema.** La app debe funcionar con conexión intermitente: mostrar lo que ya tenía y
aceptar acciones sin red.

**Decisión.** Las pantallas nunca leen de la red. Cada repositorio tiene `watch…()`, que
lee SQLite y vuelve a leer cuando `ChangeNotifier` avisa de un cambio en la tabla, y
`refresh…()`, que trae datos del servidor y los escribe en SQLite.

**Descartado.** Una caché en memoria tipo React Query: no sobrevive a cerrar la app ni
da una cola persistente.

**Coste.** Hay que mantener un esquema local con sus migraciones
(`src/data/local/migrations.ts`) y reconciliar lo local con lo remoto (punto 8).

## 3. Una cola única para escribir en SQLite

**Problema.** En `expo-sqlite` todas las llamadas comparten una conexión. Una escritura
lanzada mientras otra parte de la app tiene una transacción abierta queda dentro de esa
transacción (y se deshace con ella), y dos transacciones a la vez fallan.

**Decisión.** `serializeWrites` (`src/data/local/sql-database.ts`) pasa todas las
escrituras y transacciones por una cola de promesas. Las lecturas no esperan: con WAL
pueden leer mientras se escribe.

## 4. Privacidad decidida en el servidor

**Problema.** Cualquier regla en el cliente se puede saltar con una petición directa a
la API.

**Decisión.** RLS en todas las tablas y en Storage (`supabase/migrations/`). Además:
- permisos por columna: el cliente no puede fijar `created_at`, contadores, el estado de
  un follow ni las marcas de leído;
- triggers para lo que debe calcular el servidor (estado inicial de un follow,
  contadores, perfil al registrarse);
- funciones `security definer` pequeñas para las comprobaciones que necesitan leer otras
  tablas sin que las políticas se llamen entre sí.

**Cómo se prueba.** `npm run test:rls` aplica las migraciones a un Postgres embebido
(PGlite) y comprueba 79 casos de acceso con tres usuarios.

## 5. Paginación por cursor

**Problema.** Con `OFFSET`, una publicación nueva desplaza las páginas: se repiten filas
o se saltan. Además, `OFFSET 1000` recorre las mil filas anteriores.

**Decisión.** `get_posts` recibe `(created_at, id)` de la última publicación y devuelve
las anteriores. El `id` desempata fechas iguales. Un índice `(created_at desc, id desc)`
lo cubre.

## 6. Caché de imágenes propia de dos niveles

**Problema.** El enunciado prohíbe la carga de imágenes automática sin control y pide
memoria + disco con LRU y cancelación.

**Decisión** (`src/data/image-cache/`):
- clave = ruta en Storage, porque la URL firmada de un bucket privado cambia;
- nivel 1: mapa LRU en memoria con la URI local, consultable de forma síncrona para
  pintar en el primer render;
- nivel 2: archivos en la carpeta de caché del sistema y un índice en SQLite con tamaño
  y último uso, limitado a 200 MB;
- descargas compartidas por clave, canceladas con `AbortSignal` cuando ninguna celda las
  espera;
- descarga a un archivo temporal y renombrado al terminar.

**Límite reconocido.** El nivel de memoria guarda rutas, no bitmaps. Los bitmaps
decodificados los gestiona el componente `Image` nativo; desde JavaScript no se puede
controlar esa memoria.

## 7. Listas que no crecen en memoria

**Decisión.** FlashList recicla las celdas. `use-feed.ts` conserva el mismo objeto de
cada publicación que no cambió, así que `memo` en `PostCard` evita renderizar las
tarjetas intactas. Las imágenes reservan su alto con el aspect ratio guardado en la base,
así la lista no salta al cargar.

## 8. Cola de sincronización (outbox)

**Problema.** Like, comentario y mensaje deben verse al instante, sobrevivir sin red y
llegar al servidor en orden y sin duplicarse.

**Decisión** (`src/data/sync/outbox.ts`):
- el efecto local y la operación pendiente se guardan en la misma transacción;
- un solo procesador envía la más antigua; nunca hay dos en vuelo;
- fallos de red: reintento sin límite con espera exponencial; fallos del servidor:
  reintento con máximo; rechazos permanentes: se descarta y la copia local se corrige;
- la cola se detiene en la operación que falla en vez de saltársela, para no cambiar el
  orden;
- idempotencia: ids generados en el cliente y operaciones que se pueden repetir;
- al refrescar, las operaciones pendientes se vuelven a aplicar sobre los datos del
  servidor.

**Coste.** Con la app cerrada no se envía nada; se envía al volver a abrirla.

## 9. Acuses de mensajes por marcas de agua

**Problema.** Guardar "entregado" y "visto" por mensaje multiplica las escrituras y los
eventos de tiempo real.

**Decisión.** Cada participante tiene dos marcas por conversación: recibido hasta y leído
hasta. Un mensaje está entregado o visto si es anterior a la marca. Las marcas solo se
escriben con funciones que usan la hora del servidor.

## 10. "Escribiendo…" por Broadcast privado

**Decisión.** Es efímero, así que va por Realtime Broadcast y no se guarda. El canal
`conversation:{id}` es privado y unas políticas sobre `realtime.messages` solo admiten a
los participantes. Se avisa como mucho cada 2 s y el indicador caduca a los 4 s.

## 11. Historias

**Decisión.**
- "Visto" se guarda solo en el dispositivo, en una tabla separada que sobrevive a cada
  refresco.
- La caducidad se comprueba en el servidor y también al leer la copia local.
- La barra de progreso es un valor compartido de Reanimated animado en el hilo de UI
  (`scaleX`, sin recalcular layout). La pausa la gestiona un gesto de Gesture Handler en
  ese mismo hilo.

## 12. Navegación

**Decisión.**
- Pestañas nativas, cada una con su propia pila.
- Las pantallas compartidas (`post`, `user`, `follows`) se abren dentro de la pestaña
  actual.
- La pila raíz contiene lo que tapa las pestañas: login, mensajes, crear post, historias.
- `Stack.Protected` decide qué existe con y sin sesión.
- `+native-intent` reescribe los enlaces externos a la pestaña Inicio y guarda los que
  llegan sin sesión para abrirlos tras el login.

## 13. Estrategia de pruebas

| Qué | Cómo | Dónde |
|---|---|---|
| Reglas puras del dominio | Jest, sin dependencias | `src/domain/**/*.test.ts` |
| Base local, repositorios y cola | Jest con SQLite real en memoria (`node:sqlite`) y red simulada | `src/data/**/*.test.ts` |
| Pantallas y navegación | `expo-router/testing-library` con repositorios en memoria | `src/__tests__/` |
| Privacidad del servidor | Migraciones reales sobre PGlite | `supabase/tests/rls.test.mjs` |
| Red real, gestos, rendimiento | Manual, en dispositivo | `docs/pruebas-en-dispositivo.md` |
