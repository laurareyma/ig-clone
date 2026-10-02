export type SqlValue = string | number | null;

// Lo mínimo que la capa de datos necesita de SQLite. La base de expo-sqlite lo cumple
// tal cual; las pruebas usan otra implementación sobre el SQLite de Node.
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
