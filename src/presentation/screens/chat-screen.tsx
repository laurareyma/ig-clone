import { router, Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Message } from '@/domain/entities';
import { messageStatus, type MessageStatus } from '@/domain/message-status';
import { MAX_MESSAGE_LENGTH } from '@/domain/usecases/messages';
import { EmptyState } from '@/presentation/components/empty-state';
import { SyncBanner } from '@/presentation/components/sync-banner';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useChat } from '@/presentation/hooks/use-messages';
import { useTheme } from '@/presentation/hooks/use-theme';
import { resolveIncomingLink } from '@/presentation/navigation/incoming-link';
import { useCurrentUserId } from '@/presentation/session/session-provider';
import { Spacing } from '@/presentation/theme';

const statusLabels: Record<MessageStatus, string> = {
  sending: 'Enviando…',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Visto',
};

const OWN_BUBBLE = '#3c87f7';
// Enlace a una publicación de la app pegado en un mensaje.
const POST_LINK = /\S*post\/[0-9a-f-]{36}\S*/i;

type BubbleProps = {
  message: Message;
  mine: boolean;
  // Solo el último mensaje propio muestra su estado, como en Instagram.
  status?: MessageStatus;
};

function Bubble({ message, mine, status }: BubbleProps) {
  const theme = useTheme();
  const link = POST_LINK.exec(message.body)?.[0];
  const target = link ? resolveIncomingLink(link) : null;

  return (
    <View style={[styles.bubbleRow, mine ? styles.mine : styles.theirs]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: mine ? OWN_BUBBLE : theme.backgroundElement },
          message.pending && styles.pending,
        ]}>
        <ThemedText type="small" style={mine && styles.ownText}>
          {message.body}
        </ThemedText>
        {target && target !== link && (
          <Pressable onPress={() => router.push(target as never)} accessibilityRole="link">
            <ThemedText type="smallBold" style={[styles.link, mine && styles.ownText]}>
              Ver publicación
            </ThemedText>
          </Pressable>
        )}
      </View>
      {status && (
        <ThemedText type="code" themeColor="textSecondary">
          {statusLabels[status]}
        </ThemedText>
      )}
    </View>
  );
}

export function ChatScreen({ conversationId }: { conversationId: string }) {
  const me = useCurrentUserId();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { conversation, messages, otherIsTyping, send, loadEarlier, notifyTyping } =
    useChat(conversationId);
  const [draft, setDraft] = useState('');

  function changeDraft(text: string) {
    setDraft(text);
    notifyTyping(text.trim().length > 0);
  }

  async function submit() {
    const body = draft;
    setDraft('');
    try {
      // Solo guarda en el dispositivo y encola el envío: funciona igual sin conexión.
      await send(body);
    } catch {
      setDraft(body);
      Alert.alert('No se pudo guardar el mensaje', 'Inténtalo de nuevo.');
    }
  }

  if (!conversation || !messages) {
    return (
      <ThemedView style={styles.fill}>
        <Stack.Screen options={{ title: 'Mensajes' }} />
        {conversation === null && messages ? (
          <EmptyState message="Esta conversación no está disponible." />
        ) : (
          <ActivityIndicator style={styles.fill} />
        )}
      </ThemedView>
    );
  }

  const lastOwnId = messages.find((message) => message.senderId === me)?.id;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: conversation.otherUser.username }} />
      <SyncBanner />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        {/* Lista invertida: el mensaje más nuevo queda abajo, pegado al campo de texto,
            y al llegar al "final" (arriba) se piden los mensajes anteriores. */}
        <FlatList
          inverted
          data={messages}
          keyExtractor={(message) => message.id}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              mine={item.senderId === me}
              status={item.id === lastOwnId ? messageStatus(item, conversation) : undefined}
            />
          )}
          contentContainerStyle={styles.list}
          onEndReached={loadEarlier}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          // En una lista invertida, la cabecera se pinta abajo del todo.
          ListHeaderComponent={
            otherIsTyping ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.typing}>
                Escribiendo…
              </ThemedText>
            ) : null
          }
        />

        <View
          style={[
            styles.composer,
            { borderTopColor: theme.backgroundSelected, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          <TextInput
            value={draft}
            onChangeText={changeDraft}
            placeholder="Mensaje…"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Mensaje"
            maxLength={MAX_MESSAGE_LENGTH}
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable
            onPress={submit}
            disabled={draft.trim().length === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje">
            <ThemedText type="linkPrimary" style={draft.trim().length === 0 && styles.disabled}>
              Enviar
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  bubbleRow: {
    maxWidth: '80%',
    gap: Spacing.half,
  },
  mine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pending: {
    opacity: 0.6,
  },
  ownText: {
    color: '#ffffff',
  },
  link: {
    textDecorationLine: 'underline',
    paddingTop: Spacing.one,
  },
  typing: {
    paddingTop: Spacing.two,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
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
