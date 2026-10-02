import { useEffect, useRef, useState } from 'react';

import type { Conversation, Message } from '@/domain/entities';
import { sendMessage } from '@/domain/usecases/messages';
import { useDependencies } from '@/presentation/dependencies';

export function useInbox() {
  const { messages } = useDependencies();
  // undefined = todavía no se ha leído la base local.
  const [conversations, setConversations] = useState<Conversation[]>();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => messages.watchInbox(setConversations), [messages]);

  async function refresh() {
    setRefreshing(true);
    await messages.refreshInbox().catch(() => {});
    setRefreshing(false);
  }

  const unreadTotal = (conversations ?? []).reduce((sum, item) => sum + item.unreadCount, 0);

  return { conversations, refreshing, refresh, unreadTotal };
}

export function useChat(conversationId: string) {
  const { messages: repository } = useDependencies();
  const [state, setState] = useState<{
    conversationId: string;
    conversation?: Conversation | null;
    messages?: Message[];
    typing?: boolean;
  }>({ conversationId });
  const typingChannel = useRef<{ notifyTyping(typing: boolean): void } | null>(null);
  const hasMore = useRef(true);
  const loading = useRef(false);

  useEffect(() => {
    // Cada parte del estado se guarda junto al id de su conversación, para descartar lo
    // de la anterior si la pantalla se reutiliza con otra.
    const update = (patch: Partial<typeof state>) =>
      setState((current) =>
        current.conversationId === conversationId
          ? { ...current, ...patch }
          : { conversationId, ...patch },
      );

    const unwatchConversation = repository.watchConversation(conversationId, (conversation) =>
      update({ conversation }),
    );
    const unwatchMessages = repository.watchMessages(conversationId, (messages) =>
      update({ messages }),
    );
    // El canal de "Escribiendo..." solo existe mientras el chat está abierto.
    const channel = repository.joinTyping(conversationId, (typing) => update({ typing }));
    typingChannel.current = channel;

    hasMore.current = true;
    repository.refreshMessages(conversationId).then(
      (page) => {
        hasMore.current = page.hasMore;
      },
      () => {},
    );

    return () => {
      unwatchConversation();
      unwatchMessages();
      channel.notifyTyping(false);
      channel.leave();
      typingChannel.current = null;
    };
  }, [repository, conversationId]);

  const current = state.conversationId === conversationId ? state : { conversationId };
  const messages = current.messages;
  const conversation = current.conversation;
  const otherUserId = conversation?.otherUser.id;

  // El mensaje más reciente del otro: cuando cambia, hay algo nuevo que marcar como leído.
  const newestIncomingId = otherUserId
    ? messages?.find((message) => message.senderId === otherUserId)?.id
    : undefined;

  useEffect(() => {
    // Con el chat abierto, lo que llega se lee al momento: se pone a cero el contador y
    // el otro pasa a ver "Visto".
    if (newestIncomingId) repository.markRead(conversationId).catch(() => {});
  }, [repository, conversationId, newestIncomingId]);

  async function send(body: string): Promise<boolean> {
    typingChannel.current?.notifyTyping(false);
    return sendMessage(repository, { conversationId, body });
  }

  async function loadEarlier() {
    if (loading.current || !hasMore.current) return;
    loading.current = true;
    try {
      hasMore.current = (await repository.loadEarlierMessages(conversationId)).hasMore;
    } catch {
      // Se reintenta la próxima vez que la lista llegue al principio.
    } finally {
      loading.current = false;
    }
  }

  return {
    conversation,
    messages,
    otherIsTyping: current.typing === true,
    send,
    loadEarlier,
    notifyTyping: (typing: boolean) => typingChannel.current?.notifyTyping(typing),
  };
}
