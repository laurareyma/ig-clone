import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import type { PostQuery } from '@/data/remote/post-source';
import { OfflineFirstPostRepository } from '@/data/repositories/offline-first-post-repository';
import type { Post } from '@/domain/entities';
import type { Feed } from '@/domain/repositories/post-repository';
import { postFixture, profileFixture } from '@/testing/fixtures';
import { createTestDatabase } from '@/testing/node-sqlite';

const home: Feed = { kind: 'home' };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Servidor simulado: aplica el mismo orden y cursor que get_posts.
function fakeServer(initial: Post[]) {
  const state = { posts: [...initial] };
  const queries: PostQuery[] = [];

  const remote = {
    currentUserId: jest.fn(async () => 'ana'),
    fetchPosts: jest.fn(async (query: PostQuery) => {
      queries.push(query);
      return state.posts
        .filter((post) => !query.byId || post.id === query.byId)
        .filter((post) => !query.byAuthor || post.author.id === query.byAuthor)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .filter(
          (post) =>
            !query.cursor ||
            post.createdAt < query.cursor.createdAt ||
            (post.createdAt === query.cursor.createdAt && post.id < query.cursor.id),
        )
        .slice(0, query.pageSize);
    }),
    setLiked: jest.fn(async (_postId: string, _liked: boolean) => {}),
    insertPost: jest.fn(async (insert: { id: string; caption: string; imagePath: string }) => {
      state.posts.push(
        postFixture(insert.id, 59, { caption: insert.caption, imagePath: insert.imagePath }),
      );
    }),
  };

  return { remote, state, queries };
}

async function setup(initial: Post[] = [], pageSize = 2) {
  const db = createTestDatabase();
  await migrate(db);
  const server = fakeServer(initial);
  const uploader = {
    upload: jest.fn(async () => ({ width: 1080, height: 1350 })),
    remove: jest.fn(async () => {}),
  };
  const repository = new OfflineFirstPostRepository(
    async () => db,
    server.remote,
    uploader,
    new ChangeNotifier(),
    () => 'nuevo-id',
    pageSize,
  );

  // Lo que la UI vería ahora mismo en esa lista.
  const shown = async (feed: Feed = home) => {
    let latest: Post[] = [];
    const unsubscribe = repository.watchFeed(feed, (posts) => (latest = posts));
    await settle();
    unsubscribe();
    return latest;
  };
  const ids = async (feed?: Feed) => (await shown(feed)).map((post) => post.id);

  return { ...server, db, repository, uploader, shown, ids };
}

const five = [1, 2, 3, 4, 5].map((n) => postFixture(`p${n}`, n));

describe('listas de publicaciones', () => {
  it('refreshFeed guarda la primera página, de la más nueva a la más antigua', async () => {
    const { repository, ids } = await setup(five);

    expect(await repository.refreshFeed(home)).toEqual({ hasMore: true });

    expect(await ids()).toEqual(['p5', 'p4']);
  });

  it('loadMoreFeed pide desde la última guardada y añade sin repetir', async () => {
    const { repository, ids, queries } = await setup(five);
    await repository.refreshFeed(home);

    expect(await repository.loadMoreFeed(home)).toEqual({ hasMore: true });
    expect(queries.at(-1)?.cursor).toEqual({ createdAt: five[3].createdAt, id: 'p4' });
    expect(await ids()).toEqual(['p5', 'p4', 'p3', 'p2']);

    expect(await repository.loadMoreFeed(home)).toEqual({ hasMore: false });
    expect(await ids()).toEqual(['p5', 'p4', 'p3', 'p2', 'p1']);
  });

  it('una publicación nueva en el servidor no descoloca la paginación', async () => {
    const { repository, ids, state } = await setup(five);
    await repository.refreshFeed(home);
    state.posts.push(postFixture('p6', 6));

    await repository.loadMoreFeed(home);

    // Con OFFSET se repetiría p4; con cursor la página siguiente es exacta.
    expect(await ids()).toEqual(['p5', 'p4', 'p3', 'p2']);
  });

  it('refrescar quita de la lista lo que el servidor ya no devuelve', async () => {
    const { repository, ids, state } = await setup(five);
    await repository.refreshFeed(home);
    await repository.loadMoreFeed(home);
    state.posts = state.posts.filter((post) => post.id !== 'p5');

    await repository.refreshFeed(home);

    expect(await ids()).toEqual(['p4', 'p3']);
  });

  it('cada lista es independiente aunque compartan publicaciones', async () => {
    const mixed = [postFixture('a1', 1), postFixture('b1', 2, { author: profileFixture('beto') })];
    const { repository, ids, queries } = await setup(mixed);
    const betoGrid: Feed = { kind: 'author', userId: 'beto' };

    await repository.refreshFeed(home);
    await repository.refreshFeed(betoGrid);

    expect(queries.map((query) => [query.onlyFollowing, query.byAuthor])).toEqual([
      [true, undefined],
      [undefined, 'beto'],
    ]);
    expect(await ids(home)).toEqual(['b1', 'a1']);
    expect(await ids(betoGrid)).toEqual(['b1']);
    expect(await ids({ kind: 'explore' })).toEqual([]);
  });

  it('sin red, la lista guardada sigue disponible', async () => {
    const { repository, ids, remote } = await setup(five);
    await repository.refreshFeed(home);
    remote.fetchPosts.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.refreshFeed(home)).rejects.toThrow('sin conexión');

    expect(await ids()).toEqual(['p5', 'p4']);
  });

  it('el autor llega con la publicación', async () => {
    const { repository, shown } = await setup([postFixture('p1', 1)]);
    await repository.refreshFeed(home);

    expect((await shown())[0].author).toEqual(profileFixture('ana'));
  });
});

describe('una publicación', () => {
  it('refreshPost la guarda aunque no esté en ninguna lista (deep link)', async () => {
    const { repository } = await setup(five);
    const listener = jest.fn();
    repository.watchPost('p3', listener);

    await repository.refreshPost('p3');
    await settle();

    expect(listener).toHaveBeenLastCalledWith(five[2]);
  });

  it('si el servidor ya no la devuelve, se borra de local y de las listas', async () => {
    const { repository, ids, state } = await setup(five);
    await repository.refreshFeed(home);
    state.posts = state.posts.filter((post) => post.id !== 'p5');

    await repository.refreshPost('p5');

    expect(await ids()).toEqual(['p4']);
  });
});

describe('like', () => {
  it('se refleja en local antes de que responda el servidor', async () => {
    const { repository, shown, remote } = await setup(five);
    await repository.refreshFeed(home);
    let respond!: () => void;
    remote.setLiked.mockReturnValue(new Promise<void>((resolve) => (respond = resolve)));

    const pending = repository.setLiked('p5', true);
    await settle();

    expect((await shown())[0]).toMatchObject({ id: 'p5', likedByMe: true, likesCount: 1 });
    respond();
    await pending;
  });

  it('si el servidor falla, se deshace', async () => {
    const { repository, shown, remote } = await setup(five);
    await repository.refreshFeed(home);
    remote.setLiked.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.setLiked('p5', true)).rejects.toThrow('sin conexión');

    expect((await shown())[0]).toMatchObject({ likedByMe: false, likesCount: 0 });
  });

  it('repetir el mismo like no cuenta doble ni vuelve a llamar al servidor', async () => {
    const { repository, shown, remote } = await setup(five);
    await repository.refreshFeed(home);

    await repository.setLiked('p5', true);
    await repository.setLiked('p5', true);

    expect((await shown())[0].likesCount).toBe(1);
    expect(remote.setLiked).toHaveBeenCalledTimes(1);
  });

  it('quitar el like resta, sin bajar de cero', async () => {
    const { repository, shown } = await setup([postFixture('p1', 1, { likedByMe: true })]);
    await repository.refreshFeed(home);

    await repository.setLiked('p1', false);

    expect((await shown())[0]).toMatchObject({ likedByMe: false, likesCount: 0 });
  });
});

describe('crear publicación', () => {
  const draft = { imageUri: 'file:///foto.jpg', imageWidth: 4000, imageHeight: 3000, caption: 'hola' };

  it('sube la imagen a la carpeta del usuario y la muestra en Inicio y en su perfil', async () => {
    const { repository, ids, uploader, remote } = await setup();

    await repository.create(draft);

    expect(uploader.upload).toHaveBeenCalledWith(
      { uri: 'file:///foto.jpg', width: 4000, height: 3000 },
      'ana/nuevo-id.jpg',
    );
    // Las dimensiones que se guardan son las de la imagen ya reducida, no las originales.
    expect(remote.insertPost).toHaveBeenCalledWith({
      id: 'nuevo-id',
      imagePath: 'ana/nuevo-id.jpg',
      imageWidth: 1080,
      imageHeight: 1350,
      caption: 'hola',
    });
    expect(await ids(home)).toEqual(['nuevo-id']);
    expect(await ids({ kind: 'author', userId: 'ana' })).toEqual(['nuevo-id']);
  });

  it('si falla guardar la publicación, borra la imagen ya subida', async () => {
    const { repository, ids, uploader, remote } = await setup();
    remote.insertPost.mockRejectedValue(new Error('rechazado'));

    await expect(repository.create(draft)).rejects.toThrow('rechazado');

    expect(uploader.remove).toHaveBeenCalledWith('ana/nuevo-id.jpg');
    expect(await ids()).toEqual([]);
  });

  it('si falla la subida, no se crea la publicación', async () => {
    const { repository, uploader, remote } = await setup();
    uploader.upload.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.create(draft)).rejects.toThrow('sin conexión');

    expect(remote.insertPost).not.toHaveBeenCalled();
  });
});
