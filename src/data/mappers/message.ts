import { profileFromRow } from '@/data/mappers/profile';
import type { Conversation, Message } from '@/domain/entities';

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  // Solo en la consulta local: 1 si sigue en la cola de envío.
  pending?: number;
};

export function messageFromRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    pending: row.pending === 1,
  };
}

// Misma forma para la fila de get_inbox (Supabase) y la de la consulta local (SQLite).
export type ConversationRow = {
  conversation_id: string;
  last_message_at: string;
  unread_count: number;
  other_last_delivered_at: string | null;
  other_last_read_at: string | null;
  last_message_id: string | null;
  last_message_sender_id: string | null;
  last_message_body: string | null;
  last_message_created_at: string | null;
  last_message_pending?: number;
  other_id: string;
  other_username: string;
  other_full_name: string | null;
  other_avatar_url: string | null;
  other_bio: string | null;
  other_is_private: boolean | number;
};

export function conversationFromRow(row: ConversationRow): Conversation {
  return {
    id: row.conversation_id,
    otherUser: profileFromRow({
      id: row.other_id,
      username: row.other_username,
      full_name: row.other_full_name,
      avatar_url: row.other_avatar_url,
      bio: row.other_bio,
      is_private: row.other_is_private,
    }),
    lastMessage:
      row.last_message_id === null
        ? null
        : {
            id: row.last_message_id,
            conversationId: row.conversation_id,
            senderId: row.last_message_sender_id!,
            body: row.last_message_body!,
            createdAt: row.last_message_created_at!,
            pending: row.last_message_pending === 1,
          },
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    otherLastDeliveredAt: row.other_last_delivered_at,
    otherLastReadAt: row.other_last_read_at,
  };
}
