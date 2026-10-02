import type { Conversation, Message } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';

export type TypingChannel = {
  // Avisa al otro de que el usuario está (o ha dejado de estar) escribiendo.
  notifyTyping(typing: boolean): void;
  leave(): void;
};

export interface MessageRepository {
  // Conversaciones guardadas en el dispositivo, la del mensaje más reciente primero.
  watchInbox(listener: (conversations: Conversation[]) => void): Unsubscribe;
  refreshInbox(): Promise<void>;

  watchConversation(
    conversationId: string,
    listener: (conversation: Conversation | null) => void,
  ): Unsubscribe;
  // Mensajes guardados, del más nuevo al más antiguo.
  watchMessages(conversationId: string, listener: (messages: Message[]) => void): Unsubscribe;
  // Trae los mensajes más recientes y el estado de la conversación.
  refreshMessages(conversationId: string): Promise<{ hasMore: boolean }>;
  loadEarlierMessages(conversationId: string): Promise<{ hasMore: boolean }>;

  // Devuelve la conversación con ese usuario, creándola si no existe.
  openConversationWith(userId: string): Promise<string>;
  send(message: { conversationId: string; body: string }): Promise<void>;
  markRead(conversationId: string): Promise<void>;

  // Mientras esté activa, los mensajes nuevos y los acuses de entrega y lectura de
  // todas las conversaciones llegan solos a la copia local.
  connect(): Unsubscribe;
  // Canal efímero de "Escribiendo..." de una conversación.
  joinTyping(conversationId: string, onTyping: (typing: boolean) => void): TypingChannel;
}
