import { ChangeNotifier } from '@/data/local/change-notifier';
import { clearUserData } from '@/data/local/clear-user-data';
import { migrate } from '@/data/local/migrations';
import { OfflineFirstProfileRepository } from '@/data/repositories/offline-first-profile-repository';
import type { Profile, ProfileDetails } from '@/domain/entities';
import { createTestDatabase } from '@/testing/node-sqlite';

const ana: Profile = {
  id: 'a',
  username: 'ana',
  fullName: 'Ana López',
  avatarUrl: null,
  bio: null,
  isPrivate: true,
};

const details = (followStatus: ProfileDetails['followStatus'], followersCount = 0) => ({
  profile: ana,
  postsCount: 3,
  followersCount,
  followingCount: 1,
  followStatus,
});

async function setup(remoteProfile: Profile | null = ana) {
  const db = createTestDatabase();
  await migrate(db);
  const changes = new ChangeNotifier();
  const remote = {
    currentUserId: jest.fn(async () => 'yo'),
    fetchProfile: jest.fn(async () => remoteProfile as Profile | null),
    fetchDetails: jest.fn(async () => details('none') as ProfileDetails | null),
    follow: jest.fn(async () => {}),
    unfollow: jest.fn(async () => {}),
    setPrivate: jest.fn(async () => {}),
    search: jest.fn(async () => [ana]),
    listFollowRequests: jest.fn(async () => [ana]),
    respondToFollowRequest: jest.fn(async () => {}),
    listFollowers: jest.fn(async () => []),
    listFollowing: jest.fn(async () => []),
  };
  const repository = new OfflineFirstProfileRepository(async () => db, remote, changes);
  return { db, changes, remote, repository };
}

// Deja correr las lecturas asíncronas que watch() dispara.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('OfflineFirstProfileRepository', () => {
  it('entrega null si el perfil no está en el dispositivo, sin tocar la red', async () => {
    const { repository, remote } = await setup();
    const listener = jest.fn();

    repository.watch('a', listener);
    await settle();

    expect(listener.mock.calls).toEqual([[null]]);
    expect(remote.fetchProfile).not.toHaveBeenCalled();
  });

  it('refresh guarda el perfil y avisa a quien lo observa', async () => {
    const { repository } = await setup();
    const listener = jest.fn();
    repository.watch('a', listener);
    await settle();

    await repository.refresh('a');
    await settle();

    expect(listener).toHaveBeenLastCalledWith(ana);
  });

  it('el perfil guardado sigue disponible aunque la red falle', async () => {
    const { repository, remote } = await setup();
    await repository.refresh('a');
    remote.fetchProfile.mockRejectedValue(new Error('sin conexión'));

    await expect(repository.refresh('a')).rejects.toThrow('sin conexión');
    const listener = jest.fn();
    repository.watch('a', listener);
    await settle();

    expect(listener.mock.calls).toEqual([[ana]]);
  });

  it('refresh actualiza un perfil que ya estaba guardado', async () => {
    const { repository, remote } = await setup();
    await repository.refresh('a');
    remote.fetchProfile.mockResolvedValue({ ...ana, bio: 'hola', isPrivate: false });

    await repository.refresh('a');
    const listener = jest.fn();
    repository.watch('a', listener);
    await settle();

    expect(listener).toHaveBeenLastCalledWith({ ...ana, bio: 'hola', isPrivate: false });
  });

  it('borra el perfil local si ya no existe en el servidor', async () => {
    const { repository, remote } = await setup();
    await repository.refresh('a');
    remote.fetchProfile.mockResolvedValue(null);
    const listener = jest.fn();
    repository.watch('a', listener);

    await repository.refresh('a');
    await settle();

    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it('deja de avisar tras cancelar la suscripción', async () => {
    const { repository } = await setup();
    const listener = jest.fn();
    const unsubscribe = repository.watch('a', listener);
    await settle();
    listener.mockClear();

    unsubscribe();
    await repository.refresh('a');
    await settle();

    expect(listener).not.toHaveBeenCalled();
  });

  it('clearUserData vacía los datos y avisa', async () => {
    const { repository, db, changes } = await setup();
    await repository.refresh('a');
    const listener = jest.fn();
    repository.watch('a', listener);
    await settle();

    await clearUserData(db, changes);
    await settle();

    expect(listener).toHaveBeenLastCalledWith(null);
  });

  describe('detalles y seguimiento', () => {
    it('los detalles se guardan y se entregan a quien los observa', async () => {
      const { repository } = await setup();
      const listener = jest.fn();
      repository.watchDetails('a', listener);
      await settle();
      expect(listener).toHaveBeenLastCalledWith(null);

      await repository.refreshDetails('a');
      await settle();

      expect(listener).toHaveBeenLastCalledWith(details('none'));
    });

    it('tras seguir, el estado es el que decide el servidor (pendiente en cuenta privada)', async () => {
      const { repository, remote } = await setup();
      await repository.refreshDetails('a');
      const listener = jest.fn();
      repository.watchDetails('a', listener);
      remote.fetchDetails.mockResolvedValue(details('pending'));

      await repository.follow('a');
      await settle();

      expect(remote.follow).toHaveBeenCalledWith('a');
      expect(listener).toHaveBeenLastCalledWith(details('pending'));
    });

    it('si seguir falla, el estado guardado no cambia', async () => {
      const { repository, remote } = await setup();
      await repository.refreshDetails('a');
      remote.follow.mockRejectedValue(new Error('sin conexión'));
      const listener = jest.fn();
      repository.watchDetails('a', listener);

      await expect(repository.follow('a')).rejects.toThrow('sin conexión');
      await settle();

      expect(listener).toHaveBeenLastCalledWith(details('none'));
    });

    it('aceptar una solicitud actualiza mi contador de seguidores', async () => {
      const { repository, remote } = await setup();

      await repository.respondToFollowRequest('b', true);

      expect(remote.respondToFollowRequest).toHaveBeenCalledWith('b', true);
      expect(remote.fetchDetails).toHaveBeenCalledWith('yo');
    });

    it('rechazar no necesita refrescar nada', async () => {
      const { repository, remote } = await setup();

      await repository.respondToFollowRequest('b', false);

      expect(remote.fetchDetails).not.toHaveBeenCalled();
    });
  });
});
