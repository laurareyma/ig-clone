import { useEffect, useState } from 'react';

import type { ProfileDetails } from '@/domain/entities';
import { useDependencies } from '@/presentation/dependencies';

// undefined = todavía no se ha leído la base local; null = el perfil no existe.
export function useProfileDetails(userId: string): ProfileDetails | null | undefined {
  const { profiles } = useDependencies();
  const [state, setState] = useState<{
    userId: string;
    details: ProfileDetails | null;
    confirmed: boolean;
  }>();

  useEffect(() => {
    let confirmed = false;
    const unsubscribe = profiles.watchDetails(userId, (details) =>
      setState({ userId, details, confirmed }),
    );

    profiles
      .refreshDetails(userId)
      .catch(() => {})
      .finally(() => {
        confirmed = true;
        setState((current) => (current?.userId === userId ? { ...current, confirmed } : current));
      });

    return unsubscribe;
  }, [profiles, userId]);

  if (state?.userId !== userId) return undefined;
  return state.details ?? (state.confirmed ? null : undefined);
}
