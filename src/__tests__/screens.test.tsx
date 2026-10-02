import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { Conversation, Message, ProfileDetails } from '@/domain/entities';
import {
  testProfile,
  testSession,
  type createFakeDependencies,
} from '@/testing/fake-dependencies';
import { commentFixture, postFixture, profileFixture } from '@/testing/fixtures';

jest.mock('@/di/container', () => {
  const fake = jest.requireActual('@/testing/fake-dependencies').createFakeDependencies();
  return { container: fake };
});

const fake = jest.requireMock('@/di/container').container as ReturnType<
  typeof createFakeDependencies
>;
const { data, posts, comments, profiles, messages } = fake;

const ownDetails: ProfileDetails = {
  profile: testProfile,
  postsCount: 2,
  followersCount: 5,
  followingCount: 3,
  followStatus: 'self',
};

beforeEach(() => {
  fake.resetSession();
  data.resetFeeds();
  data.post.set(null);
  data.comments.set([]);
  data.details.set(ownDetails);
  data.syncStatus.set({ online: true, pendingCount: 0 });
  data.inbox.set([]);
  data.conversation.set(null);
  data.messages.set([]);
  data.followRequests = [];
  data.searchResults = [];
});
afterEach(() => jest.restoreAllMocks());

async function open(url: string) {
  const router = renderRouter('src/app', { initialUrl: url });
  await router;
  await act(async () => fake.setSession(testSession));
  return { router };
}

const beto = profileFixture('beto', { username: 'beto' });

describe('feed de Inicio', () => {
  it('muestra las publicaciones guardadas con autor, pie y contadores', async () => {
    data.feed('home').set([postFixture('p1', 1, { author: beto, caption: 'Atardecer', likesCount: 3, commentsCount: 2 })]);

    await open('/');

    expect(screen.getAllByText('beto').length).toBeGreaterThan(0);
    expect(screen.getByText(/Atardecer/)).toBeTruthy();
    expect(screen.getByText('3 Me gusta')).toBeTruthy();
    expect(screen.getByText('Ver los 2 comentarios')).toBeTruthy();
  });

  it('pulsar el corazón pide el like y refleja el estado que llega de la base local', async () => {
    const post = postFixture('p1', 1, { author: beto });
    data.feed('home').set([post]);
    const setLiked = jest.spyOn(posts, 'setLiked');
    await open('/');

    await fireEvent.press(screen.getByLabelText('Me gusta'));
    expect(setLiked).toHaveBeenCalledWith('p1', true);

    await act(async () => data.feed('home').set([{ ...post, likedByMe: true, likesCount: 1 }]));
    expect(screen.getByLabelText('Quitar me gusta')).toBeTruthy();
    expect(screen.getByText('1 Me gusta')).toBeTruthy();
  });

  it('sin publicaciones invita a explorar', async () => {
    await open('/');

    expect(screen.getByText(/Busca a alguien en Explorar/)).toBeTruthy();
  });

  it('sin conexión avisa y sigue mostrando lo guardado', async () => {
    data.feed('home').set([postFixture('p1', 1, { caption: 'Guardada' })]);
    jest.spyOn(posts, 'refreshFeed').mockRejectedValue(new Error('sin conexión'));
    data.syncStatus.set({ online: false, pendingCount: 0 });

    await open('/');

    expect(screen.getByText(/Sin conexión. Mostrando lo guardado/)).toBeTruthy();
    expect(screen.getByText(/Guardada/)).toBeTruthy();
  });

  it('indica cuántas acciones esperan en la cola y avisa cuando se están enviando', async () => {
    data.syncStatus.set({ online: false, pendingCount: 2 });
    await open('/');
    expect(screen.getByText('Sin conexión. 2 acciones se enviarán al reconectar.')).toBeTruthy();

    await act(async () => data.syncStatus.set({ online: true, pendingCount: 1 }));
    expect(screen.getByText('Enviando 1 acción…')).toBeTruthy();

    await act(async () => data.syncStatus.set({ online: true, pendingCount: 0 }));
    expect(screen.queryByText(/Enviando|Sin conexión/)).toBeNull();
  });

  it('comentar abre la publicación dentro de la misma pestaña', async () => {
    data.feed('home').set([postFixture('p1', 1)]);
    const { router } = await open('/');

    await fireEvent.press(screen.getByLabelText('Comentar'));

    expect(router.getPathname()).toBe('/post/p1');
    expect(router.getSegments()).toEqual(['(tabs)', '(home)', 'post', '[id]']);
  });
});

describe('pantalla de publicación', () => {
  const post = postFixture('p1', 1, { author: beto, commentsCount: 3 });

  it('muestra los comentarios en hilos: cada respuesta debajo de su comentario', async () => {
    data.post.set(post);
    data.comments.set([
      commentFixture('c1', 1, { body: 'Primero' }),
      commentFixture('c2', 2, { body: 'Segundo' }),
      commentFixture('r1', 3, { body: 'Respuesta al primero', parentId: 'c1' }),
    ]);

    await open('/post/p1');

    const bodies = screen.getAllByText(/Primero|Segundo|Respuesta al primero/).map((node) =>
      [node.props.children].flat(3).filter((child) => typeof child === 'string').join(''),
    );
    expect(bodies).toEqual(['Primero', 'Respuesta al primero', 'Segundo']);
  });

  it('publicar envía el comentario recortado y vacía el campo', async () => {
    data.post.set(post);
    const add = jest.spyOn(comments, 'add');
    await open('/post/p1');

    await fireEvent.changeText(screen.getByLabelText('Comentario'), '  Qué buena foto  ');
    await fireEvent.press(screen.getByLabelText('Publicar comentario'));

    expect(add).toHaveBeenCalledWith({ postId: 'p1', body: 'Qué buena foto', parentId: null });
    expect(screen.getByLabelText('Comentario').props.value).toBe('');
  });

  it('responder cuelga el comentario del que se respondió', async () => {
    data.post.set(post);
    data.comments.set([commentFixture('c1', 1)]);
    const add = jest.spyOn(comments, 'add');
    await open('/post/p1');

    await fireEvent.press(screen.getByText('Responder'));
    expect(screen.getByText(/Respondiendo a user_beto/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Comentario'), 'Gracias');
    await fireEvent.press(screen.getByLabelText('Publicar comentario'));

    expect(add).toHaveBeenCalledWith({ postId: 'p1', body: 'Gracias', parentId: 'c1' });
  });

  it('un comentario aún no enviado se marca como tal', async () => {
    data.post.set(post);
    data.comments.set([commentFixture('c1', 1, { pending: true })]);

    await open('/post/p1');

    expect(screen.getByText('Enviando…')).toBeTruthy();
  });

  it('si no se puede guardar, devuelve el texto al campo para reintentar', async () => {
    data.post.set(post);
    jest.spyOn(comments, 'add').mockRejectedValue(new Error('fallo local'));
    await open('/post/p1');

    await fireEvent.changeText(screen.getByLabelText('Comentario'), 'Hola');
    await fireEvent.press(screen.getByLabelText('Publicar comentario'));

    expect(screen.getByLabelText('Comentario').props.value).toBe('Hola');
  });

  it('abre y cierra el canal de tiempo real con la pantalla', async () => {
    data.post.set(post);
    const unsubscribe = jest.fn();
    const subscribe = jest.spyOn(comments, 'subscribe').mockReturnValue(unsubscribe);
    await open('/post/p1');
    expect(subscribe).toHaveBeenCalledWith('p1');

    await screen.unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('una publicación que no existe o no se puede ver muestra un aviso', async () => {
    await open('/post/no-existe');

    expect(screen.getByText(/no está disponible/)).toBeTruthy();
  });
});

describe('perfil', () => {
  const privateDetails: ProfileDetails = {
    profile: { ...beto, isPrivate: true },
    postsCount: 4,
    followersCount: 10,
    followingCount: 2,
    followStatus: 'none',
  };

  it('cuenta privada que no sigo: contadores visibles, contenido oculto y botón Seguir', async () => {
    data.details.set(privateDetails);
    // Aunque hubiera publicaciones guardadas de antes, no se pintan.
    data.feed('author:beto').set([postFixture('p1', 1, { author: beto })]);
    const follow = jest.spyOn(profiles, 'follow');

    await open('/user/beto');

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/Esta cuenta es privada/)).toBeTruthy();
    expect(screen.queryByLabelText('Publicación de beto')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir' }));
    expect(follow).toHaveBeenCalledWith('beto');
  });

  it('solicitud pendiente: el botón la cancela', async () => {
    data.details.set({ ...privateDetails, followStatus: 'pending' });
    const unfollow = jest.spyOn(profiles, 'unfollow');
    await open('/user/beto');

    expect(screen.getByText(/Esta cuenta es privada/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Solicitado' }));

    expect(unfollow).toHaveBeenCalledWith('beto');
  });

  it('cuenta privada que sigo: se ve la cuadrícula', async () => {
    data.details.set({ ...privateDetails, followStatus: 'accepted' });
    data.feed('author:beto').set([postFixture('p1', 1, { author: beto })]);

    await open('/user/beto');

    expect(screen.getByLabelText('Publicación de beto')).toBeTruthy();
    expect(screen.queryByText(/Esta cuenta es privada/)).toBeNull();
  });

  it('mi perfil permite hacer la cuenta privada y cerrar sesión', async () => {
    const setPrivate = jest.spyOn(profiles, 'setPrivate');
    const { router } = await open('/profile');

    await fireEvent(screen.getByLabelText('Cuenta privada'), 'valueChange', true);
    expect(setPrivate).toHaveBeenCalledWith(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(router.getPathname()).toBe('/sign-in');
  });
});

describe('actividad', () => {
  it('aceptar una solicitud la envía y la quita de la lista', async () => {
    data.followRequests = [beto];
    const respond = jest.spyOn(profiles, 'respondToFollowRequest');
    await open('/activity');
    expect(screen.getByText('beto')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));

    expect(respond).toHaveBeenCalledWith('beto', true);
    expect(screen.queryByText('beto')).toBeNull();
  });

  it('rechazar la envía como rechazo', async () => {
    data.followRequests = [beto];
    const respond = jest.spyOn(profiles, 'respondToFollowRequest');
    await open('/activity');

    await fireEvent.press(screen.getByRole('button', { name: 'Rechazar' }));

    expect(respond).toHaveBeenCalledWith('beto', false);
  });

  it('sin solicitudes lo indica', async () => {
    await open('/activity');

    expect(screen.getByText(/No tienes solicitudes/)).toBeTruthy();
  });
});

describe('explorar', () => {
  it('busca usuarios tras una pausa al escribir y muestra los resultados', async () => {
    data.searchResults = [beto];
    const search = jest.spyOn(profiles, 'search');
    await open('/explore');

    await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), 'be');
    await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), 'bet');
    expect(search).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(300));

    // Una sola consulta, con el texto final.
    expect(search.mock.calls).toEqual([['bet']]);
    expect(screen.getByText('beto')).toBeTruthy();
  });
});

describe('mensajes', () => {
  const at = (minute: number) => `2026-01-01T10:${String(minute).padStart(2, '0')}:00+00:00`;
  const message = (id: string, minute: number, senderId: string, body: string): Message => ({
    id,
    conversationId: 'c-beto',
    senderId,
    body,
    createdAt: at(minute),
    pending: false,
  });
  const withBeto: Conversation = {
    id: 'c-beto',
    otherUser: beto,
    lastMessage: message('m2', 2, 'beto', '¿Vienes mañana?'),
    lastMessageAt: at(2),
    unreadCount: 2,
    otherLastDeliveredAt: null,
    otherLastReadAt: null,
  };

  it('el feed muestra cuántos mensajes hay sin leer', async () => {
    data.inbox.set([withBeto]);

    await open('/');

    expect(screen.getByLabelText('Mensajes, 2 sin leer')).toBeTruthy();
  });

  it('la bandeja lista las conversaciones con su último mensaje y abre el chat', async () => {
    data.inbox.set([withBeto]);
    const { router } = await open('/messages');

    expect(screen.getByText('beto')).toBeTruthy();
    expect(screen.getByText(/¿Vienes mañana\?/)).toBeTruthy();

    await fireEvent.press(screen.getByText('beto'));
    expect(router.getPathname()).toBe('/messages/c-beto');
  });

  it('la bandeja refleja lo que llega por tiempo real: mensaje nuevo y no leídos', async () => {
    data.inbox.set([{ ...withBeto, unreadCount: 0 }]);
    await open('/messages');
    expect(screen.queryByText('1')).toBeNull();

    // Lo que entrega la base local tras guardar un mensaje nuevo. El orden de la lista
    // también sale de ahí (ver las pruebas del repositorio).
    await act(async () =>
      data.inbox.set([
        { ...withBeto, unreadCount: 1, lastMessage: message('m9', 9, 'beto', 'Ya salí') },
      ]),
    );

    expect(screen.getByText(/Ya salí/)).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  describe('chat', () => {
    const history = [
      message('m3', 3, 'user-1', 'Sí, a las 8'),
      message('m2', 2, 'beto', '¿Vienes mañana?'),
    ];

    async function openChat(conversation: Conversation = withBeto, list: Message[] = history) {
      data.conversation.set(conversation);
      data.messages.set(list);
      return open('/messages/c-beto');
    }

    it('al abrirlo marca la conversación como leída', async () => {
      const markRead = jest.spyOn(messages, 'markRead');

      await openChat();

      expect(markRead).toHaveBeenCalledWith('c-beto');
    });

    it('enviar guarda el mensaje recortado, vacía el campo y avisa de que dejó de escribir', async () => {
      const send = jest.spyOn(messages, 'send');
      const notifyTyping = jest.fn();
      jest.spyOn(messages, 'joinTyping').mockReturnValue({ notifyTyping, leave: jest.fn() });
      await openChat();

      await fireEvent.changeText(screen.getByLabelText('Mensaje'), '  Nos vemos  ');
      expect(notifyTyping).toHaveBeenLastCalledWith(true);
      await fireEvent.press(screen.getByLabelText('Enviar mensaje'));

      expect(send).toHaveBeenCalledWith({ conversationId: 'c-beto', body: 'Nos vemos' });
      expect(notifyTyping).toHaveBeenLastCalledWith(false);
      expect(screen.getByLabelText('Mensaje').props.value).toBe('');
    });

    it.each([
      [{}, 'Enviado'],
      [{ otherLastDeliveredAt: at(4) }, 'Entregado'],
      [{ otherLastDeliveredAt: at(4), otherLastReadAt: at(5) }, 'Visto'],
    ])('con las marcas %p mi último mensaje aparece como "%s"', async (marks, label) => {
      await openChat({ ...withBeto, ...marks });

      expect(screen.getByText(label)).toBeTruthy();
    });

    it('un mensaje en la cola aparece como "Enviando…" aunque el otro haya leído los anteriores', async () => {
      const pending = { ...message('m4', 6, 'user-1', 'Llevo postre'), pending: true };

      await openChat({ ...withBeto, otherLastReadAt: at(5) }, [pending, ...history]);

      expect(screen.getByText('Enviando…')).toBeTruthy();
      expect(screen.queryByText('Visto')).toBeNull();
    });

    it('muestra "Escribiendo…" mientras el otro escribe', async () => {
      await openChat();
      expect(screen.queryByText('Escribiendo…')).toBeNull();

      await act(async () => data.receiveTyping(true));
      expect(screen.getByText('Escribiendo…')).toBeTruthy();

      await act(async () => data.receiveTyping(false));
      expect(screen.queryByText('Escribiendo…')).toBeNull();
    });

    it('al salir abandona el canal de escritura', async () => {
      const leave = jest.fn();
      jest.spyOn(messages, 'joinTyping').mockReturnValue({ notifyTyping: jest.fn(), leave });
      await openChat();

      await screen.unmount();

      expect(leave).toHaveBeenCalledTimes(1);
    });

    it('un enlace a una publicación dentro de un mensaje se puede abrir', async () => {
      const link = 'instagramclone://post/3f2b8c1e-9d4a-4c61-8f0e-2b7a5d9c1e44';
      const { router } = await openChat(withBeto, [message('m5', 5, 'beto', `Mira ${link}`)]);

      await fireEvent.press(screen.getByText('Ver publicación'));

      expect(router.getPathname()).toBe('/post/3f2b8c1e-9d4a-4c61-8f0e-2b7a5d9c1e44');
    });
  });

  it('desde un perfil se abre la conversación con esa persona', async () => {
    data.details.set({
      profile: beto,
      postsCount: 0,
      followersCount: 0,
      followingCount: 0,
      followStatus: 'accepted',
    });
    const openWith = jest.spyOn(messages, 'openConversationWith');
    const { router } = await open('/user/beto');

    await fireEvent.press(screen.getByRole('button', { name: 'Mensaje' }));

    expect(openWith).toHaveBeenCalledWith('beto');
    expect(router.getPathname()).toBe('/messages/c-beto');
  });
});
