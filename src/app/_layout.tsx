import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

// Las pestañas son la base de la pila raíz: un deep link a un modal las deja debajo.
export const unstable_settings = {
  anchor: '(tabs)',
};

// Todo lo que debe cubrir la barra de pestañas (login, crear post, historias) se declara
// aquí y no dentro de (tabs).
export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="story/[userId]"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
