import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import type { Profile } from '@/domain/entities';
import { EmptyState } from '@/presentation/components/empty-state';
import { ThemedView } from '@/presentation/components/themed-view';
import { UserRow } from '@/presentation/components/user-row';
import { useDependencies } from '@/presentation/dependencies';

type Props = { userId: string; kind: 'followers' | 'following' };

export function FollowListScreen({ userId, kind }: Props) {
  const { profiles } = useDependencies();
  const [state, setState] = useState<{ key: string; users: Profile[] }>();
  const key = `${kind}:${userId}`;

  useEffect(() => {
    let active = true;
    const request =
      kind === 'followers' ? profiles.listFollowers(userId) : profiles.listFollowing(userId);

    request.then(
      (users) => active && setState({ key: `${kind}:${userId}`, users }),
      () => active && setState({ key: `${kind}:${userId}`, users: [] }),
    );

    return () => {
      active = false;
    };
  }, [profiles, userId, kind]);

  const users = state?.key === key ? state.users : undefined;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: kind === 'followers' ? 'Seguidores' : 'Seguidos' }} />
      {users === undefined ? (
        <ActivityIndicator style={styles.fill} />
      ) : (
        <FlashList
          data={users}
          keyExtractor={(profile) => profile.id}
          renderItem={({ item }) => <UserRow profile={item} />}
          // En una cuenta privada que no sigues, el servidor devuelve la lista vacía.
          ListEmptyComponent={<EmptyState message="No hay usuarios que mostrar." />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
