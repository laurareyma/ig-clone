// Declaración mínima del SQLite integrado en Node. Evita añadir @types/node al
// proyecto, que metería los globales de Node en el código de la app.
declare module 'node:sqlite' {
  type Value = string | number | null;

  class StatementSync {
    run(...params: Value[]): unknown;
    get(...params: Value[]): unknown;
    all(...params: Value[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
