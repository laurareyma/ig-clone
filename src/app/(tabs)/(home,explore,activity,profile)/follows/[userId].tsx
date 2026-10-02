import { useLocalSearchParams } from 'expo-router';

import { FollowListScreen } from '@/presentation/screens/follow-list-screen';

export default function FollowsRoute() {
  const { userId, kind } = useLocalSearchParams<{ userId: string; kind?: string }>();

  return <FollowListScreen userId={userId} kind={kind === 'following' ? 'following' : 'followers'} />;
}
