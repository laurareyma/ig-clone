import type { Post } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';

// Cada lista de publicaciones de la app. Comparten las mismas publicaciones guardadas;
// lo que cambia es cuáles pertenecen a cada una.
export type Feed =
  | { kind: 'home' }
  | { kind: 'explore' }
  | { kind: 'author'; userId: string };

export type FeedPage = {
  // false cuando ya se trajo la última página.
  hasMore: boolean;
};

export type NewPost = {
  // Archivo local elegido por el usuario.
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
};

export interface PostRepository {
  // Entrega las publicaciones guardadas en el dispositivo, de la más nueva a la más
  // antigua, y vuelve a entregarlas cuando cambian.
  watchFeed(feed: Feed, listener: (posts: Post[]) => void): Unsubscribe;
  // Trae la primera página del servidor y reemplaza la lista guardada.
  refreshFeed(feed: Feed): Promise<FeedPage>;
  // Trae la página siguiente a la última publicación guardada y la añade.
  loadMoreFeed(feed: Feed): Promise<FeedPage>;

  watchPost(postId: string, listener: (post: Post | null) => void): Unsubscribe;
  refreshPost(postId: string): Promise<void>;

  setLiked(postId: string, liked: boolean): Promise<void>;
  create(post: NewPost): Promise<void>;
}

export function feedKey(feed: Feed): string {
  return feed.kind === 'author' ? `author:${feed.userId}` : feed.kind;
}
