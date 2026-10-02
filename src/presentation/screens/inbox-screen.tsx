import { FlashList } from '@shopify/flash-list';
import { Link, Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { Conversation } from '@/domain/entities';
import { Avatar } from '@/presentation/components/avatar';
import { EmptyState } from '@/presentation/components/empty-state';
import { SyncBanner } from '@/presentation/components/sync-banner';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { UnreadBadge } from '@/presentation/components/unread-badge';
import { formatRelativeTime } from '@/presentation/format/relative-time';
import { useInbox } from '@/presentation/hooks/use-messages';
import { useCurrentUserId } from '@/presentation/session/session-provider';
import { Spacing } from '@/presentation/theme';

function ConversationRow({ conversation, me }: { conversation: Conversation; me: string }) {
  const { otherUser, lastMessage, unreadCount } = conversation;
  const unread = unreadCount > 0;

  return (
    <Link
      href={{ pathname: '/messages/[conversationId]', params: { conversationId: conversation.id } }}
      asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <Avatar profile={otherUser} size={52} />
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {otherUser.username}
          </ThemedText>
          {lastMessage && (
            <ThemedText
              type={unread ? 'smallBold' : 'small'}
              themeColor={unread ? 'text' : 'textSecondary'}
              numberOfLines={1}>
              {lastMessage.senderId === me ? 'Tú: ' : ''}
              {lastMessage.body}
              {' · '}
              {lastMessage.pending ? 'Enviando…' : formatRelativeTime(lastMessage.createdAt)}
            </ThemedText>
          )}
        </View>
        {unread && <UnreadBadge count={unreadCount} />}
      </Pressable>
    </Link>
  );
}

export function InboxScreen() {
  const me = useCurrentUserId();
  const { conversations, refreshing, refresh } = useInbox();

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Mensajes' }} />
      <SyncBanner />
      {conversations === undefined ? (
        <ActivityIndicator style={styles.fill} />
      ) : (
        // El orden viene de la base local (último mensaje primero): cuando llega un
        // mensaje por tiempo real, la consulta se repite y la conversación sube sola.
        <FlashList
          data={conversations}
          keyExtractor={(conversation) => conversation.id}
          renderItem={({ item }) => <ConversationRow conversation={item} me={me} />}
          refreshing={refreshing}
          onRefresh={refresh}
          ListEmptyComponent={
            <EmptyState message="Aún no tienes mensajes. Abre un perfil y pulsa Mensaje para empezar una conversación." />
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  text: {
    flex: 1,
  },
});
