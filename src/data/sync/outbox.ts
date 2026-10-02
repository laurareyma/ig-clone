import type { ChangeNotifier } from '@/data/local/change-notifier';
import type { SqlDatabase, SqlExecutor } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import { classifyError } from '@/data/sync/classify-error';
import type { Connectivity } from '@/data/sync/connectivity';
import type { SyncMonitor, SyncStatus } from '@/domain/repositories/sync-monitor';

// Cómo se trata un tipo de operación. Lo registra el repositorio dueño de ese dato.
export type OutboxHandler<P> = {
  // Efecto de la operación sobre la copia local. Se ejecuta al encolarla (UI optimista)
  // y debe poder repetirse sin cambiar el resultado.
  applyLocal(tx: SqlExecutor, payload: P): Promise<void>;
  // Envía la operación al servidor. Debe ser idempotente: si la respuesta se pierde, se
  // vuelve a enviar la misma.
  send(payload: P): Promise<void>;
  // El servidor la rechazó definitivamente: deja la copia local como está el servidor.
  discard(payload: P): Promise<void>;
  // Tablas cuyos lectores hay que avisar cuando la operación cambia de estado.
  tables: string[];
};

type OutboxRow = {
  id: number;
  type: string;
  payload: string;
  attempts: number;
};

export type OutboxOptions = {
  // Tras estos intentos fallidos con el servidor respondiendo, la operación se descarta
  // para que no bloquee la cola indefinidamente. Los fallos de red no tienen límite.
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
  // Programa un reintento y devuelve cómo cancelarlo.
  schedule?: (task: () => void, delayMs: number) => () => void;
};

// Cola de sincronización (patrón outbox).
//
// Cada acción del usuario se guarda en SQLite en la misma transacción que su efecto
// local: o quedan las dos cosas o ninguna, incluso si la app se cierra en ese momento.
// Después se envían al servidor de una en una y en el orden en que se hicieron.
export class Outbox implements SyncMonitor {
  // any a propósito: cada tipo de operación tiene su propio payload.
  private readonly handlers = new Map<string, OutboxHandler<any>>();
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly now: () => number;
  private readonly schedule: (task: () => void, delayMs: number) => () => void;

  private draining: Promise<void> | null = null;
  // Llegó trabajo nuevo mientras se vaciaba la cola: hay que dar otra pasada.
  private again = false;
  private cancelRetry: (() => void) | null = null;

  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly changes: ChangeNotifier,
    private readonly connectivity: Connectivity,
    options: OutboxOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((task, delayMs) => {
        const timer = setTimeout(task, delayMs);
        return () => clearTimeout(timer);
      });
  }

  register<P>(type: string, handler: OutboxHandler<P>): void {
    this.handlers.set(type, handler);
  }

  // Aplica el efecto local y guarda la operación, de forma atómica. No toca la red:
  // termina igual de rápido con o sin conexión.
  async enqueue<P>(type: string, entityId: string, payload: P): Promise<void> {
    const handler = this.handlerOf(type);
    const db = await this.getDb();

    await db.withTransactionAsync(async (tx) => {
      await handler.applyLocal(tx, payload);
      await tx.runAsync(
        'INSERT INTO outbox (type, entity_id, payload, created_at) VALUES (?, ?, ?, ?)',
        [type, entityId, JSON.stringify(payload), this.now()],
      );
    });

    this.notify(handler.tables);
    void this.process();
  }

  // Operaciones pendientes de un tipo, en orden. Los repositorios las vuelven a aplicar
  // sobre los datos recién traídos del servidor, que todavía no las incluyen.
  async pending<P>(db: SqlExecutor, type: string): Promise<P[]> {
    const rows = await db.getAllAsync<{ payload: string }>(
      'SELECT payload FROM outbox WHERE type = ? ORDER BY id',
      [type],
    );
    return rows.map((row) => JSON.parse(row.payload) as P);
  }

  // Envía lo pendiente. Se puede llamar las veces que haga falta: si ya hay un envío en
  // marcha no arranca otro, así nunca hay dos operaciones en vuelo a la vez. La promesa
  // se resuelve cuando no queda nada que se pueda enviar ahora.
  process(): Promise<void> {
    if (this.draining) {
      this.again = true;
      return this.draining;
    }

    this.draining = (async () => {
      do {
        this.again = false;
        await this.drain();
      } while (this.again);
    })().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  // Reintenta ya, sin esperar al reintento programado. Para cuando hay motivos para
  // creer que ahora sí funcionará: volvió la conexión o la app vuelve a primer plano.
  resume(): Promise<void> {
    this.cancelRetry?.();
    this.cancelRetry = null;
    return this.process();
  }

  // Dispara el envío al arrancar y al recuperar la conexión. Devuelve cómo detenerlo.
  start(): () => void {
    void this.process();
    return this.connectivity.subscribe((online) => {
      // El número de pendientes no cambió, pero el estado que ve la UI sí.
      this.changes.notify('outbox');
      if (online) void this.resume();
    });
  }

  watchStatus(listener: (status: SyncStatus) => void): () => void {
    return watchQuery(
      this.changes,
      ['outbox'],
      async () => {
        const db = await this.getDb();
        const row = await db.getFirstAsync<{ pending: number }>(
          'SELECT COUNT(*) AS pending FROM outbox',
          [],
        );
        return { online: this.connectivity.isOnline(), pendingCount: row?.pending ?? 0 };
      },
      listener,
    );
  }

  private async drain(): Promise<void> {
    // Hay un reintento programado: se respeta su espera. Encolar más acciones mientras
    // el servidor falla no debe multiplicar los intentos.
    if (this.cancelRetry) return;
    const db = await this.getDb();

    // Sin conexión no se intenta nada: las operaciones esperan en SQLite.
    while (this.connectivity.isOnline()) {
      // Siempre la más antigua: orden cronológico estricto.
      const row = await db.getFirstAsync<OutboxRow>(
        'SELECT id, type, payload, attempts FROM outbox ORDER BY id LIMIT 1',
        [],
      );
      if (!row) return;

      const handler = this.handlers.get(row.type);
      if (!handler) {
        // Tipo desconocido, por ejemplo de una versión anterior de la app.
        await this.remove(db, row.id, []);
        continue;
      }

      const payload = JSON.parse(row.payload);
      try {
        await handler.send(payload);
      } catch (error) {
        const attempts = row.attempts + 1;

        const kind = classifyError(error);

        if (kind === 'permanent' || (kind === 'server' && attempts >= this.maxAttempts)) {
          await this.remove(db, row.id, handler.tables);
          await handler.discard(payload).catch(() => {});
          continue;
        }

        await db.runAsync('UPDATE outbox SET attempts = ?, last_error = ? WHERE id = ?', [
          attempts,
          String((error as { message?: unknown } | null)?.message ?? error),
          row.id,
        ]);
        // No se pasa a la siguiente: saltársela rompería el orden (un "quitar like"
        // podría llegar antes que su "like"). Se espera y se reintenta esta misma.
        this.retryLater(attempts);
        return;
      }

      await this.remove(db, row.id, handler.tables);
    }
  }

  // Espera exponencial: 1 s, 2 s, 4 s... hasta un tope. Si el servidor está caído, no se
  // le bombardea; si fue un fallo puntual, el primer reintento llega enseguida.
  private retryLater(attempts: number): void {
    const delay = Math.min(this.baseDelayMs * 2 ** (attempts - 1), this.maxDelayMs);
    this.cancelRetry = this.schedule(() => {
      this.cancelRetry = null;
      void this.process();
    }, delay);
  }

  private async remove(db: SqlDatabase, id: number, tables: string[]): Promise<void> {
    await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
    this.notify(tables);
  }

  private notify(tables: string[]): void {
    for (const table of new Set([...tables, 'outbox'])) this.changes.notify(table);
  }

  private handlerOf(type: string) {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No hay un manejador registrado para "${type}"`);
    return handler;
  }
}
