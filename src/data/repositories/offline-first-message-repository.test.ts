import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import type { MessageEventHandlers } from '@/data/remote/message-source';
import { OfflineFirstMessageRepository } from '@/data/repositories/offline-first-message-repository';
import type { Conversation, Message } from '@/domain/entities';
import { messageStatus } from '@/domain/message-status';
import { profileFixture } from '@/testing/fixtures';
import { createTestDatabase } from '@/testing/node-sqlite';
import { createTestOutbox } from '@/testing/test-outbox';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const at = (minute: number) => `2026-01-01T10:${String(minute).padStart(2, '0')}:00.000000+00:00`;

const message = (id: string, minute: number, overrides: Partial<Message> = {}): Message => ({
  id,
  conversationId: 'c-beto',
  senderId: 'beto',
  body: `mensaje ${id}`,
  createdAt: at(minute),
  pending: false,
  ...overrides,
});

const conversation = (
  userId: string,
  lastMessage: Message | null,
  overrides: Partial<Conversation> = {},
): Conversation => ({
  id: `c-${userId}`,
  otherUser: profileFixture(userId),
  lastMessage,
  lastMessageAt: lastMessage?.createdAt ?? at(0),
  unreadCount: 0,
  otherLastDeliveredAt: null,
  otherLastReadAt: null,
  ...overrides,
});

async function setup(server: { conversations?: Conversation[]; messages?: Message[] } = {}) {
  const db = createTestDatabase();
  await migrate(db);
  const changes = new ChangeNotifier();
  const queue = createTestOutbox(db, changes);
  const state = { conversations: server.conversations ?? [], messages: server.messages ?? [] };

  let events!: MessageEventHandlers;
  let typingListener!: (typing: boolean) => void;
  const typingChannel = { send: jest.fn(), leave: jest.fn() };
  const unsubscribeRemote = jest.fn();

  const remote = {
    currentUserId: jest.fn(async () => 'yo'),
    fetchInbox: jest.fn(async (conversationId?: string) =>
      state.conversations.filter((item) => !conversationId || item.id === conversationId),
    ),
    fetchMessages: jest.fn(async (conversationId: string, limit: number, before?: string) =>
      state.messages
        .filter((item) => item.conversationId === conversationId)
        .filter((item) => !before || item.createdAt < before)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    ),
    insertMessage: jest.fn(async (_message: Message) => {}),
    getOrCreateConversation: jest.fn(async (userId: string) => `c-${userId}`),
    markDelivered: jest.fn(async () => {}),
    markRead: jest.fn(async (_conversationId: string) => {}),
    subscribe: jest.fn((handlers: MessageEventHandlers) => {
      events = handlers;
      return unsubscribeRemote;
    }),
    joinTyping: jest.fn((_conversationId: string, onTyping: (typing: boolean) => void) => {
      typingListener = onTyping;
      return typingChannel;
    }),
  };

  // Reloj y temporizadores controlados por la prueba.
  let clock = new Date('2026-01-01T10:30:00.000Z').getTime();
  const timers: { delayMs: number; run: () => void }[] = [];
  let nextId = 0;

  const repository = new OfflineFirstMessageRepository(
    async () => db,
    remote,
    changes,
    queue.outbox,
    () => `local-${++nextId}`,
    {
      pageSize: 2,
      now: () => new Date(clock),
      setTimer(task, delayMs) {
        const timer = { delayMs, run: task };
        timers.push(timer);
        return () => void timers.splice(timers.indexOf(timer), 1);
      },
    },
  );

  const read = async <T>(watch: (listener: (value: T) => void) => () => void) => {
    let latest!: T;
    const unsubscribe = watch((value) => (latest = value));
    await settle();
    unsubscribe();
    return latest;
  };
  const inbox = () => read<Conversation[]>((listener) => repository.watchInbox(listener));
  const chat = (id = 'c-beto') =>
    read<Message[]>((listener) => repository.watchMessages(id, listener));
  const details = (id = 'c-beto') =>
    read<Conversation | null>((listener) => repository.watchConversation(id, listener));
  const synced = async () => {
    await settle();
    await queue.outbox.process();
    await settle();
  };

  return {
    ...queue,
    repository,
    remote,
    state,
    inbox,
    chat,
    details,
    synced,
    timers,
    typingChannel,
    unsubscribeRemote,
    advance: (ms: number) => (clock += ms),
    emit: () => events,
    receiveTyping: (typing: boolean) => typingListener(typing),
  };
}

const withBeto = () => ({
  conversations: [conversation('beto', message('m1', 1), { unreadCount: 1 })],
  messages: [message('m1', 1)],
});

describe('bandeja de entrada', () => {
  it('guarda las conversaciones, la del mensaje más reciente primero', async () => {
    const { repository, inbox } = await setup({
      conversations: [
        conversation('beto', message('m1', 1), { unreadCount: 2 }),
        conversation('carla', message('m2', 5, { conversationId: 'c-carla', senderId: 'carla' })),
      ],
    });

    await repository.refreshInbox();

    expect((await inbox()).map((item) => [item.otherUser.id, item.unreadCount])).toEqual([
      ['carla', 0],
      ['beto', 2],
    ]);
    expect((await inbox())[1].lastMessage).toMatchObject({ id: 'm1', pending: false });
  });

  it('al refrescar avisa al servidor de que este dispositivo ya recibió los mensajes', async () => {
    const { repository, remote } = await setup(withBeto());

    await repository.refreshInbox();

    expect(remote.markDelivered).toHaveBeenCalledTimes(1);
  });

  it('una conversación sin mensajes no aparece en la bandeja, pero se puede abrir', async () => {
    const { repository, inbox, details } = await setup({
      conversations: [conversation('beto', null)],
    });

    expect(await repository.openConversationWith('beto')).toBe('c-beto');

    expect(await inbox()).toEqual([]);
    expect((await details())?.otherUser.id).toBe('beto');
  });

  it('sin red, la bandeja guardada sigue disponible', async () => {
    const { repository, remote, inbox } = await setup(withBeto());
    await repository.refreshInbox();
    remote.fetchInbox.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.refreshInbox()).rejects.toThrow('sin conexión');

    expect(await inbox()).toHaveLength(1);
  });
});

describe('enviar', () => {
  it('aparece al instante como pendiente y sube la conversación', async () => {
    const { repository, remote, inbox, chat, setOnline } = await setup({
      conversations: [
        conversation('beto', message('m1', 1)),
        conversation('carla', message('m2', 5, { conversationId: 'c-carla' })),
      ],
    });
    await repository.refreshInbox();
    setOnline(false);

    await repository.send({ conversationId: 'c-beto', body: 'hola' });

    expect((await chat())[0]).toEqual({
      id: 'local-1',
      conversationId: 'c-beto',
      senderId: 'yo',
      body: 'hola',
      createdAt: '2026-01-01T10:30:00.000Z',
      pending: true,
    });
    expect((await inbox())[0]).toMatchObject({ id: 'c-beto', lastMessage: { id: 'local-1' } });
    expect(remote.insertMessage).not.toHaveBeenCalled();
  });

  it('al reconectar se envían en el orden en que se escribieron y dejan de estar pendientes', async () => {
    const { repository, remote, chat, setOnline, outbox, synced, advance } = await setup(withBeto());
    outbox.start();
    await repository.refreshInbox();
    setOnline(false);
    await repository.send({ conversationId: 'c-beto', body: 'uno' });
    advance(1000);
    await repository.send({ conversationId: 'c-beto', body: 'dos' });

    setOnline(true);
    await synced();

    expect(remote.insertMessage.mock.calls.map(([sent]) => [sent.id, sent.body])).toEqual([
      ['local-1', 'uno'],
      ['local-2', 'dos'],
    ]);
    expect((await chat()).map((item) => [item.body, item.pending])).toEqual([
      ['dos', false],
      ['uno', false],
      ['mensaje m1', false],
    ]);
  });

  it('si el servidor lo rechaza, se retira de la conversación', async () => {
    const { repository, remote, chat, synced } = await setup(withBeto());
    await repository.refreshInbox();
    remote.insertMessage.mockRejectedValue({ code: '42501', message: 'row-level security' });

    await repository.send({ conversationId: 'c-beto', body: 'hola' });
    await synced();

    expect((await chat()).map((item) => item.id)).toEqual(['m1']);
  });
});

describe('tiempo real', () => {
  it('un mensaje del otro se guarda, cuenta como no leído, sube la conversación y se acusa la entrega', async () => {
    const { repository, remote, inbox, chat, emit } = await setup({
      conversations: [
        conversation('beto', message('m1', 1)),
        conversation('carla', message('m2', 5, { conversationId: 'c-carla' })),
      ],
    });
    await repository.refreshInbox();
    remote.markDelivered.mockClear();
    repository.connect();

    emit().onMessage(message('m3', 9));
    await settle();

    expect((await chat())[0].id).toBe('m3');
    expect((await inbox())[0]).toMatchObject({ id: 'c-beto', unreadCount: 1 });
    expect(remote.markDelivered).toHaveBeenCalledTimes(1);
  });

  it('el mismo evento repetido no cuenta dos veces', async () => {
    const { repository, inbox, chat, emit } = await setup(withBeto());
    await repository.refreshInbox();
    repository.connect();

    emit().onMessage(message('m3', 9));
    emit().onMessage(message('m3', 9));
    await settle();

    expect(await chat()).toHaveLength(2);
    expect((await inbox())[0].unreadCount).toBe(2);
  });

  it('el eco de un mensaje propio no se duplica ni cuenta como no leído, y toma la hora del servidor', async () => {
    const { repository, remote, inbox, chat, emit, synced } = await setup(withBeto());
    await repository.refreshInbox();
    remote.markDelivered.mockClear();
    repository.connect();
    await repository.send({ conversationId: 'c-beto', body: 'hola' });
    await synced();

    emit().onMessage(message('local-1', 31, { senderId: 'yo', body: 'hola' }));
    await settle();

    expect((await chat()).map((item) => [item.id, item.createdAt])).toEqual([
      ['local-1', at(31)],
      ['m1', at(1)],
    ]);
    expect((await inbox())[0].unreadCount).toBe(1);
    expect(remote.markDelivered).not.toHaveBeenCalled();
  });

  it('el primer mensaje de alguien nuevo trae su conversación del servidor', async () => {
    const { repository, inbox, emit, state } = await setup();
    repository.connect();
    const first = message('m9', 9, { conversationId: 'c-dani', senderId: 'dani' });
    state.conversations = [conversation('dani', first, { unreadCount: 1 })];

    emit().onMessage(first);
    await settle();
    await settle();

    expect(await inbox()).toMatchObject([{ id: 'c-dani', otherUser: { id: 'dani' }, unreadCount: 1 }]);
  });

  it('los acuses del otro actualizan el estado de mis mensajes: enviado, entregado, visto', async () => {
    const { repository, details, emit, synced } = await setup(withBeto());
    await repository.refreshInbox();
    repository.connect();
    await repository.send({ conversationId: 'c-beto', body: 'hola' });
    await synced();
    const sent = message('local-1', 31, { senderId: 'yo' });
    emit().onMessage(sent);
    await settle();
    expect(messageStatus(sent, (await details())!)).toBe('sent');

    const receipt = { conversationId: 'c-beto', userId: 'beto', lastDeliveredAt: at(32), lastReadAt: null };
    emit().onReceipt(receipt);
    await settle();
    expect(messageStatus(sent, (await details())!)).toBe('delivered');

    emit().onReceipt({ ...receipt, lastReadAt: at(33) });
    await settle();
    expect(messageStatus(sent, (await details())!)).toBe('read');
  });

  it('mis propios acuses no cambian las marcas del otro', async () => {
    const { repository, details, emit } = await setup(withBeto());
    await repository.refreshInbox();
    repository.connect();

    emit().onReceipt({ conversationId: 'c-beto', userId: 'yo', lastDeliveredAt: at(40), lastReadAt: at(40) });
    await settle();

    expect(await details()).toMatchObject({ otherLastDeliveredAt: null, otherLastReadAt: null });
  });

  it('desconectar cierra el canal', async () => {
    const { repository, unsubscribeRemote } = await setup();

    repository.connect()();

    expect(unsubscribeRemote).toHaveBeenCalledTimes(1);
  });
});

describe('leído', () => {
  it('pone a cero los no leídos en local y avisa al servidor', async () => {
    const { repository, remote, inbox } = await setup(withBeto());
    await repository.refreshInbox();

    await repository.markRead('c-beto');

    expect((await inbox())[0].unreadCount).toBe(0);
    expect(remote.markRead).toHaveBeenCalledWith('c-beto');
  });

  it('sin red, el contador local baja igualmente', async () => {
    const { repository, remote, inbox } = await setup(withBeto());
    await repository.refreshInbox();
    remote.markRead.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.markRead('c-beto')).rejects.toThrow('sin conexión');

    expect((await inbox())[0].unreadCount).toBe(0);
  });
});

describe('historial', () => {
  const history = [1, 2, 3, 4, 5].map((n) => message(`m${n}`, n));

  it('abre con los más recientes y trae los anteriores bajo demanda', async () => {
    const { repository, chat, remote } = await setup({
      conversations: [conversation('beto', history[4])],
      messages: history,
    });

    expect(await repository.refreshMessages('c-beto')).toEqual({ hasMore: true });
    expect((await chat()).map((item) => item.id)).toEqual(['m5', 'm4']);

    expect(await repository.loadEarlierMessages('c-beto')).toEqual({ hasMore: true });
    expect(remote.fetchMessages).toHaveBeenLastCalledWith('c-beto', 2, at(4));
    expect((await chat()).map((item) => item.id)).toEqual(['m5', 'm4', 'm3', 'm2']);

    expect(await repository.loadEarlierMessages('c-beto')).toEqual({ hasMore: false });
    expect((await chat()).map((item) => item.id)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('un mensaje pendiente (con hora del dispositivo) no se usa como punto de partida', async () => {
    const { repository, remote, setOnline } = await setup({
      conversations: [conversation('beto', history[4])],
      messages: history,
    });
    await repository.refreshMessages('c-beto');
    setOnline(false);
    await repository.send({ conversationId: 'c-beto', body: 'hola' });

    await repository.loadEarlierMessages('c-beto');

    expect(remote.fetchMessages).toHaveBeenLastCalledWith('c-beto', 2, at(4));
  });
});

describe('escribiendo', () => {
  it('avisa como mucho una vez cada 2 segundos mientras se escribe', async () => {
    const { repository, typingChannel, advance } = await setup();
    const channel = repository.joinTyping('c-beto', () => {});

    channel.notifyTyping(true);
    advance(500);
    channel.notifyTyping(true);
    advance(500);
    channel.notifyTyping(true);
    expect(typingChannel.send.mock.calls).toEqual([[true]]);

    advance(1500);
    channel.notifyTyping(true);
    expect(typingChannel.send.mock.calls).toEqual([[true], [true]]);
  });

  it('"dejó de escribir" se envía siempre y permite volver a avisar enseguida', async () => {
    const { repository, typingChannel } = await setup();
    const channel = repository.joinTyping('c-beto', () => {});

    channel.notifyTyping(true);
    channel.notifyTyping(false);
    channel.notifyTyping(true);

    expect(typingChannel.send.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('el indicador del otro caduca solo si dejan de llegar avisos', async () => {
    const { repository, receiveTyping, timers } = await setup();
    const onTyping = jest.fn();
    repository.joinTyping('c-beto', onTyping);

    receiveTyping(true);
    receiveTyping(true);
    expect(onTyping.mock.calls).toEqual([[true], [true]]);
    // Cada aviso reinicia la cuenta: solo queda un temporizador vivo.
    expect(timers.map((timer) => timer.delayMs)).toEqual([4000]);

    timers[0].run();
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it('"dejó de escribir" apaga el indicador sin esperar', async () => {
    const { repository, receiveTyping, timers } = await setup();
    const onTyping = jest.fn();
    repository.joinTyping('c-beto', onTyping);

    receiveTyping(true);
    receiveTyping(false);

    expect(onTyping).toHaveBeenLastCalledWith(false);
    expect(timers).toEqual([]);
  });

  it('salir cierra el canal y cancela la caducidad pendiente', async () => {
    const { repository, receiveTyping, timers, typingChannel } = await setup();
    const channel = repository.joinTyping('c-beto', () => {});
    receiveTyping(true);

    channel.leave();

    expect(typingChannel.leave).toHaveBeenCalledTimes(1);
    expect(timers).toEqual([]);
  });
});
