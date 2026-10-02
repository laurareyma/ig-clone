import { migrate, migrations, userTables } from '@/data/local/migrations';
import { createTestDatabase } from '@/testing/node-sqlite';

async function versionOf(db: ReturnType<typeof createTestDatabase>) {
  return (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []))!
    .user_version;
}

async function tablesOf(db: ReturnType<typeof createTestDatabase>) {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    [],
  );
  return rows.map((row) => row.name);
}

describe('migrate', () => {
  it('aplica todas las migraciones en una base nueva', async () => {
    const db = createTestDatabase();

    await migrate(db);

    expect(await versionOf(db)).toBe(migrations.at(-1)!.version);
    expect(await tablesOf(db)).toEqual(expect.arrayContaining([...userTables]));
  });

  it('no repite las ya aplicadas', async () => {
    const db = createTestDatabase();
    const v1 = { version: 1, sql: 'CREATE TABLE a (id TEXT)' };
    const v2 = { version: 2, sql: 'CREATE TABLE b (id TEXT)' };

    await migrate(db, [v1]);
    // Si v1 se repitiera, CREATE TABLE fallaría porque la tabla ya existe.
    await migrate(db, [v1, v2]);

    expect(await versionOf(db)).toBe(2);
    expect(await tablesOf(db)).toEqual(['a', 'b']);
  });

  it('si una migración falla, se deshace entera y conserva las anteriores', async () => {
    const db = createTestDatabase();
    const v1 = { version: 1, sql: 'CREATE TABLE a (id TEXT)' };
    const broken = { version: 2, sql: 'CREATE TABLE b (id TEXT); CREATE TABLE a (id TEXT);' };

    await expect(migrate(db, [v1, broken])).rejects.toThrow();

    expect(await versionOf(db)).toBe(1);
    expect(await tablesOf(db)).toEqual(['a']);
  });

  it('las versiones están en orden y sin repetir', () => {
    const versions = migrations.map((migration) => migration.version);

    expect(versions).toEqual(versions.map((_, index) => index + 1));
  });
});
