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
];

// Tablas con datos del usuario; se vacían al cerrar sesión.
export const userTables = ['profiles'] as const;

// La versión aplicada se guarda en PRAGMA user_version, dentro del propio archivo.
// Cada migración va en su transacción: si falla, ni el esquema ni la versión cambian.
export async function migrate(db: SqlDatabase, pending: Migration[] = migrations): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;

  for (const migration of pending) {
    if (migration.version <= current) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
