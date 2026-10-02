import { postFromRow, type PostRow } from '@/data/mappers/post';
import { currentUserId, type Client } from '@/data/remote/current-user';
import type { Post } from '@/domain/entities';

export type PostQuery = {
  pageSize: number;
  // Última publicación ya recibida; se devuelven las anteriores a ella.
  cursor?: { createdAt: string; id: string };
  onlyFollowing?: boolean;
  byAuthor?: string;
  byId?: string;
};

export type PostInsert = {
  id: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
};

export interface PostRemoteSource {
  currentUserId(): Promise<string>;
  fetchPosts(query: PostQuery): Promise<Post[]>;
  setLiked(postId: string, liked: boolean): Promise<void>;
  insertPost(post: PostInsert): Promise<void>;
}

export class SupabasePostSource implements PostRemoteSource {
  constructor(private readonly client: Client) {}

  currentUserId(): Promise<string> {
    return currentUserId(this.client);
  }

  async fetchPosts(query: PostQuery): Promise<Post[]> {
    const { data, error } = await this.client.rpc('get_posts', {
      page_size: query.pageSize,
      cursor_created_at: query.cursor?.createdAt,
      cursor_id: query.cursor?.id,
      only_following: query.onlyFollowing,
      by_author: query.byAuthor,
      by_id: query.byId,
    });

    if (error) throw error;
    // Los tipos generados no reflejan que las columnas del autor pueden ser null.
    return (data as PostRow[]).map(postFromRow);
  }

  async setLiked(postId: string, liked: boolean): Promise<void> {
    const userId = await this.currentUserId();

    // Las dos operaciones son idempotentes: repetir un like no falla ni cuenta doble
    // (clave primaria post_id + user_id) y borrar uno que no existe no hace nada.
    const { error } = liked
      ? await this.client
          .from('likes')
          .upsert(
            { post_id: postId, user_id: userId },
            { onConflict: 'post_id,user_id', ignoreDuplicates: true },
          )
      : await this.client.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  }

  async insertPost(post: PostInsert): Promise<void> {
    const { error } = await this.client.from('posts').insert({
      id: post.id,
      author_id: await this.currentUserId(),
      image_path: post.imagePath,
      image_width: post.imageWidth,
      image_height: post.imageHeight,
      caption: post.caption,
    });
    if (error) throw error;
  }
}
