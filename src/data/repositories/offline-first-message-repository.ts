import type { ChangeNotifier } from '@/data/local/change-notifier';
import {
  bumpConversation,
  clearUnread,
  deleteMessage,
  messageExists,
  readConversation,
  readInbox,
  readMessages,
  readOldestMessageDate,
  setReceipts,
  upsertConversations,
  upsertMessages,
} from '@/data/local/message-store';
import type { SqlDatabase } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import type { MessageRemoteSource, ReceiptEvent } from '@/data/remote/message-source';
import { MESSAGE, type MessagePayload } from '@/data/sync/operations';
import type { Outbox } from '@/data/sync/outbox';
import type { Conversation, Message } from '@/domain/entities';
import type { MessageRepository, TypingChannel } from '@/domain/repositories/message-repository';

export const MESSAGE_PAGE_SIZE = 50;
// Mientras el usuario escribe se avisa como mucho cada 2 s, no en cada tecla.
export const TYPING_SEND_INTERVAL_MS = 2000;
// Si dejan de llegar avisos, el otro dejó de escribir (o perdió la conexión).
export const TYPING_EXPIRY_MS = 4000;

export type MessageRepositoryOptions = {
  pageSize?: number;
  now?: () => Date;
  setTimer?: (task: () => void, delayMs: number) => () => void;
};

export class OfflineFirstMessageRepository implements MessageRepository {
  private readonly pageSize: number;
  private readonly now: () => Date;
  private readonly setTimer: (task: () => void, delayMs: number) => () => void;

  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly remote: MessageRemoteSource,
    private readonly changes: ChangeNotifier,
    private readonly outbox: Outbox,
    private readonly newId: () => string,
    options: MessageRepositoryOptions = {},
  ) {
    this.pageSize = options.pageSize ?? MESSAGE_PAGE_SIZE;
    this.now = options.now ?? (() => new Date());
    this.setTimer =
      options.setTimer ??
      ((task, delayMs) => {
        const timer = setTimeout(task, delayMs);
        return () => clearTimeout(timer);
      });

    // Los mensajes salen por la misma cola que likes y comentarios: se ven al instante,
    // se envían en orden y sobreviven a quedarse sin conexión.
    outbox.register<MessagePayload>(MESSAGE, {
      applyLocal: async (tx, message) => {
        await upsertMessages(tx, [message]);
        await bumpConversation(tx, message.conversationId, message.createdAt, 0);
      },
      send: (message) => this.remote.insertMessage(message),
      discard: async (message) => {
        await deleteMessage(await this.getDb(), message.id);
        this.changes.notify('messages');
      },
      tables: ['messages'],
    });
  }

  watchInbox(listener: (conversations: Conversation[]) => void): () => void {
    return watchQuery(this.changes, ['messages'], async () => readInbox(await this.getDb()), listener);
  }

  async refreshInbox(): Promise<void> {
    const conversations = await this.remote.fetchInbox();
    const db = await this.getDb();

    await db.withTransactionAsync((tx) => upsertConversations(tx, conversations));
    this.changes.notify('messages');

    // Este dispositivo ya tiene lo último de cada conversación.
    this.acknowledgeDelivery();
  }

  watchConversation(
    conversationId: string,
    listener: (conversation: Conversation | null) => void,
  ): () => void {
    return watchQuery(
      this.changes,
      ['messages'],
      async () => readConversation(await this.getDb(), conversationId),
      listener,
    );
  }

  watchMessages(conversationId: string, listener: (messages: Message[]) => void): () => void {
    return watchQuery(
      this.changes,
      ['messages'],
      async () => readMessages(await this.getDb(), conversationId),
      listener,
    );
  }

  async refreshMessages(conversationId: string): Promise<{ hasMore: boolean }> {
    const [conversations, messages] = await Promise.all([
      this.remote.fetchInbox(conversationId),
      this.remote.fetchMessages(conversationId, this.pageSize),
    ]);
    const db = await this.getDb();

    await db.withTransactionAsync(async (tx) => {
      await upsertConversations(tx, conversations);
      await upsertMessages(tx, messages);
    });
    this.changes.notify('messages');
    return { hasMore: messages.length === this.pageSize };
  }

  async loadEarlierMessages(conversationId: string): Promise<{ hasMore: boolean }> {
    const db = await this.getDb();
    const oldest = await readOldestMessageDate(db, conversationId);
    if (!oldest) return this.refreshMessages(conversationId);

    const messages = await this.remote.fetchMessages(conversationId, this.pageSize, oldest);
    await db.withTransactionAsync((tx) => upsertMessages(tx, messages));
    this.changes.notify('messages');
    return { hasMore: messages.length === this.pageSize };
  }

  async openConversationWith(userId: string): Promise<string> {
    const conversationId = await this.remote.getOrCreateConversation(userId);
    // Deja la conversación en local para que la pantalla de chat tenga a quién mostrar.
    await this.refreshMessages(conversationId);
    return conversationId;
  }

  async send({ conversationId, body }: { conversationId: string; body: string }): Promise<void> {
    const message: Message = {
      id: this.newId(),
      conversationId,
      senderId: await this.remote.currentUserId(),
      body,
      // Hora del dispositivo, solo hasta que el servidor confirme la suya.
      createdAt: this.now().toISOString(),
      pending: true,
    };

    await this.outbox.enqueue<MessagePayload>(MESSAGE, message.id, message);
  }

  async markRead(conversationId: string): Promise<void> {
    // El contador local baja al instante; el "visto" que ve el otro lo pone el servidor.
    if (await clearUnread(await this.getDb(), conversationId)) this.changes.notify('messages');
    await this.remote.markRead(conversationId);
  }

  connect(): () => void {
    return this.remote.subscribe({
      // Un fallo al aplicar un evento no debe tumbar la suscripción: el siguiente
      // refresh corrige cualquier diferencia.
      onMessage: (message) => void this.applyMessage(message).catch(() => {}),
      onReceipt: (receipt) => void this.applyReceipt(receipt).catch(() => {}),
    });
  }

  joinTyping(conversationId: string, onTyping: (typing: boolean) => void): TypingChannel {
    let cancelExpiry: (() => void) | null = null;
    let lastSentAt = 0;

    const channel = this.remote.joinTyping(conversationId, (typing) => {
      cancelExpiry?.();
      cancelExpiry = null;
      onTyping(typing);
      // El aviso de "dejó de escribir" puede no llegar nunca (se cerró la app, se cortó
      // la red): el indicador caduca solo.
      if (typing) cancelExpiry = this.setTimer(() => onTyping(false), TYPING_EXPIRY_MS);
    });

    return {
      notifyTyping: (typing) => {
        const now = this.now().getTime();
        if (typing && now - lastSentAt < TYPING_SEND_INTERVAL_MS) return;
        // "Dejó de escribir" se envía siempre, y permite avisar de nuevo enseguida.
        lastSentAt = typing ? now : 0;
        channel.send(typing);
      },
      leave: () => {
        cancelExpiry?.();
        channel.leave();
      },
    };
  }

  private async applyMessage(message: Message): Promise<void> {
    const db = await this.getDb();
    const mine = message.senderId === (await this.remote.currentUserId());
    let knownConversation = true;

    await db.withTransactionAsync(async (tx) => {
      const isNew = !(await messageExists(tx, message.id));
      // Para un mensaje propio esto es el eco de Realtime: solo actualiza su hora.
      await upsertMessages(tx, [message]);
      knownConversation = await bumpConversation(
        tx,
        message.conversationId,
        message.createdAt,
        isNew && !mine ? 1 : 0,
      );
    });
    this.changes.notify('messages');

    if (!mine) this.acknowledgeDelivery();
    // Primera vez que alguien escribe a este usuario: aún no hay conversación en local.
    if (!knownConversation) await this.refreshInbox();
  }

  private async applyReceipt(receipt: ReceiptEvent): Promise<void> {
    // Solo interesan las marcas del otro; las propias las pone este dispositivo.
    if (receipt.userId === (await this.remote.currentUserId())) return;

    await setReceipts(
      await this.getDb(),
      receipt.conversationId,
      receipt.lastDeliveredAt,
      receipt.lastReadAt,
    );
    this.changes.notify('messages');
  }

  // Avisa al servidor de que este dispositivo recibió los mensajes. Si falla (sin red),
  // se volverá a avisar con el siguiente mensaje o al refrescar la bandeja.
  private acknowledgeDelivery(): void {
    this.remote.markDelivered().catch(() => {});
  }
}
