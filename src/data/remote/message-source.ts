import {
  conversationFromRow,
  messageFromRow,
  type ConversationRow,
  type MessageRow,
} from '@/data/mappers/message';
import { currentUserId, type Client } from '@/data/remote/current-user';
import type { Conversation, Message } from '@/domain/entities';

export type ReceiptEvent = {
  conversationId: string;
  userId: string;
  lastDeliveredAt: string | null;
  lastReadAt: string | null;
};

export type MessageEventHandlers = {
  onMessage(message: Message): void;
  onReceipt(receipt: ReceiptEvent): void;
};

export type RemoteTypingChannel = {
  send(typing: boolean): void;
  leave(): void;
};

export interface MessageRemoteSource {
  currentUserId(): Promise<string>;
  // Todas las conversaciones, o solo la indicada.
  fetchInbox(conversationId?: string): Promise<Conversation[]>;
  // Del más nuevo al más antiguo; con `before`, solo los anteriores a esa fecha.
  fetchMessages(conversationId: string, limit: number, before?: string): Promise<Message[]>;
  insertMessage(message: Message): Promise<void>;
  getOrCreateConversation(userId: string): Promise<string>;
  markDelivered(): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  subscribe(handlers: MessageEventHandlers): () => void;
  joinTyping(conversationId: string, onTyping: (typing: boolean) => void): RemoteTypingChannel;
}

type ParticipantRow = {
  conversation_id: string;
  user_id: string;
  last_delivered_at: string | null;
  last_read_at: string | null;
};

export class SupabaseMessageSource implements MessageRemoteSource {
  constructor(private readonly client: Client) {}

  currentUserId(): Promise<string> {
    return currentUserId(this.client);
  }

  async fetchInbox(conversationId?: string): Promise<Conversation[]> {
    const { data, error } = await this.client.rpc('get_inbox', {
      only_conversation: conversationId,
    });

    if (error) throw error;
    // Los tipos generados no reflejan qué columnas pueden ser null.
    return (data as ConversationRow[]).map(conversationFromRow);
  }

  async fetchMessages(conversationId: string, limit: number, before?: string): Promise<Message[]> {
    let query = this.client
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (before) query = query.lt('created_at', before);

    const { data, error } = await query;
    if (error) throw error;
    return (data as MessageRow[]).map(messageFromRow);
  }

  async insertMessage(message: Message): Promise<void> {
    // Id generado en el cliente: si el envío se repite, el duplicado se ignora.
    const { error } = await this.client.from('messages').upsert(
      {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: await this.currentUserId(),
        body: message.body,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  async getOrCreateConversation(userId: string): Promise<string> {
    const { data, error } = await this.client.rpc('get_or_create_dm', { other: userId });
    if (error) throw error;
    return data;
  }

  async markDelivered(): Promise<void> {
    const { error } = await this.client.rpc('mark_delivered');
    if (error) throw error;
  }

  async markRead(conversationId: string): Promise<void> {
    const { error } = await this.client.rpc('mark_read', { conversation: conversationId });
    if (error) throw error;
  }

  subscribe(handlers: MessageEventHandlers): () => void {
    // Un solo canal para todas las conversaciones. No hace falta filtrar: la RLS hace
    // que el servidor solo envíe filas de conversaciones en las que participa el usuario.
    const channel = this.client
      .channel('inbox')
      .on<MessageRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        ({ new: row }) => handlers.onMessage(messageFromRow(row)),
      )
      // Los acuses: cada participante actualiza sus marcas de entregado y leído.
      .on<ParticipantRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants' },
        ({ new: row }) =>
          handlers.onReceipt({
            conversationId: row.conversation_id,
            userId: row.user_id,
            lastDeliveredAt: row.last_delivered_at,
            lastReadAt: row.last_read_at,
          }),
      )
      .subscribe();

    return () => void this.client.removeChannel(channel);
  }

  joinTyping(conversationId: string, onTyping: (typing: boolean) => void): RemoteTypingChannel {
    let joined = false;

    // "Escribiendo..." va por Broadcast: el servidor lo reparte a quien esté en el canal
    // y no lo guarda en ninguna tabla. El canal es privado: las políticas sobre
    // realtime.messages solo dejan entrar a los participantes de la conversación.
    // self: false para no recibir los eventos propios.
    const channel = this.client
      .channel(`conversation:${conversationId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(Boolean(payload?.typing)));

    // Un canal privado se autoriza con el token de la sesión.
    void this.client.realtime.setAuth().then(() =>
      channel.subscribe((status) => {
        joined = status === 'SUBSCRIBED';
      }),
    );

    return {
      send: (typing) => {
        // Antes de unirse, send() usaría una petición HTTP por evento: no compensa
        // para un aviso efímero.
        if (joined) void channel.send({ type: 'broadcast', event: 'typing', payload: { typing } });
      },
      leave: () => void this.client.removeChannel(channel),
    };
  }
}
