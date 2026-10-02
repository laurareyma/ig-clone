import type { SqlValue } from '@/data/local/sql-database';
import type { FollowStatus, Profile, ProfileDetails } from '@/domain/entities';

// Los nombres de columna (snake_case) no salen de la capa de datos.

// Fila de perfil tal como llega de Supabase (is_private booleano) o de SQLite (0/1).
export type ProfileRow = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean | number;
};

export const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, is_private';

export function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isPrivate: Boolean(row.is_private),
  };
}

// Perfil incrustado en otra fila con las columnas prefijadas (author_username, ...).
export type AuthorColumns = {
  author_id: string;
  author_username: string;
  author_full_name: string | null;
  author_avatar_url: string | null;
  author_bio: string | null;
  author_is_private: boolean | number;
};

export const AUTHOR_COLUMNS = `
  a.id AS author_id, a.username AS author_username, a.full_name AS author_full_name,
  a.avatar_url AS author_avatar_url, a.bio AS author_bio, a.is_private AS author_is_private`;

export function authorFromRow(row: AuthorColumns): Profile {
  return {
    id: row.author_id,
    username: row.author_username,
    fullName: row.author_full_name,
    avatarUrl: row.author_avatar_url,
    bio: row.author_bio,
    isPrivate: Boolean(row.author_is_private),
  };
}

// En el orden de PROFILE_COLUMNS.
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

export type LocalProfileDetailsRow = ProfileRow & {
  posts_count: number;
  followers_count: number;
  following_count: number;
  follow_status: string;
};

export function profileDetailsFromLocal(row: LocalProfileDetailsRow): ProfileDetails {
  return {
    profile: profileFromRow(row),
    postsCount: row.posts_count,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    followStatus: row.follow_status as FollowStatus,
  };
}
