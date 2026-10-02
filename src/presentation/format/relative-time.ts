// "ahora", "5 min", "3 h", "2 d", "4 sem" o la fecha si es más antigua.
export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  // Postgres envía microsegundos (6 decimales) y no todos los motores de JavaScript
  // aceptan más de 3 al interpretar la fecha.
  const date = new Date(isoDate.replace(/(\.\d{3})\d+/, '$1'));
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d`;
  if (seconds < 28 * 86400) return `${Math.floor(seconds / (7 * 86400))} sem`;

  return date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

// 1234 -> "1.234"; de 10.000 en adelante se abrevia: "12,3 mil", "1,2 M".
export function formatCount(count: number): string {
  if (count < 10_000) return count.toLocaleString('es');
  if (count < 1_000_000) return `${(count / 1000).toFixed(1).replace('.0', '').replace('.', ',')} mil`;
  return `${(count / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} M`;
}
