import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

// Visor de las historias activas de un usuario.
export default function StoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();

  return <PlaceholderScreen title="Historia" detail={userId} closable />;
}
