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
npm run typecheck   # TypeScript
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
```

## Estructura

```
src/
  app/            Rutas (Expo Router). Solo pantallas y layouts, sin lógica.
  presentation/   Componentes, hooks y tema de la UI.
  domain/         Entidades y contratos de repositorios. No importa nada de las otras capas.
  data/
    remote/       Cliente de Supabase y validación de variables de entorno.
supabase/
  migrations/     Esquema SQL + RLS.
  tests/          Pruebas de las reglas de privacidad.
```

Las dependencias van hacia adentro: `app → presentation → domain ← data`.

Carpetas que se añaden al construir cada módulo:

- `data/local/` — base SQLite (fuente única de verdad de la UI).
- `data/sync/` — cola de sincronización offline.
- `data/image-cache/` — caché de imágenes de dos niveles (RAM + disco, LRU).
- `data/repositories/` — implementaciones de los contratos de `domain/`.

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
  `/(explore)/post/{id}`, etc.
- Los modales viven fuera de `(tabs)` para poder tapar la barra de pestañas.

### Deep link

`instagramclone://post/{uuid}` abre la publicación en la pestaña Inicio.

El esquema `instagramclone://` solo existe en un development build
(`npx expo run:android` o `npx expo run:ios`). En Expo Go se prueba con:

```bash
npx uri-scheme open "exp://127.0.0.1:8081/--/post/123" --ios
```
