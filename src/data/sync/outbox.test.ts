import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import type { OutboxHandler } from '@/data/sync/outbox';
import type { SyncStatus } from '@/domain/repositories/sync-monitor';
import { createTestDatabase } from '@/testing/node-sqlite';
import { createTestOutbox } from '@/testing/test-outbox';

type Payload = { name: string };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const transient = () => new TypeError('Network request failed');
const serverDown = () => ({ code: '53300', message: 'too many connections' });
const permanent = () => ({ code: '23503', message: 'violates foreign key constraint' });

async function setup(options: { maxAttempts?: number } = {}) {
  const db = createTestDatabase();
  await migrate(db);
  await db.execAsync('CREATE TABLE applied (name TEXT)');
  const test = createTestOutbox(db, new ChangeNotifier(), options);

  const sent: string[] = [];
  const discarded: string[] = [];
  const send = jest.fn(async (payload: Payload) => void sent.push(payload.name));
  const handler: OutboxHandler<Payload> = {
    applyLocal: async (tx, payload) =>
      void (await tx.runAsync('INSERT INTO applied VALUES (?)', [payload.name])),
    send,
    discard: async (payload) => void discarded.push(payload.name),
    tables: ['applied'],
  };
  test.outbox.register('test', handler);

  const enqueue = (name: string) => test.outbox.enqueue('test', name, { name });
  const applied = async () =>
    (await db.getAllAsync<{ name: string }>('SELECT name FROM applied', [])).map((r) => r.name);
  const queued = async () => (await test.rows()).map((row) => row.entity_id);
  // Espera a que termine cualquier envío en marcha.
  const idle = async () => {
    await settle();
    await test.outbox.process();
    await settle();
  };

  return { ...test, db, send, sent, discarded, enqueue, applied, queued, idle };
}

describe('encolar', () => {
  it('con conexión: aplica el cambio local, envía y vacía la cola', async () => {
    const { enqueue, applied, queued, sent, idle } = await setup();

    await enqueue('a');
    await idle();

    expect(await applied()).toEqual(['a']);
    expect(sent).toEqual(['a']);
    expect(await queued()).toEqual([]);
  });

  it('sin conexión: el cambio local queda aplicado y la operación guardada, sin tocar la red', async () => {
    const { enqueue, applied, queued, send, setOnline, idle } = await setup();
    setOnline(false);

    await enqueue('a');
    await idle();

    expect(await applied()).toEqual(['a']);
    expect(await queued()).toEqual(['a']);
    expect(send).not.toHaveBeenCalled();
  });

  it('si el cambio local falla, la operación no se guarda (misma transacción)', async () => {
    const { outbox, queued } = await setup();
    outbox.register('roto', {
      applyLocal: async () => {
        throw new Error('fallo local');
      },
      send: async () => {},
      discard: async () => {},
      tables: [],
    });

    await expect(outbox.enqueue('roto', 'x', {})).rejects.toThrow('fallo local');

    expect(await queued()).toEqual([]);
  });
});

describe('envío', () => {
  it('al volver la conexión envía todo en el orden en que se hizo', async () => {
    const { outbox, enqueue, queued, sent, setOnline, idle } = await setup();
    outbox.start();
    setOnline(false);
    await enqueue('a');
    await enqueue('b');
    await enqueue('c');

    setOnline(true);
    await idle();

    expect(sent).toEqual(['a', 'b', 'c']);
    expect(await queued()).toEqual([]);
  });

  it('nunca hay dos operaciones en vuelo a la vez', async () => {
    const { outbox, enqueue, send, idle } = await setup();
    let inFlight = 0;
    let maxInFlight = 0;
    send.mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      await settle();
      inFlight--;
    });

    await Promise.all([enqueue('a'), enqueue('b'), enqueue('c')]);
    void outbox.process();
    void outbox.process();
    await idle();
    await idle();

    expect(send).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it('un fallo transitorio detiene la cola sin saltarse la operación y programa un reintento', async () => {
    const { enqueue, queued, sent, send, retries, rows, setOnline, outbox, idle } = await setup();
    setOnline(false);
    await enqueue('a');
    await enqueue('b');
    send.mockRejectedValueOnce(transient());

    setOnline(true);
    await outbox.process();

    expect(sent).toEqual([]);
    expect(await queued()).toEqual(['a', 'b']);
    expect((await rows())[0].attempts).toBe(1);
    expect(retries.map((retry) => retry.delayMs)).toEqual([1000]);
    await idle();
  });

  it('el reintento envía la misma operación y luego las siguientes', async () => {
    const { enqueue, queued, sent, send, runRetry, setOnline, outbox } = await setup();
    setOnline(false);
    await enqueue('a');
    await enqueue('b');
    send.mockRejectedValueOnce(transient());
    setOnline(true);
    await outbox.process();

    await runRetry();

    expect(sent).toEqual(['a', 'b']);
    expect(await queued()).toEqual([]);
  });

  it('la espera entre reintentos crece de forma exponencial hasta un tope', async () => {
    const { enqueue, send, retries, runRetry, idle } = await setup({ maxAttempts: 100 });
    send.mockRejectedValue(transient());
    await enqueue('a');
    await idle();

    const delays = [retries[0].delayMs];
    for (let i = 0; i < 7; i++) {
      await runRetry();
      delays.push(retries[0].delayMs);
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });

  it('un rechazo permanente descarta la operación, avisa al dueño y sigue con la cola', async () => {
    const { enqueue, queued, sent, send, discarded, setOnline, outbox } = await setup();
    setOnline(false);
    await enqueue('a');
    await enqueue('b');
    send.mockRejectedValueOnce(permanent());

    setOnline(true);
    await outbox.process();

    expect(discarded).toEqual(['a']);
    expect(sent).toEqual(['b']);
    expect(await queued()).toEqual([]);
  });

  it('encolar más acciones durante la espera no adelanta el reintento', async () => {
    const { enqueue, send, retries, idle } = await setup();
    send.mockRejectedValue(transient());
    await enqueue('a');
    await idle();

    await enqueue('b');
    await enqueue('c');
    await idle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(retries).toHaveLength(1);
  });

  it('recuperar la conexión reintenta ya, sin esperar', async () => {
    const { outbox, enqueue, send, sent, retries, setOnline, idle } = await setup();
    outbox.start();
    send.mockRejectedValueOnce(transient());
    await enqueue('a');
    await idle();
    expect(retries).toHaveLength(1);

    setOnline(false);
    setOnline(true);
    await idle();

    expect(sent).toEqual(['a']);
    expect(retries).toHaveLength(0);
  });

  it('los fallos de red no agotan los intentos: nada se pierde por estar mucho sin conexión', async () => {
    const { enqueue, queued, send, discarded, runRetry, idle } = await setup({ maxAttempts: 3 });
    send.mockRejectedValue(transient());
    await enqueue('a');
    await idle();

    for (let i = 0; i < 6; i++) await runRetry();

    expect(discarded).toEqual([]);
    expect(await queued()).toEqual(['a']);
  });

  it('si el servidor responde con error una y otra vez, se descarta para no bloquear la cola', async () => {
    const { enqueue, queued, send, discarded, runRetry, idle } = await setup({ maxAttempts: 3 });
    send.mockRejectedValue(serverDown());
    await enqueue('a');
    await idle();

    await runRetry();
    await runRetry();

    expect(send).toHaveBeenCalledTimes(3);
    expect(discarded).toEqual(['a']);
    expect(await queued()).toEqual([]);
  });

  it('sobrevive a un reinicio: una cola nueva sobre la misma base envía lo pendiente', async () => {
    const first = await setup();
    first.setOnline(false);
    await first.enqueue('a');

    const second = createTestOutbox(first.db, new ChangeNotifier());
    const sentAfterRestart: string[] = [];
    second.outbox.register<Payload>('test', {
      applyLocal: async () => {},
      send: async (payload) => void sentAfterRestart.push(payload.name),
      discard: async () => {},
      tables: [],
    });
    second.outbox.start();
    await settle();
    await second.outbox.process();

    expect(sentAfterRestart).toEqual(['a']);
    expect(await first.queued()).toEqual([]);
  });
});

describe('estado para la UI', () => {
  it('informa de la conexión y de cuántas acciones faltan por enviar', async () => {
    const { outbox, enqueue, setOnline, idle } = await setup();
    outbox.start();
    const statuses: SyncStatus[] = [];
    outbox.watchStatus((status) => statuses.push(status));
    await settle();

    setOnline(false);
    await enqueue('a');
    await enqueue('b');
    await settle();
    expect(statuses.at(-1)).toEqual({ online: false, pendingCount: 2 });

    setOnline(true);
    await idle();
    expect(statuses.at(-1)).toEqual({ online: true, pendingCount: 0 });
  });

  it('pending devuelve las operaciones de un tipo en orden', async () => {
    const { outbox, db, enqueue, setOnline } = await setup();
    setOnline(false);
    await enqueue('a');
    await enqueue('b');

    expect(await outbox.pending<Payload>(db, 'test')).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(await outbox.pending(db, 'otro')).toEqual([]);
  });
});
