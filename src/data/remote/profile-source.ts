import { PROFILE_COLUMNS, profileFromRow, type ProfileRow } from '@/data/mappers/profile';
import { currentUserId, type Client } from '@/data/remote/current-user';
import type { FollowStatus, Profile, ProfileDetails } from '@/domain/entities';

export interface ProfileRemoteSource {
  currentUserId(): Promise<string>;
  fetchProfile(userId: string): Promise<Profile | null>;
  fetchDetails(userId: string): Promise<ProfileDetails | null>;
  follow(userId: string): Promise<void>;
  unfollow(userId: string): Promise<void>;
  setPrivate(isPrivate: boolean): Promise<void>;
  search(query: string): Promise<Profile[]>;
  listFollowRequests(): Promise<Profile[]>;
  respondToFollowRequest(followerId: string, accept: boolean): Promise<void>;
  listFollowers(userId: string): Promise<Profile[]>;
  listFollowing(userId: string): Promise<Profile[]>;
}

const SEARCH_LIMIT = 20;

export class SupabaseProfileSource implements ProfileRemoteSource {
  constructor(private readonly client: Client) {}

  currentUserId(): Promise<string> {
    return currentUserId(this.client);
  }

  async fetchProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? profileFromRow(data) : null;
  }

  async fetchDetails(userId: string): Promise<ProfileDetails | null> {
    const me = await this.currentUserId();

    const [profile, stats, follow] = await Promise.all([
      this.fetchProfile(userId),
      // Los contadores son visibles aunque la cuenta sea privada; las listas no.
      this.client.rpc('get_profile_stats', { target: userId }).single(),
      this.client
        .from('follows')
        .select('status')
        .eq('follower_id', me)
        .eq('following_id', userId)
        .maybeSingle(),
    ]);

    if (stats.error) throw stats.error;
    if (follow.error) throw follow.error;
    if (!profile) return null;

    const followStatus: FollowStatus = me === userId ? 'self' : (follow.data?.status ?? 'none');

    return {
      profile,
      postsCount: stats.data.posts,
      followersCount: stats.data.followers,
      followingCount: stats.data.following,
      followStatus,
    };
  }

  async follow(userId: string): Promise<void> {
    // El estado inicial (pending o accepted) lo fija un trigger según la cuenta sea
    // privada o no; el cliente ni siquiera tiene permiso para enviarlo.
    const { error } = await this.client.from('follows').upsert(
      { follower_id: await this.currentUserId(), following_id: userId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  async unfollow(userId: string): Promise<void> {
    const { error } = await this.client
      .from('follows')
      .delete()
      .eq('follower_id', await this.currentUserId())
      .eq('following_id', userId);
    if (error) throw error;
  }

  async setPrivate(isPrivate: boolean): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ is_private: isPrivate })
      .eq('id', await this.currentUserId());
    if (error) throw error;
  }

  async search(query: string): Promise<Profile[]> {
    // % y _ son comodines de LIKE: se escapan para buscarlos como texto.
    const prefix = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    if (!prefix) return [];

    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .like('username', `${prefix}%`)
      .order('username')
      .limit(SEARCH_LIMIT);

    if (error) throw error;
    return data.map(profileFromRow);
  }

  async listFollowRequests(): Promise<Profile[]> {
    return this.listFollows('follower', 'following_id', await this.currentUserId(), 'pending');
  }

  async respondToFollowRequest(followerId: string, accept: boolean): Promise<void> {
    const me = await this.currentUserId();
    const request = this.client.from('follows');

    // Rechazar es borrar la fila: no existe un estado "rechazado".
    const { error } = accept
      ? await request
          .update({ status: 'accepted' })
          .eq('follower_id', followerId)
          .eq('following_id', me)
      : await request.delete().eq('follower_id', followerId).eq('following_id', me);
    if (error) throw error;
  }

  listFollowers(userId: string): Promise<Profile[]> {
    return this.listFollows('follower', 'following_id', userId, 'accepted');
  }

  listFollowing(userId: string): Promise<Profile[]> {
    return this.listFollows('following', 'follower_id', userId, 'accepted');
  }

  // Trae los perfiles de un lado de la relación. Si la RLS no deja ver los follows de
  // esa cuenta, la consulta devuelve una lista vacía, no un error.
  private async listFollows(
    side: 'follower' | 'following',
    filterColumn: 'follower_id' | 'following_id',
    userId: string,
    status: 'pending' | 'accepted',
  ): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('follows')
      .select(`profile:profiles!follows_${side}_id_fkey(${PROFILE_COLUMNS})`)
      .eq(filterColumn, userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as unknown as { profile: ProfileRow }[]).map((row) => profileFromRow(row.profile));
  }
}
