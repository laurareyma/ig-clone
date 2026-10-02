import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildCommentThreads } from '@/domain/comment-threads';
import type { Comment } from '@/domain/entities';
import { addComment, MAX_TEXT_LENGTH } from '@/domain/usecases/posts';
import { Avatar } from '@/presentation/components/avatar';
import { EmptyState } from '@/presentation/components/empty-state';
import { PostCard } from '@/presentation/components/post-card';
import { SyncBanner } from '@/presentation/components/sync-banner';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useDependencies } from '@/presentation/dependencies';
import { formatRelativeTime } from '@/presentation/format/relative-time';
import { useComments, usePost } from '@/presentation/hooks/use-post';
import { useTheme } from '@/presentation/hooks/use-theme';
import { Spacing } from '@/presentation/theme';

type Row = { comment: Comment; isReply: boolean };

function CommentRow({ comment, isReply, onReply }: Row & { onReply: (comment: Comment) => void }) {
  return (
    <View style={[styles.comment, isReply && styles.reply]}>
      <Avatar profile={comment.author} size={isReply ? 24 : 32} />
      <View style={styles.commentBody}>
        <ThemedText type="small">
          <ThemedText type="smallBold">{comment.author.username} </ThemedText>
          {comment.body}
        </ThemedText>
        <View style={styles.commentMeta}>
          <ThemedText type="code" themeColor="textSecondary">
            {comment.pending ? 'Enviando…' : formatRelativeTime(comment.createdAt)}
          </ThemedText>
          <Pressable onPress={() => onReply(comment)} hitSlop={8} accessibilityRole="button">
            <ThemedText type="code" themeColor="textSecondary">
              Responder
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function PostScreen({ postId }: { postId: string }) {
  const { comments: repository } = useDependencies();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const post = usePost(postId);
  const comments = useComments(postId);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  // Hilos de un nivel: cada comentario seguido de sus respuestas, con sangría.
  const rows: Row[] = buildCommentThreads(comments).flatMap((thread) => [
    { comment: thread.comment, isReply: false },
    ...thread.replies.map((reply) => ({ comment: reply, isReply: true })),
  ]);

  async function send() {
    const body = draft;
    const parentId = replyTo?.id ?? null;
    setDraft('');
    setReplyTo(null);

    try {
      // Solo guarda en el dispositivo (comentario + operación en la cola), así que no
      // depende de la red: sin conexión aparece igual, marcado como "Enviando…".
      await addComment(repository, { postId, body, parentId });
    } catch {
      // Texto no válido o fallo al escribir en la base local.
      setDraft(body);
      Alert.alert('No se pudo guardar el comentario', 'Inténtalo de nuevo.');
    }
  }

  if (post === undefined) {
    return (
      <ThemedView style={styles.fill}>
        <Stack.Screen options={{ title: 'Publicación' }} />
        <ActivityIndicator style={styles.fill} />
      </ThemedView>
    );
  }

  if (post === null) {
    return (
      <ThemedView style={styles.fill}>
        <Stack.Screen options={{ title: 'Publicación' }} />
        <EmptyState message="Esta publicación no está disponible. Puede que se haya borrado o que sea de una cuenta privada." />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Publicación' }} />
      <SyncBanner />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // La pantalla empieza debajo de la cabecera; sin este desfase el teclado taparía
        // esa misma altura del campo de texto.
        keyboardVerticalOffset={headerHeight}>
        <FlashList
          data={rows}
          keyExtractor={(row) => row.comment.id}
          renderItem={({ item }) => <CommentRow {...item} onReply={setReplyTo} />}
          ListHeaderComponent={<PostCard post={post} showCommentsLink={false} />}
          keyboardShouldPersistTaps="handled"
        />

        <View
          style={[
            styles.composer,
            { borderTopColor: theme.backgroundSelected, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {replyTo && (
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button">
              <ThemedText type="code" themeColor="textSecondary">
                Respondiendo a {replyTo.author.username} · Cancelar
              </ThemedText>
            </Pressable>
          )}
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Añade un comentario…"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Comentario"
              maxLength={MAX_TEXT_LENGTH}
              multiline
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Pressable
              onPress={send}
              disabled={draft.trim().length === 0}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Publicar comentario">
              <ThemedText
                type="linkPrimary"
                style={draft.trim().length === 0 && styles.disabled}>
                Publicar
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  comment: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  reply: {
    paddingLeft: Spacing.three + 32 + Spacing.two,
  },
  commentBody: {
    flex: 1,
    gap: Spacing.half,
  },
  commentMeta: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  composer: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    fontSize: 15,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
});
