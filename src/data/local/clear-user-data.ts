import type { ChangeNotifier } from '@/data/local/change-notifier';
import { userTables } from '@/data/local/migrations';
import type { SqlDatabase } from '@/data/local/sql-database';

// Al cerrar sesión no debe quedar en el dispositivo nada de la cuenta anterior.
export async function clearUserData(db: SqlDatabase, changes: ChangeNotifier): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of userTables) await db.execAsync(`DELETE FROM ${table}`);
  });
  for (const table of userTables) changes.notify(table);
}
