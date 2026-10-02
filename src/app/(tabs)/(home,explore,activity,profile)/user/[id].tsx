import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/presentation/screens/profile-screen';

export default function UserRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ProfileScreen userId={id} />;
}
