import { AuthError } from '@/domain/errors';
import type {
  AuthRepository,
  SignUpCredentials,
  SignUpResult,
} from '@/domain/repositories/auth-repository';

// Mismas reglas que el check de profiles.username en la base.
const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new AuthError('invalid_email');
  return normalized;
}

export async function signIn(
  auth: AuthRepository,
  input: { email: string; password: string },
): Promise<void> {
  const email = normalizeEmail(input.email);
  // Sin contraseña no hay nada que consultar; el mensaje es el mismo que el del servidor.
  if (!input.password) throw new AuthError('invalid_credentials');

  await auth.signIn(email, input.password);
}

export async function signUp(auth: AuthRepository, input: SignUpCredentials): Promise<SignUpResult> {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new AuthError('invalid_username');

  const email = normalizeEmail(input.email);
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new AuthError('weak_password');

  // Se comprueba antes de crear la cuenta para no dejar un usuario sin perfil a medias.
  if (!(await auth.isUsernameAvailable(username))) throw new AuthError('username_taken');

  return auth.signUp({ email, password: input.password, username });
}
