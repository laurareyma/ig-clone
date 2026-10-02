import { ChangeNotifier } from '@/data/local/change-notifier';
import { migrate } from '@/data/local/migrations';
import { OfflineFirstStoryRepository } from '@/data/repositories/offline-first-story-repository';
import type { Story, StoryGroup } from '@/domain/entities';
import { profileFixture } from '@/testing/fixtures';
import { createTestDatabase } from '@/testing/node-sqlite';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const start = new Date('2026-01-02T12:00:00Z');

const story = (id: string, authorId: string, hoursOld: number): Story => ({
  id,
  author: profileFixture(authorId),
  imagePath: `${authorId}/stories/${id}.jpg`,
  createdAt: new Date(start.getTime() - hoursOld * 3600_000).toISOString(),
  expiresAt: new Date(start.getTime() + (24 - hoursOld) * 3600_000).toISOString(),
  seen: false,
});

async function setup(serverStories: Story[] = []) {
  const db = createTestDatabase();
  await migrate(db);
  const state = { stories: serverStories, now: start };
  const remote = {
    currentUserId: jest.fn(async () => 'yo'),
    fetchStories: jest.fn(async () => state.stories),
    insertStory: jest.fn(async (created: { id: string; imagePath: string }) => {
      state.stories = [...state.stories, { ...story(created.id, 'yo', 0), imagePath: created.imagePath }];
    }),
  };
  const uploader = {
    upload: jest.fn(async () => ({ width: 1080, height: 1920 })),
    remove: jest.fn(async () => {}),
  };
  const create = () =>
    new OfflineFirstStoryRepository(
      async () => db,
      remote,
      uploader,
      new ChangeNotifier(),
      () => 'nueva',
      () => state.now,
    );
  const repository = create();

  const groups = async (target = repository) => {
    let latest: StoryGroup[] = [];
    const unsubscribe = target.watchGroups((value) => (latest = value));
    await settle();
    unsubscribe();
    return latest;
  };
  const shape = async (target = repository) =>
    (await groups(target)).map((group) => [
      group.author.id,
      group.stories.map((item) => [item.id, item.seen]),
    ]);

  return { repository, remote, uploader, state, groups, shape, create };
}

describe('OfflineFirstStoryRepository', () => {
  it('guarda las historias y las entrega agrupadas por autor', async () => {
    const { repository, shape } = await setup([story('b1', 'beto', 3), story('b2', 'beto', 1)]);

    await repository.refresh();

    expect(await shape()).toEqual([
      [
        'beto',
        [
          ['b1', false],
          ['b2', false],
        ],
      ],
    ]);
  });

  it('marcar como vista se guarda en el dispositivo y avisa a quien observa', async () => {
    const { repository, groups } = await setup([story('b1', 'beto', 3)]);
    await repository.refresh();
    const listener = jest.fn();
    repository.watchGroups(listener);
    await settle();

    await repository.markSeen('b1');
    await settle();

    expect(listener).toHaveBeenLastCalledWith([expect.objectContaining({ allSeen: true })]);
    expect((await groups())[0].stories[0].seen).toBe(true);
  });

  it('el "visto" sobrevive a refrescar y a reiniciar la app', async () => {
    const { repository, shape, create } = await setup([story('b1', 'beto', 3), story('b2', 'beto', 1)]);
    await repository.refresh();
    await repository.markSeen('b1');

    await repository.refresh();
    const afterRestart = create();

    const expected = [
      [
        'beto',
        [
          ['b1', true],
          ['b2', false],
        ],
      ],
    ];
    expect(await shape()).toEqual(expected);
    expect(await shape(afterRestart)).toEqual(expected);
  });

  it('marcar dos veces la misma no falla ni vuelve a avisar', async () => {
    const { repository } = await setup([story('b1', 'beto', 3)]);
    await repository.refresh();
    await repository.markSeen('b1');
    const listener = jest.fn();
    repository.watchGroups(listener);
    await settle();
    listener.mockClear();

    await repository.markSeen('b1');
    await settle();

    expect(listener).not.toHaveBeenCalled();
  });

  it('una historia caduca a las 24 h aunque no haya conexión para refrescar', async () => {
    const { repository, remote, state, shape } = await setup([story('b1', 'beto', 23)]);
    await repository.refresh();
    expect(await shape()).toHaveLength(1);
    remote.fetchStories.mockRejectedValue(new Error('sin conexión'));

    state.now = new Date(start.getTime() + 2 * 3600_000);

    expect(await shape()).toEqual([]);
  });

  it('refrescar quita las historias que el servidor ya no devuelve y sus marcas', async () => {
    const { repository, state, shape } = await setup([story('b1', 'beto', 3)]);
    await repository.refresh();
    await repository.markSeen('b1');
    state.stories = [];

    await repository.refresh();
    expect(await shape()).toEqual([]);

    // Si volviera a aparecer una historia con ese id, no arrastra un "visto" antiguo.
    state.stories = [story('b1', 'beto', 3)];
    await repository.refresh();
    expect((await shape())[0][1]).toEqual([['b1', false]]);
  });

  it('sin red, las historias guardadas siguen disponibles', async () => {
    const { repository, remote, shape } = await setup([story('b1', 'beto', 3)]);
    await repository.refresh();
    remote.fetchStories.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.refresh()).rejects.toThrow('sin conexión');

    expect(await shape()).toHaveLength(1);
  });

  it('crear sube la imagen a la carpeta del usuario y la historia aparece la primera', async () => {
    const { repository, uploader, remote, shape } = await setup([story('b1', 'beto', 3)]);
    const image = { uri: 'file:///foto.jpg', width: 3000, height: 4000 };

    await repository.create(image);

    expect(uploader.upload).toHaveBeenCalledWith(image, 'yo/stories/nueva.jpg');
    expect(remote.insertStory).toHaveBeenCalledWith({ id: 'nueva', imagePath: 'yo/stories/nueva.jpg' });
    expect((await shape()).map(([author]) => author)).toEqual(['yo', 'beto']);
  });

  it('si falla guardar la historia, borra la imagen ya subida', async () => {
    const { repository, uploader, remote } = await setup();
    remote.insertStory.mockRejectedValue(new Error('rechazado'));

    await expect(
      repository.create({ uri: 'file:///foto.jpg', width: 100, height: 100 }),
    ).rejects.toThrow('rechazado');

    expect(uploader.remove).toHaveBeenCalledWith('yo/stories/nueva.jpg');
  });
});
