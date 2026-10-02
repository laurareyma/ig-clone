import { FlashList } from '@shopify/flash-list';
import { Link, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/presentation/components/empty-state';
import { Icon } from '@/presentation/components/icon';
import { PostCard } from '@/presentation/components/post-card';
import { SyncBanner } from '@/presentation/components/sync-banner';
import { UnreadBadge } from '@/presentation/components/unread-badge';
import { ThemedView } from '@/presentation/components/themed-view';
import { useFeed } from '@/presentation/hooks/use-feed';
import { useInbox } from '@/presentation/hooks/use-messages';
import { Spacing } from '@/presentation/theme';

export function FeedScreen() {
  const { posts, refreshing, loadingMore, refresh, loadMore } = useFeed('home');
  const unread = useInbox().unreadTotal;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          title: 'Inicio',
          headerRight: () => (
            <View style={styles.headerActions}>
              <Link href="/create-post" asChild>
                <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel="Nueva publicación">
                  <Icon name="plus" />
                </Pressable>
              </Link>
              <Link href="/messages" asChild>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={
                    unread > 0 ? `Mensajes, ${unread} sin leer` : 'Mensajes'
                  }>
                  <Icon name="messages" />
                  {unread > 0 && <UnreadBadge count={unread} style={styles.badge} />}
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
      <SyncBanner />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
  },
});
