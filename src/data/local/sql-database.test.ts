import { createTestDatabase } from '@/testing/node-sqlite';

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

async function setup() {
  const db = createTestDatabase();
  await db.execAsync('CREATE TABLE log (entry TEXT)');
  const entries = async () =>
    (await db.getAllAsync<{ entry: string }>('SELECT entry FROM log ORDER BY rowid', [])).map(
      (row) => row.entry,
    );
  return { db, entries };
}

describe('serializeWrites', () => {
  it('dos transacciones simultáneas se ejecutan una detrás de otra', async () => {
    const { db, entries } = await setup();
    const transaction = (name: string) =>
      db.withTransactionAsync(async (tx) => {
        await tx.runAsync('INSERT INTO log VALUES (?)', [`${name}-1`]);
        await pause();
        await tx.runAsync('INSERT INTO log VALUES (?)', [`${name}-2`]);
      });

    await Promise.all([transaction('a'), transaction('b')]);

    expect(await entries()).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
  });

  it('una escritura suelta espera a la transacción abierta y no se deshace con ella', async () => {
    const { db, entries } = await setup();

    const failing = db.withTransactionAsync(async (tx) => {
      await tx.runAsync('INSERT INTO log VALUES (?)', ['dentro']);
      await pause();
      throw new Error('falla');
    });
    const loose = db.runAsync('INSERT INTO log VALUES (?)', ['fuera']);

    await expect(failing).rejects.toThrow('falla');
    await loose;
    expect(await entries()).toEqual(['fuera']);
  });

  it('un fallo no bloquea las escrituras siguientes', async () => {
    const { db, entries } = await setup();

    await expect(db.runAsync('INSERT INTO no_existe VALUES (?)', ['x'])).rejects.toThrow();
    await db.runAsync('INSERT INTO log VALUES (?)', ['después']);

    expect(await entries()).toEqual(['después']);
  });

  it('runAsync informa de cuántas filas cambió', async () => {
    const { db } = await setup();
    await db.runAsync('INSERT INTO log VALUES (?)', ['a']);

    expect(await db.runAsync('UPDATE log SET entry = ? WHERE entry = ?', ['b', 'a'])).toMatchObject(
      { changes: 1 },
    );
    expect(await db.runAsync('UPDATE log SET entry = ? WHERE entry = ?', ['c', 'zzz'])).toMatchObject(
      { changes: 0 },
    );
  });
});
