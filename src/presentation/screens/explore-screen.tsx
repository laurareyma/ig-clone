import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import type { Profile } from '@/domain/entities';
import { EmptyState } from '@/presentation/components/empty-state';
import { PostGrid } from '@/presentation/components/post-grid';
import { ThemedView } from '@/presentation/components/themed-view';
import { UserRow } from '@/presentation/components/user-row';
import { useDependencies } from '@/presentation/dependencies';
import { useFeed } from '@/presentation/hooks/use-feed';
import { useTheme } from '@/presentation/hooks/use-theme';
import { Spacing } from '@/presentation/theme';

const SEARCH_DELAY_MS = 300;

export function ExploreScreen() {
  const { profiles } = useDependencies();
  const theme = useTheme();
  const feed = useFeed('explore');
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ query: string; profiles: Profile[] }>();
  const query = text.trim();

  useEffect(() => {
    if (!query) return;

    // Se espera a que el usuario deje de escribir para no lanzar una consulta por tecla,
    // y se descarta la respuesta si mientras tanto cambió el texto.
    let active = true;
    const timer = setTimeout(() => {
      profiles.search(query).then(
        (result) => active && setFound({ query, profiles: result }),
        () => active && setFound({ query, profiles: [] }),
      );
    }, SEARCH_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profiles, query]);

  // Los resultados guardados solo valen si son de lo que hay escrito ahora.
  const results = found?.query === query ? found.profiles : undefined;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Explorar' }} />
      <View style={styles.search}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Buscar usuarios"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Buscar usuarios"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </View>

      {query ? (
        results === undefined ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <FlashList
            data={results}
            keyExtractor={(profile) => profile.id}
            renderItem={({ item }) => <UserRow profile={item} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState message={`No hay usuarios que empiecen por "${query}".`} />}
          />
        )
      ) : (
        <PostGrid
          posts={feed.posts ?? []}
          empty={
            feed.posts === undefined ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <EmptyState message="Todavía no hay publicaciones públicas." />
            )
          }
          refreshing={feed.refreshing}
          loadingMore={feed.loadingMore}
          onRefresh={feed.refresh}
          onEndReached={feed.loadMore}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  search: {
    padding: Spacing.two,
  },
  input: {
    fontSize: 16,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  loading: {
    padding: Spacing.five,
  },
});
