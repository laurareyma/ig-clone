export type SqlValue = string | number | null;

// Lo mínimo que la capa de datos necesita de SQLite.
export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
}

// La conexión tal como la entrega el motor (expo-sqlite en la app, node:sqlite en las
// pruebas). No se usa directamente: se envuelve con serializeWrites().
export interface RawSqlDatabase extends SqlExecutor {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface SqlDatabase extends SqlExecutor {
  // Las sentencias de la transacción deben ejecutarse con `tx`, no con la base exterior.
  withTransactionAsync(task: (tx: SqlExecutor) => Promise<void>): Promise<void>;
}

// SQLite admite un solo escritor, y en expo-sqlite todas las llamadas comparten una
// conexión: una escritura lanzada mientras otra parte de la app tiene una transacción
// abierta quedaría dentro de esa transacción (y se desharía con ella), y dos
// transacciones a la vez fallan con "cannot start a transaction within a transaction".
//
// Aquí todas las escrituras y transacciones pasan por una cola y se ejecutan de una en
// una. Las lecturas no esperan: con WAL pueden ocurrir mientras se escribe.
export function serializeWrites(raw: RawSqlDatabase): SqlDatabase {
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    // Un fallo no debe bloquear a los que vienen detrás.
    queue = result.catch(() => {});
    return result;
  };

  return {
    getFirstAsync: (sql, params) => raw.getFirstAsync(sql, params),
    getAllAsync: (sql, params) => raw.getAllAsync(sql, params),
    execAsync: (sql) => enqueue(() => raw.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => raw.runAsync(sql, params)),
    // Dentro de la transacción se usa la conexión directa: ya tiene el turno, y pasar
    // otra vez por la cola la dejaría esperándose a sí misma.
    withTransactionAsync: (task) => enqueue(() => raw.withTransactionAsync(() => task(raw))),
  };
}
