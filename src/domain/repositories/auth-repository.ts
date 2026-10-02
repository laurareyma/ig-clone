import type { Session } from '@/domain/entities';

export type Unsubscribe = () => void;

export type SignUpCredentials = {
  email: string;
  password: string;
  username: string;
};

export type SignUpResult = {
  // true si el servidor exige confirmar el correo antes de abrir sesión.
  needsEmailConfirmation: boolean;
};

// Los métodos rechazan con AuthError.
export interface AuthRepository {
  // Llama al listener con la sesión guardada en cuanto se conoce y después en cada cambio.
  onSessionChange(listener: (session: Session | null) => void): Unsubscribe;
  signIn(email: string, password: string): Promise<void>;
  signUp(credentials: SignUpCredentials): Promise<SignUpResult>;
  signOut(): Promise<void>;
  isUsernameAvailable(username: string): Promise<boolean>;
}
