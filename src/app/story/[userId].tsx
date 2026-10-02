import { useLocalSearchParams } from 'expo-router';

import { StoryViewerScreen } from '@/presentation/screens/story-viewer-screen';

// Visor de las historias activas de un usuario.
export default function StoryRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();

  return <StoryViewerScreen userId={userId} />;
}
