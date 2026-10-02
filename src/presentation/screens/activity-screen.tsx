import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import type { Profile } from '@/domain/entities';
import { Button } from '@/presentation/components/button';
import { EmptyState } from '@/presentation/components/empty-state';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { UserRow } from '@/presentation/components/user-row';
import { useDependencies } from '@/presentation/dependencies';
import { Spacing } from '@/presentation/theme';

// Solicitudes de seguimiento pendientes de una cuenta privada.
export function ActivityScreen() {
  const { profiles } = useDependencies();
  const [requests, setRequests] = useState<Profile[]>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests(await profiles.listFollowRequests());
    } catch {
      setRequests((current) => current ?? []);
    }
  }, [profiles]);

  // Se recarga cada vez que la pestaña vuelve a primer plano.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function respond(follower: Profile, accept: boolean) {
    // Se quita de la lista al momento; si el servidor falla, se vuelve a cargar.
    setRequests((current) => current?.filter((profile) => profile.id !== follower.id));
    try {
      await profiles.respondToFollowRequest(follower.id, accept);
    } catch {
      Alert.alert('No se pudo responder a la solicitud', 'Revisa tu conexión e inténtalo de nuevo.');
      void load();
    }
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Actividad' }} />
      {requests === undefined ? (
        <ActivityIndicator style={styles.fill} />
      ) : (
        <FlashList
          data={requests}
          keyExtractor={(profile) => profile.id}
          refreshing={refreshing}
          onRefresh={refresh}
          ListHeaderComponent={
            requests.length > 0 ? (
              <ThemedText type="smallBold" style={styles.title}>
                Solicitudes de seguimiento
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <UserRow profile={item}>
              <Button label="Aceptar" compact onPress={() => respond(item, true)} />
              <Button label="Rechazar" variant="secondary" compact onPress={() => respond(item, false)} />
            </UserRow>
          )}
          ListEmptyComponent={<EmptyState message="No tienes solicitudes de seguimiento pendientes." />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  title: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
