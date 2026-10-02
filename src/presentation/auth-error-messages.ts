import { AuthError, type AuthErrorCode } from '@/domain/errors';
import { MIN_PASSWORD_LENGTH } from '@/domain/usecases/auth';

const messages: Record<AuthErrorCode, string> = {
  invalid_email: 'Escribe un correo válido.',
  weak_password: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  invalid_username:
    'El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto o guion bajo.',
  username_taken: 'Ese nombre de usuario ya está en uso.',
  email_taken: 'Ya existe una cuenta con ese correo.',
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
  rate_limited: 'Demasiados intentos. Espera un momento y vuelve a probar.',
  network: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
  unknown: 'Algo salió mal. Inténtalo de nuevo.',
};

export function authErrorMessage(error: unknown): string {
  return messages[error instanceof AuthError ? error.code : 'unknown'];
}
