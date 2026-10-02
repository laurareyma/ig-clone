import { createURL } from 'expo-linking';
import { Link } from 'expo-router';
import { memo } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import type { Post } from '@/domain/entities';
import { Avatar } from '@/presentation/components/avatar';
import { CachedImage } from '@/presentation/components/cached-image';
import { Icon } from '@/presentation/components/icon';
import { ThemedText } from '@/presentation/components/themed-text';
import { useDependencies } from '@/presentation/dependencies';
import { formatCount, formatRelativeTime } from '@/presentation/format/relative-time';
import { Spacing } from '@/presentation/theme';

const LIKED_COLOR = '#ed4956';

// Igual que Instagram: ni más alta que 4:5 ni más ancha que 1,91:1, para que una imagen
// muy alargada no ocupe varias pantallas.
function clampAspectRatio(width: number, height: number): number {
  return Math.min(1.91, Math.max(0.8, width / height));
}

type Props = {
  post: Post;
  // En la pantalla de la publicación ya se ven los comentarios debajo.
  showCommentsLink?: boolean;
};

function PostCardImpl({ post, showCommentsLink = true }: Props) {
  const { posts } = useDependencies();
  const postHref = { pathname: '/post/[id]', params: { id: post.id } } as const;

  function toggleLike() {
    // El repositorio actualiza la base local al instante y deshace el cambio si el
    // servidor lo rechaza, así que aquí no hay estado ni nada que revertir.
    posts.setLiked(post.id, !post.likedByMe).catch(() => {});
  }

  function share() {
    // createURL usa el esquema de la app (instagramclone://) o el de Expo Go en desarrollo.
    void Share.share({ message: createURL(`/post/${post.id}`) });
  }

  return (
    <View style={styles.card}>
      <Link href={{ pathname: '/user/[id]', params: { id: post.author.id } }} asChild>
        <Pressable style={styles.header} accessibilityRole="link">
          <Avatar profile={post.author} size={32} />
          <ThemedText type="smallBold">{post.author.username}</ThemedText>
        </Pressable>
      </Link>

      <CachedImage
        image={{ bucket: 'media', path: post.imagePath }}
        aspectRatio={clampAspectRatio(post.imageWidth, post.imageHeight)}
        accessibilityLabel={`Publicación de ${post.author.username}`}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={toggleLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? 'Quitar me gusta' : 'Me gusta'}
          accessibilityState={{ selected: post.likedByMe }}>
          <Icon
            name={post.likedByMe ? 'heartFilled' : 'heart'}
            color={post.likedByMe ? LIKED_COLOR : undefined}
          />
        </Pressable>
        <Link href={postHref} asChild>
          <Pressable hitSlop={8} accessibilityRole="link" accessibilityLabel="Comentar">
            <Icon name="comment" />
          </Pressable>
        </Link>
        <Pressable onPress={share} hitSlop={8} accessibilityRole="button" accessibilityLabel="Compartir">
          <Icon name="share" />
        </Pressable>
      </View>

      <View style={styles.body}>
        <ThemedText type="smallBold">{formatCount(post.likesCount)} Me gusta</ThemedText>
        {post.caption.length > 0 && (
          <ThemedText type="small">
            <ThemedText type="smallBold">{post.author.username} </ThemedText>
            {post.caption}
          </ThemedText>
        )}
        {showCommentsLink && post.commentsCount > 0 && (
          <Link href={postHref}>
            <ThemedText type="small" themeColor="textSecondary">
              {post.commentsCount === 1
                ? 'Ver 1 comentario'
                : `Ver los ${formatCount(post.commentsCount)} comentarios`}
            </ThemedText>
          </Link>
        )}
        <ThemedText type="code" themeColor="textSecondary">
          {formatRelativeTime(post.createdAt)}
        </ThemedText>
      </View>
    </View>
  );
}

// use-feed.ts conserva el mismo objeto `post` mientras sus datos no cambien, así que la
// comparación por referencia de memo basta para saltarse las tarjetas intactas.
export const PostCard = memo(PostCardImpl);

const styles = StyleSheet.create({
  card: {
    paddingBottom: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + Spacing.half,
  },
  body: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
