export type AuthErrorCode =
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_username'
  | 'username_taken'
  | 'email_taken'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'unknown';

// El dominio habla en códigos; el texto que ve el usuario lo decide la capa de presentación.
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'AuthError';
  }
}
