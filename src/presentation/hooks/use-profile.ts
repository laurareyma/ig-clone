import { useEffect, useState } from 'react';

import type { Profile } from '@/domain/entities';
import { useDependencies } from '@/presentation/dependencies';

// Devuelve lo guardado en el dispositivo de inmediato y se actualiza cuando llega
// la versión del servidor. undefined = todavía no se ha leído la base local.
export function useProfile(userId: string): Profile | null | undefined {
  const { profiles } = useDependencies();
  const [state, setState] = useState<{ userId: string; profile: Profile | null }>();

  useEffect(() => {
    const unsubscribe = profiles.watch(userId, (profile) => setState({ userId, profile }));
    // Sin conexión no pasa nada: la pantalla se queda con lo que ya había en local.
    profiles.refresh(userId).catch(() => {});
    return unsubscribe;
  }, [profiles, userId]);

  // Descarta el perfil de otro usuario mientras llega el del nuevo.
  return state?.userId === userId ? state.profile : undefined;
}
