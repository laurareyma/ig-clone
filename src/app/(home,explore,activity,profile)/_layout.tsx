import { Stack } from 'expo-router';

// Este layout se instancia una vez por pestaña, así que cada una tiene su propia pila.
// `anchor` es la pantalla raíz de cada pila: un deep link a /post/{id} la deja debajo
// para que el botón "atrás" tenga a dónde volver.
export const unstable_settings = {
  anchor: 'index',
  explore: { anchor: 'explore' },
  activity: { anchor: 'activity' },
  profile: { anchor: 'profile' },
};

export default function TabStackLayout() {
  return <Stack />;
}
