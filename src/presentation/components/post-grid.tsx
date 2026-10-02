import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import type { Post } from '@/domain/entities';
import { CachedImage } from '@/presentation/components/cached-image';
import { Spacing } from '@/presentation/theme';

const COLUMNS = 3;

type Props = {
  posts: Post[];
  header?: ReactElement;
  empty?: ReactElement;
  refreshing: boolean;
  loadingMore: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
};

function Tile({ post }: { post: Post }) {
  return (
    <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
      <Pressable style={styles.tile} accessibilityRole="link">
        <CachedImage
          image={{ bucket: 'media', path: post.imagePath }}
          aspectRatio={1}
          accessibilityLabel={`Publicación de ${post.author.username}`}
        />
      </Pressable>
    </Link>
  );
}

// Cuadrícula de miniaturas del perfil y de Explorar.
export function PostGrid({
  posts,
  header,
  empty,
  refreshing,
  loadingMore,
  onRefresh,
  onEndReached,
}: Props) {
  return (
    <FlashList
      data={posts}
      numColumns={COLUMNS}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <Tile post={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} /> : null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: StyleSheet.hairlineWidth,
  },
  footer: {
    padding: Spacing.three,
  },
});
