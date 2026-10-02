import type { MessageRepository } from '@/domain/repositories/message-repository';

// Mismo límite que el check de messages.body en la base.
export const MAX_MESSAGE_LENGTH = 4000;

// Devuelve false si no había nada que enviar.
export async function sendMessage(
  messages: MessageRepository,
  input: { conversationId: string; body: string },
): Promise<boolean> {
  const body = input.body.trim();
  if (body.length === 0) return false;
  if (body.length > MAX_MESSAGE_LENGTH) throw new Error('message_too_long');

  await messages.send({ conversationId: input.conversationId, body });
  return true;
}
