import type { Profile, Session } from '@/domain/entities';
import type { AuthRepository } from '@/domain/repositories/auth-repository';
import type { ProfileRepository } from '@/domain/repositories/profile-repository';

export const testSession: Session = { userId: 'user-1', email: 'ana@example.com' };

export const testProfile: Profile = {
  id: 'user-1',
  username: 'ana',
  fullName: 'Ana López',
  avatarUrl: null,
  bio: null,
  isPrivate: false,
};

// Repositorios en memoria para probar la UI sin Supabase ni SQLite.
export function createFakeDependencies() {
  let session: Session | null | undefined;
  const listeners = new Set<(session: Session | null) => void>();

  // Simula lo que hace Supabase al leer la sesión guardada o al cambiarla.
  const setSession = (next: Session | null) => {
    session = next;
    listeners.forEach((listener) => listener(next));
  };

  const auth: AuthRepository = {
    onSessionChange(listener) {
      listeners.add(listener);
      if (session !== undefined) listener(session);
      return () => listeners.delete(listener);
    },
    signIn: async () => setSession(testSession),
    signUp: async () => {
      setSession(testSession);
      return { needsEmailConfirmation: false };
    },
    signOut: async () => setSession(null),
    isUsernameAvailable: async () => true,
  };

  const profiles: ProfileRepository = {
    watch(_userId, listener) {
      listener(testProfile);
      return () => {};
    },
    refresh: async () => {},
  };

  // Vuelve al estado de arranque: todavía no se sabe si hay sesión guardada.
  const resetSession = () => {
    session = undefined;
  };

  return { auth, profiles, setSession, resetSession };
}
