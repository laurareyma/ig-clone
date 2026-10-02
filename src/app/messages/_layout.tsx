import { Stack } from 'expo-router';

// Los mensajes viven fuera de las pestañas: el chat ocupa toda la pantalla, sin la barra
// inferior.
export const unstable_settings = {
  anchor: 'index',
};

export default function MessagesLayout() {
  return <Stack />;
}
