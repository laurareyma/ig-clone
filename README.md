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

Carpetas que se añaden al construir cada módulo:

- `data/sync/` — cola de sincronización offline.

## Navegación

```
src/app/
  _layout.tsx          Stack raíz: lo que cubre las pestañas se declara aquí.
  (auth)/              Inicio de sesión y registro.
  (tabs)/              Las cuatro pestañas.
    (home,explore,activity,profile)/
      _layout.tsx      Stack que se instancia una vez por pestaña.
      post/[id].tsx    Pantalla compartida por las cuatro pilas.
  create-post.tsx      Modal.
  story/[userId].tsx   Modal a pantalla completa.
```

- Cada pestaña conserva su propia pila, porque el Stack del grupo compartido se
  instancia una vez por pestaña.
- `post/[id].tsx` se puede abrir dentro de cualquier pestaña con
  `/(tabs)/(explore)/post/{id}`, etc.
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
