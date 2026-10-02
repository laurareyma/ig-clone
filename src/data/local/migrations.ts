import type { SqlDatabase } from '@/data/local/sql-database';

export type Migration = { version: number; sql: string };

// Una migración publicada no se edita: los cambios de esquema se añaden al final
// con el siguiente número de versión.
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL,
        full_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        is_private INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    // Índice del nivel de disco de la caché de imágenes (ver data/image-cache).
    sql: `
      CREATE TABLE image_cache (
        key TEXT PRIMARY KEY NOT NULL,
        file_name TEXT NOT NULL,
        size INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL
      );
      CREATE INDEX image_cache_lru ON image_cache (last_accessed);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE posts (
        id TEXT PRIMARY KEY NOT NULL,
        author_id TEXT NOT NULL,
        image_path TEXT NOT NULL,
        image_width INTEGER NOT NULL,
        image_height INTEGER NOT NULL,
        caption TEXT NOT NULL,
        likes_count INTEGER NOT NULL,
        comments_count INTEGER NOT NULL,
        liked_by_me INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Qué publicaciones forman cada lista (home, explore, author:{id}). Una misma
      -- publicación puede estar en varias sin duplicarse en posts.
      CREATE TABLE feed_entries (
        feed TEXT NOT NULL,
        post_id TEXT NOT NULL,
        PRIMARY KEY (feed, post_id)
      );

      CREATE TABLE comments (
        id TEXT PRIMARY KEY NOT NULL,
        post_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        parent_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX comments_post ON comments (post_id, created_at);

      CREATE TABLE profile_details (
        id TEXT PRIMARY KEY NOT NULL,
        posts_count INTEGER NOT NULL,
        followers_count INTEGER NOT NULL,
        following_count INTEGER NOT NULL,
        follow_status TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    // Cola de sincronización: acciones del usuario aún no confirmadas por el servidor.
    // El id autoincremental es el orden cronológico en que se hicieron y se enviarán.
    sql: `
      CREATE TABLE outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX outbox_entity ON outbox (type, entity_id);
    `,
  },
];

// Tablas con datos del usuario; se vacían al cerrar sesión. image_cache no está aquí
// porque vaciarla exige borrar también sus archivos: lo hace ImageCache.clear().
export const userTables = [
  'profiles',
  'profile_details',
  'posts',
  'feed_entries',
  'comments',
  // Las acciones pendientes son de quien las hizo: no deben enviarse con otra sesión.
  'outbox',
] as const;

// La versión aplicada se guarda en PRAGMA user_version, dentro del propio archivo.
// Cada migración va en su transacción: si falla, ni el esquema ni la versión cambian.
export async function migrate(db: SqlDatabase, pending: Migration[] = migrations): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;

  for (const migration of pending) {
    if (migration.version <= current) continue;

    await db.withTransactionAsync(async (tx) => {
      await tx.execAsync(migration.sql);
      await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
