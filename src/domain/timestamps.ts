// Milisegundos de una fecha ISO. Postgres envía microsegundos (6 decimales) y no todos
// los motores de JavaScript aceptan más de 3, así que se recortan antes de interpretar.
export function toMillis(isoDate: string): number {
  return new Date(isoDate.replace(/(\.\d{3})\d+/, '$1')).getTime();
}
