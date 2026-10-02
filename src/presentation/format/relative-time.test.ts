import { formatCount, formatRelativeTime } from '@/presentation/format/relative-time';

const now = new Date('2026-06-15T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
  it.each([
    [10, 'ahora'],
    [5 * 60, '5 min'],
    [3 * 3600 + 120, '3 h'],
    [2 * 86400, '2 d'],
    [15 * 86400, '2 sem'],
  ])('hace %i segundos => "%s"', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });

  it('acepta el formato de fecha de Postgres', () => {
    expect(formatRelativeTime('2026-06-15T11:29:59.123456+00:00', now)).toBe('30 min');
  });

  it('una fecha futura (reloj del dispositivo atrasado) se muestra como "ahora"', () => {
    expect(formatRelativeTime(ago(-300), now)).toBe('ahora');
  });

  it('pasado un mes muestra la fecha', () => {
    expect(formatRelativeTime(ago(60 * 86400), now)).toMatch(/2026/);
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [12_300, '12,3 mil'],
    [15_000, '15 mil'],
    [1_250_000, '1,3 M'],
  ])('%i => "%s"', (count, expected) => {
    expect(formatCount(count)).toBe(expected);
  });
});
