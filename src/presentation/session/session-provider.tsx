import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import type { Session } from '@/domain/entities';
import { useDependencies } from '@/presentation/dependencies';

type SessionState = {
  session: Session | null;
  // true hasta que se lee la sesión guardada en el dispositivo.
  isLoading: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const { auth } = useDependencies();
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(
    () =>
      auth.onSessionChange((next) => {
        setState((previous) =>
          // El token se renueva cada hora y vuelve a emitir la misma sesión: se conserva
          // el objeto anterior para no volver a renderizar toda la app.
          !previous.isLoading && previous.session?.userId === next?.userId
            ? previous
            : { session: next, isLoading: false },
        );
      }),
    [auth],
  );

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return value;
}

// Para pantallas que solo existen con sesión abierta (las protege el layout raíz).
export function useCurrentUserId(): string {
  const { session } = useSession();
  if (!session) throw new Error('Esta pantalla requiere una sesión abierta');
  return session.userId;
}
