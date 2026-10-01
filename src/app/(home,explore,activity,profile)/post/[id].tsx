import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

// Destino del deep link instagramclone://post/{uuid}
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <PlaceholderScreen title="Publicación" detail={id} />;
}
