import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from '@/data/remote/database.types';
import { AuthError, type AuthErrorCode } from '@/domain/errors';
import type {
  AuthRepository,
  SignUpCredentials,
  SignUpResult,
} from '@/domain/repositories/auth-repository';
import type { Session } from '@/domain/entities';

const codes: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'email_taken',
  email_exists: 'email_taken',
  email_address_invalid: 'invalid_email',
  weak_password: 'weak_password',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
};

// Traduce los errores de Supabase a los del dominio para que nada fuera de data/
// dependa de sus códigos.
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  // El servidor no respondió: sin conexión o tiempo de espera agotado.
  if (isAuthRetryableFetchError(error)) return new AuthError('network', { cause: error });
  if (isAuthWeakPasswordError(error)) return new AuthError('weak_password', { cause: error });
  if (isAuthApiError(error)) {
    return new AuthError(codes[error.code ?? ''] ?? 'unknown', { cause: error });
  }
  return new AuthError('unknown', { cause: error });
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  onSessionChange(listener: (session: Session | null) => void): () => void {
    // Supabase emite INITIAL_SESSION al suscribirse, con la sesión leída del almacenamiento.
    // Los eventos se entregan en orden y esperando al anterior: el listener debe ser rápido.
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(session ? { userId: session.user.id, email: session.user.email ?? null } : null);
    });

    return () => data.subscription.unsubscribe();
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw toAuthError(error);
  }

  async signUp({ email, password, username }: SignUpCredentials): Promise<SignUpResult> {
    // El trigger handle_new_user crea el perfil con este username.
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      // El perfil se inserta en la misma transacción que el usuario. Si otro registro
      // tomó el username después de la comprobación previa, falla el trigger y Auth
      // responde con un error genérico; se vuelve a consultar para saber si fue eso.
      if (isAuthApiError(error) && error.code === 'unexpected_failure') {
        const stillFree = await this.isUsernameAvailable(username).catch(() => true);
        if (!stillFree) throw new AuthError('username_taken', { cause: error });
      }
      throw toAuthError(error);
    }

    // Con confirmación de correo activa, Supabase no revela que el correo ya existe:
    // devuelve un usuario falso sin identidades.
    if (data.user?.identities?.length === 0) throw new AuthError('email_taken');

    return { needsEmailConfirmation: data.session === null };
  }

  async signOut(): Promise<void> {
    // scope local: solo cierra la sesión de este dispositivo. El cliente borra la sesión
    // guardada aunque la petición falle (por ejemplo sin red), así que el error se ignora:
    // para el usuario la sesión quedó cerrada.
    await this.client.auth.signOut({ scope: 'local' });
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('is_username_available', {
      candidate: username,
    });
    // rpc() devuelve un error de PostgREST o de red, no uno de Auth.
    if (error) throw new AuthError('network', { cause: error });
    return data;
  }
}
