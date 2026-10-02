import type { Profile, ProfileDetails } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';

export interface ProfileRepository {
  // Entrega el perfil guardado en el dispositivo (null si aún no hay) y vuelve a
  // entregarlo cada vez que cambia. Nunca espera a la red.
  watch(userId: string, listener: (profile: Profile | null) => void): Unsubscribe;
  // Trae el perfil del servidor y lo guarda en el dispositivo; watch() lo notifica.
  refresh(userId: string): Promise<void>;

  // Perfil con contadores y la relación del usuario actual con él.
  watchDetails(userId: string, listener: (details: ProfileDetails | null) => void): Unsubscribe;
  refreshDetails(userId: string): Promise<void>;

  // En una cuenta privada crea una solicitud pendiente; lo decide el servidor.
  follow(userId: string): Promise<void>;
  // También cancela una solicitud pendiente.
  unfollow(userId: string): Promise<void>;
  setPrivate(isPrivate: boolean): Promise<void>;

  // Las siguientes consultan siempre al servidor: no tienen copia local.
  search(query: string): Promise<Profile[]>;
  listFollowRequests(): Promise<Profile[]>;
  respondToFollowRequest(followerId: string, accept: boolean): Promise<void>;
  // Vacías si la cuenta es privada y el usuario actual no la sigue.
  listFollowers(userId: string): Promise<Profile[]>;
  listFollowing(userId: string): Promise<Profile[]>;
}
