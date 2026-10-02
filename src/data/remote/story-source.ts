import { authorFromRow, type AuthorColumns } from '@/data/mappers/profile';
import { currentUserId, type Client } from '@/data/remote/current-user';
import type { Story } from '@/domain/entities';

export interface StoryRemoteSource {
  currentUserId(): Promise<string>;
  fetchStories(): Promise<Story[]>;
  insertStory(story: { id: string; imagePath: string }): Promise<void>;
}

type StoryRow = AuthorColumns & {
  id: string;
  image_path: string;
  created_at: string;
  expires_at: string;
};

export class SupabaseStorySource implements StoryRemoteSource {
  constructor(private readonly client: Client) {}

  currentUserId(): Promise<string> {
    return currentUserId(this.client);
  }

  async fetchStories(): Promise<Story[]> {
    const { data, error } = await this.client.rpc('get_stories');

    if (error) throw error;
    return (data as StoryRow[]).map((row) => ({
      id: row.id,
      author: authorFromRow(row),
      imagePath: row.image_path,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      // "Visto" no existe en el servidor: lo añade la base local.
      seen: false,
    }));
  }

  async insertStory(story: { id: string; imagePath: string }): Promise<void> {
    // La caducidad (24 h) la fija el servidor: el cliente no tiene permiso sobre esa
    // columna.
    const { error } = await this.client.from('stories').insert({
      id: story.id,
      author_id: await this.currentUserId(),
      image_path: story.imagePath,
    });
    if (error) throw error;
  }
}
