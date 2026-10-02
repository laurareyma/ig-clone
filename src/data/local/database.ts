import { openDatabaseAsync } from 'expo-sqlite';

import { migrate } from '@/data/local/migrations';
import { serializeWrites, type SqlDatabase } from '@/data/local/sql-database';

let database: Promise<SqlDatabase> | undefined;

// Abre la base una sola vez. Quien la pida mientras se abre o migra espera la misma
// promesa, así que nadie consulta un esquema a medio migrar.
export function getDatabase(): Promise<SqlDatabase> {
  database ??= (async () => {
    const raw = await openDatabaseAsync('app.db');
    // WAL permite leer mientras se escribe; no se puede activar dentro de una transacción.
    await raw.execAsync('PRAGMA journal_mode = WAL');
    const db = serializeWrites(raw);
    await migrate(db);
    return db;
  })();

  return database;
}
