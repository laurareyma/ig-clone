import { FlashList } from '@shopify/flash-list';
import { Link, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { EmptyState } from '@/presentation/components/empty-state';
import { Icon } from '@/presentation/components/icon';
import { OfflineBanner } from '@/presentation/components/offline-banner';
import { PostCard } from '@/presentation/components/post-card';
import { ThemedView } from '@/presentation/components/themed-view';
import { useFeed } from '@/presentation/hooks/use-feed';
import { Spacing } from '@/presentation/theme';

export function FeedScreen() {
  const { posts, refreshing, loadingMore, offline, refresh, loadMore } = useFeed('home');

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Inicio',
          headerRight: () => (
            <Link href="/create-post" asChild>
              <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel="Nueva publicación">
                <Icon name="plus" />
              </Pressable>
            </Link>
          ),
        }}
      />
      {offline && <OfflineBanner />}
      {posts === undefined ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        // FlashList recicla las celdas: al hacer scroll reutiliza las vistas que salen de
        // pantalla en vez de crear y destruir una por publicación, así que la memoria no
        // crece con el largo de la lista.
        <FlashList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} />}
          refreshing={refreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState message="Aún no hay publicaciones. Busca a alguien en Explorar o publica la primera." />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} /> : null}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  loading: {
    flex: 1,
  },
  footer: {
    padding: Spacing.three,
  },
});
