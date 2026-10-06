import { resolveIncomingLink } from '@/presentation/navigation/incoming-link';
import { rememberIncomingLink } from '@/presentation/navigation/pending-link';

// Expo Router llama a esta función con cada enlace que abre la app desde fuera (con la
// app cerrada o ya abierta), antes de resolver la ruta. Se ejecuta fuera de React: no
// debe lanzar errores. Qué se hace con cada enlace: ver incoming-link.ts.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const resolved = resolveIncomingLink(path);
    // Por si no hay sesión: se retoma después del login.
    rememberIncomingLink(resolved);
    return resolved;
  } catch {
    return path;
  }
}
