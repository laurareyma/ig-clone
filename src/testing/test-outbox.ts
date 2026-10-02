import type { ChangeNotifier } from '@/data/local/change-notifier';
import type { SqlDatabase } from '@/data/local/sql-database';
import { Outbox, type OutboxOptions } from '@/data/sync/outbox';

// Cola real sobre la base de pruebas, con la conexión y los reintentos controlados por
// la prueba en vez de por el sistema y el reloj.
export function createTestOutbox(
  db: SqlDatabase,
  changes: ChangeNotifier,
  options: OutboxOptions = {},
) {
  let online = true;
  const listeners = new Set<(online: boolean) => void>();
  const retries: { delayMs: number; run: () => void }[] = [];

  const outbox = new Outbox(
    async () => db,
    changes,
    {
      isOnline: () => online,
      subscribe(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    {
      now: () => 1000,
      schedule(task, delayMs) {
        const entry = { delayMs, run: task };
        retries.push(entry);
        return () => void retries.splice(retries.indexOf(entry), 1);
      },
      ...options,
    },
  );

  return {
    outbox,
    // Reintentos programados y aún no ejecutados.
    retries,
    setOnline(next: boolean) {
      online = next;
      listeners.forEach((listener) => listener(next));
    },
    // Ejecuta el reintento programado, como si hubiera pasado su espera.
    async runRetry() {
      const [entry] = retries.splice(0, 1);
      entry.run();
      await outbox.process();
    },
    async rows() {
      return db.getAllAsync<{ type: string; entity_id: string; attempts: number }>(
        'SELECT type, entity_id, attempts FROM outbox ORDER BY id',
        [],
      );
    },
  };
}
