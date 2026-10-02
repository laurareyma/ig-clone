import {
  DarkTheme,
  DefaultTheme,
  router,
  SplashScreen,
  Stack,
  ThemeProvider,
  type Href,
} from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { container } from '@/di/container';
import { DependenciesProvider } from '@/presentation/dependencies';
import { sessionChanged } from '@/presentation/navigation/pending-link';
import { MessagingConnection } from '@/presentation/session/messaging-connection';
import { SessionProvider, useSession } from '@/presentation/session/session-provider';

// La pantalla de carga nativa se queda hasta saber si hay sesión guardada, para no
// mostrar el login un instante a quien ya había entrado.
SplashScreen.preventAutoHideAsync();

// Las pestañas son la base de la pila raíz: un deep link a un modal las deja debajo.
export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <DependenciesProvider value={container}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </DependenciesProvider>
  );
}

// Todo lo que debe cubrir la barra de pestañas (login, crear post, historias) se declara
// aquí y no dentro de (tabs).
function RootNavigator() {
  const scheme = useColorScheme();
  const { session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  const signedIn = session !== null;
  useEffect(() => {
    if (isLoading) return;
    // Enlace con el que se abrió la app antes de iniciar sesión.
    const link = sessionChanged(signedIn);
    if (link) router.push(link as Href);
  }, [isLoading, signedIn]);

  // Sin navegador montado, un deep link espera a que se sepa si hay sesión en vez de
  // rebotar contra la guardia.
  if (isLoading) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {session && <MessagingConnection />}
      <Stack>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="messages" options={{ headerShown: false }} />
          <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="story/[userId]"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
        </Stack.Protected>

        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
