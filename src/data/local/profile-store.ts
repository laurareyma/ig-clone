import type { SqlExecutor } from '@/data/local/sql-database';
import {
  PROFILE_COLUMNS,
  profileDetailsFromLocal,
  profileFromRow,
  profileToLocalParams,
  type LocalProfileDetailsRow,
  type ProfileRow,
} from '@/data/mappers/profile';
import type { Profile, ProfileDetails } from '@/domain/entities';

export async function upsertProfiles(db: SqlExecutor, profiles: Profile[]): Promise<void> {
  for (const profile of profiles) {
    await db.runAsync(
      `INSERT INTO profiles (${PROFILE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         username = excluded.username,
         full_name = excluded.full_name,
         avatar_url = excluded.avatar_url,
         bio = excluded.bio,
         is_private = excluded.is_private`,
      profileToLocalParams(profile),
    );
  }
}

export async function readProfile(db: SqlExecutor, userId: string): Promise<Profile | null> {
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [userId]);
  return row ? profileFromRow(row) : null;
}

export async function deleteProfile(db: SqlExecutor, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM profiles WHERE id = ?', [userId]);
  await db.runAsync('DELETE FROM profile_details WHERE id = ?', [userId]);
}

export async function upsertProfileDetails(db: SqlExecutor, details: ProfileDetails): Promise<void> {
  await upsertProfiles(db, [details.profile]);
  await db.runAsync(
    `INSERT INTO profile_details (id, posts_count, followers_count, following_count, follow_status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       posts_count = excluded.posts_count,
       followers_count = excluded.followers_count,
       following_count = excluded.following_count,
       follow_status = excluded.follow_status`,
    [
      details.profile.id,
      details.postsCount,
      details.followersCount,
      details.followingCount,
      details.followStatus,
    ],
  );
}

export async function readProfileDetails(
  db: SqlExecutor,
  userId: string,
): Promise<ProfileDetails | null> {
  const row = await db.getFirstAsync<LocalProfileDetailsRow>(
    `SELECT p.*, d.posts_count, d.followers_count, d.following_count, d.follow_status
     FROM profile_details d JOIN profiles p ON p.id = d.id
     WHERE d.id = ?`,
    [userId],
  );
  return row ? profileDetailsFromLocal(row) : null;
}
