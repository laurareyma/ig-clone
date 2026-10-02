import { ChangeNotifier } from '@/data/local/change-notifier';
import { clearUserData } from '@/data/local/clear-user-data';
import { migrate } from '@/data/local/migrations';
import { OfflineFirstProfileRepository } from '@/data/repositories/offline-first-profile-repository';
import type { Profile } from '@/domain/entities';
import { createTestDatabase } from '@/testing/node-sqlite';

const ana: Profile = {
  id: 'a',
  username: 'ana',
  fullName: 'Ana López',
  avatarUrl: null,
  bio: null,
  isPrivate: true,
};

async function setup(remoteProfile: Profile | null = ana) {
  const db = createTestDatabase();
  await migrate(db);
  const changes = new ChangeNotifier();
  const remote = { fetchProfile: jest.fn(async () => remoteProfile as Profile | null) };
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
});
