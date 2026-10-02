import type { SupabaseClient } from '@supabase/supabase-js';

import { profileFromRemote, REMOTE_PROFILE_COLUMNS } from '@/data/mappers/profile';
import type { Database } from '@/data/remote/database.types';
import type { Profile } from '@/domain/entities';

export interface ProfileRemoteSource {
  fetchProfile(userId: string): Promise<Profile | null>;
}

export class SupabaseProfileSource implements ProfileRemoteSource {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async fetchProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(REMOTE_PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? profileFromRemote(data) : null;
  }
}
