import { useLocalSearchParams } from 'expo-router';

import { PostScreen } from '@/presentation/screens/post-screen';

// Destino del deep link instagramclone://post/{uuid}
export default function PostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <PostScreen postId={id} />;
}
