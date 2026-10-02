import type { SqlDatabase } from '@/data/local/sql-database';

export type DiskEntry = {
  key: string;
  file_name: string;
  size: number;
  last_accessed: number;
};

// Índice en SQLite de los archivos del nivel de disco. El sistema de archivos no guarda
// "último uso" de forma fiable, y recorrer la carpeta para sumar tamaños sería lento;
// con el índice, el tamaño total y el orden LRU son una consulta.
export class DiskIndex {
  constructor(private readonly getDb: () => Promise<SqlDatabase>) {}

  async get(key: string): Promise<DiskEntry | null> {
    const db = await this.getDb();
    return db.getFirstAsync<DiskEntry>('SELECT * FROM image_cache WHERE key = ?', [key]);
  }

  async put(entry: DiskEntry): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO image_cache (key, file_name, size, last_accessed) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         file_name = excluded.file_name,
         size = excluded.size,
         last_accessed = excluded.last_accessed`,
      [entry.key, entry.file_name, entry.size, entry.last_accessed],
    );
  }

  // Una sola sentencia para todas las claves: es atómica sin abrir una transacción, que
  // en expo-sqlite podría mezclarse con las de otros módulos sobre la misma conexión.
  async touch(accesses: Map<string, number>): Promise<void> {
    if (accesses.size === 0) return;

    const entries = [...accesses];
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE image_cache
       SET last_accessed = CASE key ${entries.map(() => 'WHEN ? THEN ?').join(' ')} END
       WHERE key IN (${entries.map(() => '?').join(', ')})`,
      [...entries.flat(), ...entries.map(([key]) => key)],
    );
  }

  async totalSize(): Promise<number> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(size) AS total FROM image_cache',
      [],
    );
    return row?.total ?? 0;
  }

  // Del que lleva más tiempo sin usarse al más reciente.
  async leastRecentlyUsed(limit: number): Promise<DiskEntry[]> {
    const db = await this.getDb();
    return db.getAllAsync<DiskEntry>(
      'SELECT * FROM image_cache ORDER BY last_accessed ASC LIMIT ?',
      [limit],
    );
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const db = await this.getDb();
    await db.runAsync(
      `DELETE FROM image_cache WHERE key IN (${keys.map(() => '?').join(', ')})`,
      keys,
    );
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    await db.execAsync('DELETE FROM image_cache');
  }
}
