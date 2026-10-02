import type { Profile } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';

export interface ProfileRepository {
  // Entrega el perfil guardado en el dispositivo (null si aún no hay) y vuelve a
  // entregarlo cada vez que cambia. Nunca espera a la red.
  watch(userId: string, listener: (profile: Profile | null) => void): Unsubscribe;
  // Trae el perfil del servidor y lo guarda en el dispositivo; watch() lo notifica.
  refresh(userId: string): Promise<void>;
}
