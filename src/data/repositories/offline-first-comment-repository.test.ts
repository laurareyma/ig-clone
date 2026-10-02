import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import { upsertPosts } from '@/data/local/post-store';
import { upsertProfiles } from '@/data/local/profile-store';
import type { CommentEventHandlers } from '@/data/remote/comment-source';
import { OfflineFirstCommentRepository } from '@/data/repositories/offline-first-comment-repository';
import type { Comment } from '@/domain/entities';
import { commentFixture, postFixture, profileFixture } from '@/testing/fixtures';
import { createTestDatabase } from '@/testing/node-sqlite';

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
  const repository = new OfflineFirstCommentRepository(
    async () => db,
    remote,
    profiles,
    new ChangeNotifier(),
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

  return {
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
  it('aparece en local, con el contador, antes de que responda el servidor', async () => {
    const { repository, remote, shown, count } = await setup();
    let respond!: () => void;
    remote.insertComment.mockReturnValue(new Promise<void>((resolve) => (respond = resolve)));

    const pending = repository.add({ postId: 'p1', body: 'hola', parentId: 'c1' });
    await settle();

    expect(await shown()).toEqual([
      {
        id: 'local-1',
        postId: 'p1',
        author: me,
        parentId: 'c1',
        body: 'hola',
        createdAt: '2026-01-01T00:30:00.000Z',
      },
    ]);
    expect(await count()).toBe(1);
    respond();
    await pending;
  });

  it('envía al servidor el mismo id que guardó en local', async () => {
    const { repository, remote } = await setup();

    await repository.add({ postId: 'p1', body: 'hola', parentId: null });

    expect(remote.insertComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1' }));
  });

  it('si el servidor falla, se retira y el contador vuelve atrás', async () => {
    const { repository, remote, shown, count } = await setup();
    remote.insertComment.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.add({ postId: 'p1', body: 'hola', parentId: null })).rejects.toThrow(
      'sin conexión',
    );

    expect(await shown()).toEqual([]);
    expect(await count()).toBe(0);
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

  it('cancelar la suscripción cierra el canal', async () => {
    const { repository, unsubscribeRemote } = await setup();

    repository.subscribe('p1')();

    expect(unsubscribeRemote).toHaveBeenCalledTimes(1);
  });
});
