import type { ChangeNotifier } from '@/data/local/change-notifier';
import {
  deleteProfile,
  readProfile,
  readProfileDetails,
  upsertProfileDetails,
  upsertProfiles,
} from '@/data/local/profile-store';
import type { SqlDatabase } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import type { ProfileRemoteSource } from '@/data/remote/profile-source';
import type { Profile, ProfileDetails } from '@/domain/entities';
import type { ProfileRepository } from '@/domain/repositories/profile-repository';

// SQLite es la única fuente de verdad de la UI: se lee siempre de ahí y la red solo
// escribe en ella.
export class OfflineFirstProfileRepository implements ProfileRepository {
  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly remote: ProfileRemoteSource,
    private readonly changes: ChangeNotifier,
  ) {}

  watch(userId: string, listener: (profile: Profile | null) => void): () => void {
    return watchQuery(
      this.changes,
      ['profiles'],
      async () => readProfile(await this.getDb(), userId),
      listener,
    );
  }

  async refresh(userId: string): Promise<void> {
    const profile = await this.remote.fetchProfile(userId);
    const db = await this.getDb();

    if (profile) await upsertProfiles(db, [profile]);
    // La cuenta ya no existe en el servidor.
    else await db.withTransactionAsync((tx) => deleteProfile(tx, userId));

    this.changes.notify('profiles');
  }

  watchDetails(userId: string, listener: (details: ProfileDetails | null) => void): () => void {
    return watchQuery(
      this.changes,
      ['profiles'],
      async () => readProfileDetails(await this.getDb(), userId),
      listener,
    );
  }

  async refreshDetails(userId: string): Promise<void> {
    const details = await this.remote.fetchDetails(userId);
    const db = await this.getDb();

    await db.withTransactionAsync((tx) =>
      details ? upsertProfileDetails(tx, details) : deleteProfile(tx, userId),
    );
    this.changes.notify('profiles');
  }

  // Seguir, dejar de seguir y cambiar la privacidad no se calculan en el cliente: el
  // resultado depende de reglas del servidor (cuenta privada => pendiente), así que tras
  // la escritura se vuelve a leer el estado real.
  async follow(userId: string): Promise<void> {
    await this.remote.follow(userId);
    await this.refreshDetails(userId);
  }

  async unfollow(userId: string): Promise<void> {
    await this.remote.unfollow(userId);
    await this.refreshDetails(userId);
  }

  async setPrivate(isPrivate: boolean): Promise<void> {
    await this.remote.setPrivate(isPrivate);
    await this.refreshDetails(await this.remote.currentUserId());
  }

  search(query: string): Promise<Profile[]> {
    return this.remote.search(query);
  }

  listFollowRequests(): Promise<Profile[]> {
    return this.remote.listFollowRequests();
  }

  async respondToFollowRequest(followerId: string, accept: boolean): Promise<void> {
    await this.remote.respondToFollowRequest(followerId, accept);
    // Mi contador de seguidores cambia al aceptar.
    if (accept) await this.refreshDetails(await this.remote.currentUserId());
  }

  listFollowers(userId: string): Promise<Profile[]> {
    return this.remote.listFollowers(userId);
  }

  listFollowing(userId: string): Promise<Profile[]> {
    return this.remote.listFollowing(userId);
  }
}
