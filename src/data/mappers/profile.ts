import type { SqlValue } from '@/data/local/sql-database';
import type { Tables } from '@/data/remote/database.types';
import type { Profile } from '@/domain/entities';

// Los nombres de columna (snake_case) no salen de la capa de datos.

export type RemoteProfileRow = Pick<
  Tables<'profiles'>,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'bio' | 'is_private'
>;

export const REMOTE_PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, is_private';

export type LocalProfileRow = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  // SQLite no tiene booleanos.
  is_private: number;
};

export function profileFromRemote(row: RemoteProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isPrivate: row.is_private,
  };
}

export function profileFromLocal(row: LocalProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isPrivate: row.is_private === 1,
  };
}

// En el orden de: id, username, full_name, avatar_url, bio, is_private.
export function profileToLocalParams(profile: Profile): SqlValue[] {
  return [
    profile.id,
    profile.username,
    profile.fullName,
    profile.avatarUrl,
    profile.bio,
    profile.isPrivate ? 1 : 0,
  ];
}
