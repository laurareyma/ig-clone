// Qué hacer con una operación que falló al enviarse.
//
//   permanent  El servidor la recibió y la rechazó por algo que no va a cambiar (el post
//              ya no existe, la RLS no lo permite, el dato no es válido). Reintentar
//              daría el mismo error y bloquearía la cola: se descarta.
//   server     El servidor respondió pero no pudo atenderla ahora (saturado, tiempo
//              agotado, token caducado). Se reintenta, con un máximo de intentos.
//   network    No hubo respuesta (sin red, DNS, conexión cortada). No se sabe si llegó.
//              Se reintenta sin límite: estar mucho tiempo sin conexión no debe hacer
//              perder acciones.
export type FailureKind = 'permanent' | 'server' | 'network';

export function classifyError(error: unknown): FailureKind {
  const code = (error as { code?: unknown } | null)?.code;
  // Un fallo de fetch no trae código: supabase-js lo devuelve con code vacío.
  if (typeof code !== 'string' || code === '') return 'network';

  // PostgREST: errores propios de la API.
  if (code.startsWith('PGRST')) {
    // PGRST0xx: no pudo conectar con la base. PGRST3xx: problema con el token, que se
    // renueva solo.
    return code.startsWith('PGRST0') || code.startsWith('PGRST3') ? 'server' : 'permanent';
  }

  // Postgres (SQLSTATE), por clase:
  //   22 dato no válido, 23 restricción violada (clave foránea, check),
  //   42 permiso denegado o RLS (42501).
  return ['22', '23', '42'].includes(code.slice(0, 2)) ? 'permanent' : 'server';
}
