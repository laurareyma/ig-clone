import type { ChangeNotifier } from '@/data/local/change-notifier';
import type { SqlDatabase } from '@/data/local/sql-database';
import {
  profileFromLocal,
  profileToLocalParams,
  type LocalProfileRow,
} from '@/data/mappers/profile';
import type { ProfileRemoteSource } from '@/data/remote/profile-remote-source';
import type { Profile } from '@/domain/entities';
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
    let active = true;
    let lastRead = 0;

    const read = async () => {
      const thisRead = ++lastRead;
      const db = await this.getDb();
      const row = await db.getFirstAsync<LocalProfileRow>('SELECT * FROM profiles WHERE id = ?', [
        userId,
      ]);
      // Si mientras tanto empezó otra lectura, esta ya es vieja y no debe pisarla.
      if (active && thisRead === lastRead) listener(row ? profileFromLocal(row) : null);
    };

    void read();
    const unsubscribe = this.changes.subscribe('profiles', () => void read());

    return () => {
      active = false;
      unsubscribe();
    };
  }

  async refresh(userId: string): Promise<void> {
    const profile = await this.remote.fetchProfile(userId);
    const db = await this.getDb();

    if (profile) {
      await db.runAsync(
        `INSERT INTO profiles (id, username, full_name, avatar_url, bio, is_private)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           username = excluded.username,
           full_name = excluded.full_name,
           avatar_url = excluded.avatar_url,
           bio = excluded.bio,
           is_private = excluded.is_private`,
        profileToLocalParams(profile),
      );
    } else {
      // La cuenta ya no existe en el servidor.
      await db.runAsync('DELETE FROM profiles WHERE id = ?', [userId]);
    }

    this.changes.notify('profiles');
  }
}
