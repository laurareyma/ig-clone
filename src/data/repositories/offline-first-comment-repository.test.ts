import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import { upsertPosts } from '@/data/local/post-store';
import { upsertProfiles } from '@/data/local/profile-store';
import type { CommentEventHandlers } from '@/data/remote/comment-source';
import { OfflineFirstCommentRepository } from '@/data/repositories/offline-first-comment-repository';
import type { Comment } from '@/domain/entities';
import { commentFixture, postFixture, profileFixture } from '@/testing/fixtures';
import { createTestDatabase } from '@/testing/node-sqlite';
import { createTestOutbox } from '@/testing/test-outbox';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const me = profileFixture('ana');

async function setup(serverComments: Comment[] = []) {
  const db = createTestDatabase();
  await migrate(db);
  await upsertPosts(db, [postFixture('p1', 1, { commentsCount: serverComments.length })]);
  await upsertProfiles(db, [me]);

  let handlers!: CommentEventHandlers;
  const unsubscribeRemote = jest.fn();
  const remote = {
    currentUserId: jest.fn(async () => 'ana'),
    fetchComments: jest.fn(async () => serverComments),
    insertComment: jest.fn(async (_comment: Comment) => {}),
    subscribe: jest.fn((_postId: string, received: CommentEventHandlers) => {
      handlers = received;
      return unsubscribeRemote;
    }),
  };
  const profiles = { fetchProfile: jest.fn(async (id: string) => profileFixture(id)) };
  let nextId = 0;
  const changes = new ChangeNotifier();
  const queue = createTestOutbox(db, changes);
  const repository = new OfflineFirstCommentRepository(
    async () => db,
    remote,
    profiles,
    changes,
    queue.outbox,
    () => `local-${++nextId}`,
    () => '2026-01-01T00:30:00.000Z',
  );

  const shown = async () => {
    let latest: Comment[] = [];
    const unsubscribe = repository.watch('p1', (comments) => (latest = comments));
    await settle();
    unsubscribe();
    return latest;
  };
  const count = async () =>
    (await db.getFirstAsync<{ comments_count: number }>('SELECT comments_count FROM posts', []))!
      .comments_count;
  const event = (id: string, authorId = 'carla') => ({
    id,
    postId: 'p1',
    authorId,
    parentId: null,
    body: `evento ${id}`,
    createdAt: '2026-01-01T00:40:00+00:00',
  });

  const synced = async () => {
    await settle();
    await queue.outbox.process();
    await settle();
  };

  return {
    ...queue,
    synced,
    repository,
    remote,
    profiles,
    shown,
    count,
    event,
    unsubscribeRemote,
    emit: () => handlers,
  };
}

describe('comentarios guardados', () => {
  it('refresh los guarda con su autor, del más antiguo al más nuevo', async () => {
    const { repository, shown } = await setup([commentFixture('c2', 2), commentFixture('c1', 1)]);

    await repository.refresh('p1');

    expect(await shown()).toEqual([commentFixture('c1', 1), commentFixture('c2', 2)]);
  });

  it('refresh reemplaza: un comentario borrado en el servidor desaparece', async () => {
    const server = [commentFixture('c1', 1), commentFixture('c2', 2)];
    const { repository, shown } = await setup(server);
    await repository.refresh('p1');
    server.pop();

    await repository.refresh('p1');

    expect((await shown()).map((comment) => comment.id)).toEqual(['c1']);
  });
});

describe('publicar un comentario', () => {
  it('aparece al instante, marcado como pendiente y sumado al contador', async () => {
    const { repository, remote, shown, count, synced } = await setup();
    let respond!: () => void;
    remote.insertComment.mockReturnValue(new Promise<void>((resolve) => (respond = resolve)));

    await repository.add({ postId: 'p1', body: 'hola', parentId: 'c1' });

    expect(await shown()).toEqual([
      {
        id: 'local-1',
        postId: 'p1',
        author: me,
        parentId: 'c1',
        body: 'hola',
        createdAt: '2026-01-01T00:30:00.000Z',
        pending: true,
      },
    ]);
    expect(await count()).toBe(1);
    respond();
    await synced();
  });

  it('cuando el servidor lo confirma deja de estar pendiente', async () => {
    const { repository, remote, shown, synced } = await setup();

    await repository.add({ postId: 'p1', body: 'hola', parentId: null });
    await synced();

    expect(remote.insertComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1' }));
    expect(await shown()).toMatchObject([{ id: 'local-1', pending: false }]);
  });

  it('sin conexión se guarda en la cola y se envía, en orden, al reconectar', async () => {
    const { repository, remote, shown, rows, setOnline, outbox, synced } = await setup();
    outbox.start();
    setOnline(false);

    await repository.add({ postId: 'p1', body: 'primero', parentId: null });
    await repository.add({ postId: 'p1', body: 'segundo', parentId: 'local-1' });

    expect((await shown()).map((comment) => comment.pending)).toEqual([true, true]);
    expect(remote.insertComment).not.toHaveBeenCalled();
    expect(await rows()).toMatchObject([{ entity_id: 'local-1' }, { entity_id: 'local-2' }]);

    setOnline(true);
    await synced();

    // La respuesta va después del comentario al que responde: si llegara antes, la
    // clave foránea del servidor la rechazaría.
    expect(remote.insertComment.mock.calls.map(([comment]) => comment.body)).toEqual([
      'primero',
      'segundo',
    ]);
    expect((await shown()).map((comment) => comment.pending)).toEqual([false, false]);
  });

  it('refrescar no borra un comentario que sigue en la cola', async () => {
    const server = [commentFixture('c1', 1)];
    const { repository, shown, count, setOnline } = await setup(server);
    setOnline(false);
    await repository.add({ postId: 'p1', body: 'hola', parentId: null });

    // El servidor aún no lo conoce: su lista no lo incluye.
    await repository.refresh('p1');

    expect((await shown()).map((comment) => comment.id)).toEqual(['c1', 'local-1']);
    expect(await count()).toBe(2);
  });

  it('si el servidor lo rechaza, se retira y el contador vuelve atrás', async () => {
    const { repository, remote, shown, count, rows, synced } = await setup();
    remote.insertComment.mockRejectedValue({ code: '23503', message: 'foreign key violation' });

    await repository.add({ postId: 'p1', body: 'hola', parentId: null });
    await synced();

    expect(await shown()).toEqual([]);
    expect(await count()).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it('un fallo de red lo deja pendiente, sin perderlo', async () => {
    const { repository, remote, shown, count, synced } = await setup();
    remote.insertComment.mockRejectedValue(new TypeError('Network request failed'));

    await repository.add({ postId: 'p1', body: 'hola', parentId: null });
    await synced();

    expect(await shown()).toMatchObject([{ id: 'local-1', pending: true }]);
    expect(await count()).toBe(1);
  });
});

describe('tiempo real', () => {
  it('un comentario de otra persona entra en local con su perfil y suma al contador', async () => {
    const { repository, emit, event, shown, count, profiles } = await setup();
    repository.subscribe('p1');

    emit().onInsert(event('r1', 'carla'));
    await settle();

    expect(profiles.fetchProfile).toHaveBeenCalledWith('carla');
    expect(await shown()).toMatchObject([{ id: 'r1', author: { username: 'user_carla' } }]);
    expect(await count()).toBe(1);
  });

  it('el eco de un comentario propio no se duplica ni cuenta dos veces', async () => {
    const { repository, emit, event, shown, count } = await setup();
    repository.subscribe('p1');
    await repository.add({ postId: 'p1', body: 'hola', parentId: null });

    emit().onInsert(event('local-1', 'ana'));
    await settle();

    expect(await shown()).toHaveLength(1);
    expect(await count()).toBe(1);
  });

  it('un borrado quita el comentario y resta; si no estaba guardado, se ignora', async () => {
    const { repository, emit, event, shown, count } = await setup();
    repository.subscribe('p1');
    emit().onInsert(event('r1'));
    await settle();

    emit().onDelete('de-otro-post');
    emit().onDelete('r1');
    await settle();

    expect(await shown()).toEqual([]);
    expect(await count()).toBe(0);
  });

  it('al quedar activo el canal (o al reconectar) trae lo que no llegó como evento', async () => {
    const server = [commentFixture('c1', 1)];
    const { repository, remote, emit, shown } = await setup(server);
    repository.subscribe('p1');
    // Publicado mientras el canal todavía se estaba conectando.
    server.push(commentFixture('c2', 2));

    emit().onSubscribed();
    await settle();

    expect(remote.fetchComments).toHaveBeenCalledWith('p1');
    expect((await shown()).map((comment) => comment.id)).toEqual(['c1', 'c2']);
  });

  it('cancelar la suscripción cierra el canal', async () => {
    const { repository, unsubscribeRemote } = await setup();

    repository.subscribe('p1')();

    expect(unsubscribeRemote).toHaveBeenCalledTimes(1);
  });
});
