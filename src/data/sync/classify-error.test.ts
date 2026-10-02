import { classifyError } from '@/data/sync/classify-error';

describe('classifyError', () => {
  it.each([
    ['23503', 'clave foránea: el post ya no existe'],
    ['23514', 'check: comentario vacío o demasiado largo'],
    ['42501', 'RLS: ya no tiene permiso para verlo'],
    ['22P02', 'dato con formato no válido'],
    ['PGRST116', 'la API rechazó la petición'],
  ])('%s (%s) es permanente', (code) => {
    expect(classifyError({ code, message: 'x' })).toBe('permanent');
  });

  it.each<[unknown, string]>([
    [{ code: 'PGRST301', message: 'JWT expired' }, 'token caducado'],
    [{ code: 'PGRST002', message: 'Could not query the database' }, 'base no disponible'],
    [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'tiempo agotado'],
    [{ code: '53300', message: 'too many connections' }, 'servidor saturado'],
    [{ code: '40001', message: 'could not serialize access' }, 'conflicto de concurrencia'],
  ])('%p (%s) es un fallo del servidor', (error) => {
    expect(classifyError(error)).toBe('server');
  });

  it.each<[unknown, string]>([
    [new TypeError('Network request failed'), 'sin red'],
    [{ code: '', message: 'TypeError: fetch failed' }, 'sin red, tal como lo devuelve supabase-js'],
    [new Error('No hay sesión abierta'), 'sesión aún no cargada'],
    [null, 'error desconocido'],
  ])('%p (%s) es un fallo de red', (error) => {
    expect(classifyError(error)).toBe('network');
  });
});
