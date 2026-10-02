import { resolveIncomingLink } from '@/presentation/navigation/incoming-link';

// Expo Router llama a esta función con cada enlace que abre la app desde fuera,
// antes de resolver la ruta. Se ejecuta fuera de React: no debe lanzar errores.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return resolveIncomingLink(path);
  } catch {
    return path;
  }
}
