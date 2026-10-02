import { upsertProfiles } from '@/data/local/profile-store';
import type { SqlExecutor } from '@/data/local/sql-database';
import {
  conversationFromRow,
  messageFromRow,
  type ConversationRow,
  type MessageRow,
} from '@/data/mappers/message';
import { MESSAGE } from '@/data/sync/operations';
import type { Conversation, Message } from '@/domain/entities';

const PENDING = `EXISTS (SELECT 1 FROM outbox o WHERE o.type = '${MESSAGE}' AND o.entity_id = m.id)`;

// Mismas columnas que devuelve get_inbox, para compartir el mapeador.
const SELECT_CONVERSATION = `
  SELECT
    c.id AS conversation_id, c.last_message_at, c.unread_count,
    c.other_last_delivered_at, c.other_last_read_at,
    m.id AS last_message_id, m.sender_id AS last_message_sender_id,
    m.body AS last_message_body, m.created_at AS last_message_created_at,
    ${PENDING} AS last_message_pending,
    p.id AS other_id, p.username AS other_username, p.full_name AS other_full_name,
    p.avatar_url AS other_avatar_url, p.bio AS other_bio, p.is_private AS other_is_private
  FROM conversations c
  JOIN profiles p ON p.id = c.other_user_id
  LEFT JOIN messages m ON m.id = (
    SELECT id FROM messages
    WHERE conversation_id = c.id
    ORDER BY created_at DESC, id DESC LIMIT 1
  )`;

// Guarda lo que llega del servidor: la conversación, el otro participante y el último
// mensaje. El contador de no leídos y las marcas del servidor reemplazan a los locales.
export async function upsertConversations(
  db: SqlExecutor,
  conversations: Conversation[],
): Promise<void> {
  await upsertProfiles(
    db,
    conversations.map((conversation) => conversation.otherUser),
  );

  for (const conversation of conversations) {
    await db.runAsync(
      `INSERT INTO conversations
         (id, other_user_id, last_message_at, unread_count, other_last_delivered_at, other_last_read_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         last_message_at = MAX(last_message_at, excluded.last_message_at),
         unread_count = excluded.unread_count,
         other_last_delivered_at = excluded.other_last_delivered_at,
         other_last_read_at = excluded.other_last_read_at`,
      [
        conversation.id,
        conversation.otherUser.id,
        conversation.lastMessageAt,
        conversation.unreadCount,
        conversation.otherLastDeliveredAt,
        conversation.otherLastReadAt,
      ],
    );
    if (conversation.lastMessage) await upsertMessages(db, [conversation.lastMessage]);
  }
}

// Si el mensaje ya estaba (enviado desde este dispositivo), se queda con la hora del
// servidor: es la que ordena la conversación igual en los dos teléfonos.
export async function upsertMessages(db: SqlExecutor, messages: Message[]): Promise<void> {
  for (const message of messages) {
    await db.runAsync(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET created_at = excluded.created_at`,
      [message.id, message.conversationId, message.senderId, message.body, message.createdAt],
    );
  }
}

// Solo las conversaciones con algún mensaje: abrir un chat y no escribir no la crea
// en la bandeja.
export async function readInbox(db: SqlExecutor): Promise<Conversation[]> {
  const rows = await db.getAllAsync<ConversationRow>(
    `${SELECT_CONVERSATION} WHERE m.id IS NOT NULL ORDER BY c.last_message_at DESC`,
    [],
  );
  return rows.map(conversationFromRow);
}

export async function readConversation(
  db: SqlExecutor,
  conversationId: string,
): Promise<Conversation | null> {
  const row = await db.getFirstAsync<ConversationRow>(`${SELECT_CONVERSATION} WHERE c.id = ?`, [
    conversationId,
  ]);
  return row ? conversationFromRow(row) : null;
}

export async function readMessages(db: SqlExecutor, conversationId: string): Promise<Message[]> {
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT m.*, ${PENDING} AS pending FROM messages m
     WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC`,
    [conversationId],
  );
  return rows.map(messageFromRow);
}

export async function messageExists(db: SqlExecutor, messageId: string): Promise<boolean> {
  return (await db.getFirstAsync('SELECT 1 FROM messages WHERE id = ?', [messageId])) !== null;
}

// El mensaje confirmado más antiguo: desde ahí se piden los anteriores.
export async function readOldestMessageDate(
  db: SqlExecutor,
  conversationId: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ created_at: string }>(
    `SELECT m.created_at FROM messages m
     WHERE m.conversation_id = ? AND NOT ${PENDING}
     ORDER BY m.created_at ASC LIMIT 1`,
    [conversationId],
  );
  return row?.created_at ?? null;
}

export async function deleteMessage(db: SqlExecutor, messageId: string): Promise<void> {
  await db.runAsync('DELETE FROM messages WHERE id = ?', [messageId]);
}

// Un mensaje nuevo sube la conversación en la bandeja y, si es del otro, suma un no leído.
export async function bumpConversation(
  db: SqlExecutor,
  conversationId: string,
  messageAt: string,
  unreadDelta: number,
): Promise<boolean> {
  const { changes } = await db.runAsync(
    `UPDATE conversations
     SET last_message_at = MAX(last_message_at, ?), unread_count = unread_count + ?
     WHERE id = ?`,
    [messageAt, unreadDelta, conversationId],
  );
  return changes > 0;
}

export async function setReceipts(
  db: SqlExecutor,
  conversationId: string,
  deliveredAt: string | null,
  readAt: string | null,
): Promise<void> {
  await db.runAsync(
    'UPDATE conversations SET other_last_delivered_at = ?, other_last_read_at = ? WHERE id = ?',
    [deliveredAt, readAt, conversationId],
  );
}

export async function clearUnread(db: SqlExecutor, conversationId: string): Promise<boolean> {
  const { changes } = await db.runAsync(
    'UPDATE conversations SET unread_count = 0 WHERE id = ? AND unread_count > 0',
    [conversationId],
  );
  return changes > 0;
}
