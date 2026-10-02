import type { ProfileDetails } from '@/domain/entities';

// Decide qué pinta la UI. No es la medida de seguridad: quien no puede ver el contenido
// tampoco lo recibe, porque la RLS del servidor aplica esta misma regla.
export function canViewContent(details: ProfileDetails): boolean {
  return (
    !details.profile.isPrivate ||
    details.followStatus === 'self' ||
    details.followStatus === 'accepted'
  );
}
