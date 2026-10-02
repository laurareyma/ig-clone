import type { Conversation, Message } from '@/domain/entities';
import { toMillis } from '@/domain/timestamps';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

// Estado de un mensaje propio. No hay un acuse por mensaje: el destinatario guarda una
// sola marca de "recibido hasta" y otra de "leído hasta" por conversación, y un mensaje
// está entregado o leído si es anterior a la marca. Con una fila por participante se
// resuelve el estado de todos los mensajes.
export function messageStatus(
  message: Message,
  conversation: Pick<Conversation, 'otherLastDeliveredAt' | 'otherLastReadAt'>,
): MessageStatus {
  if (message.pending) return 'sending';

  const sentAt = toMillis(message.createdAt);
  const reached = (mark: string | null) => mark !== null && sentAt <= toMillis(mark);

  if (reached(conversation.otherLastReadAt)) return 'read';
  if (reached(conversation.otherLastDeliveredAt)) return 'delivered';
  return 'sent';
}
