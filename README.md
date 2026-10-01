# Instagram Clone — Parcial Desarrollo Móvil

React Native (Expo SDK 57, Expo Router) + Supabase.

## Arrancar

```bash
npm install
cp .env.example .env.local   # pegar URL y publishable key del proyecto de Supabase
npx expo start
```

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
    remote/       Cliente de Supabase.
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

- `src/app/_layout.tsx` define las cuatro pestañas.
- `src/app/(home,explore,activity,profile)/_layout.tsx` es un Stack que se instancia
  una vez por pestaña: cada una conserva su propia pila.
- `post/[id].tsx` está en ese grupo compartido, así que se puede abrir dentro de
  cualquier pestaña con `/(explore)/post/{id}`, etc.

### Deep link

`instagramclone://post/{uuid}` abre la publicación en la pestaña Inicio.

El esquema `instagramclone://` solo existe en un development build
(`npx expo run:android` o `npx expo run:ios`). En Expo Go se prueba con:

```bash
npx uri-scheme open "exp://127.0.0.1:8081/--/post/123" --ios
```
