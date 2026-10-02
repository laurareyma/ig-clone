import type { ChangeNotifier } from '@/data/local/change-notifier';
import {
  addToFeed,
  clearFeed,
  deletePost,
  readFeed,
  readFeedCursor,
  readPost,
  setLiked,
  upsertPosts,
} from '@/data/local/post-store';
import type { SqlDatabase } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import type { PostImageUploader } from '@/data/remote/post-image-uploader';
import type { PostQuery, PostRemoteSource } from '@/data/remote/post-source';
import type { Post } from '@/domain/entities';
import {
  feedKey,
  type Feed,
  type FeedPage,
  type NewPost,
  type PostRepository,
} from '@/domain/repositories/post-repository';

export const PAGE_SIZE = 12;

function feedQuery(feed: Feed): Pick<PostQuery, 'onlyFollowing' | 'byAuthor'> {
  if (feed.kind === 'home') return { onlyFollowing: true };
  if (feed.kind === 'author') return { byAuthor: feed.userId };
  return {};
}

export class OfflineFirstPostRepository implements PostRepository {
  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly remote: PostRemoteSource,
    private readonly uploader: PostImageUploader,
    private readonly changes: ChangeNotifier,
    private readonly newId: () => string,
    private readonly pageSize = PAGE_SIZE,
  ) {}

  watchFeed(feed: Feed, listener: (posts: Post[]) => void): () => void {
    return watchQuery(
      this.changes,
      ['posts'],
      async () => readFeed(await this.getDb(), feedKey(feed)),
      listener,
    );
  }

  async refreshFeed(feed: Feed): Promise<FeedPage> {
    const posts = await this.remote.fetchPosts({ ...feedQuery(feed), pageSize: this.pageSize });
    const db = await this.getDb();
    const key = feedKey(feed);

    // La primera página reemplaza la lista: lo que ya no devuelve el servidor (borrado,
    // o de una cuenta que se volvió privada) desaparece. En una sola transacción para
    // que la UI nunca lea la lista vacía a medio reemplazar.
    await db.withTransactionAsync(async (tx) => {
      await upsertPosts(tx, posts);
      await clearFeed(tx, key);
      await addToFeed(
        tx,
        key,
        posts.map((post) => post.id),
      );
    });

    this.changes.notify('posts');
    return { hasMore: posts.length === this.pageSize };
  }

  async loadMoreFeed(feed: Feed): Promise<FeedPage> {
    const db = await this.getDb();
    const key = feedKey(feed);
    const cursor = await readFeedCursor(db, key);
    if (!cursor) return this.refreshFeed(feed);

    const posts = await this.remote.fetchPosts({
      ...feedQuery(feed),
      pageSize: this.pageSize,
      cursor,
    });

    await db.withTransactionAsync(async (tx) => {
      await upsertPosts(tx, posts);
      await addToFeed(
        tx,
        key,
        posts.map((post) => post.id),
      );
    });

    this.changes.notify('posts');
    return { hasMore: posts.length === this.pageSize };
  }

  watchPost(postId: string, listener: (post: Post | null) => void): () => void {
    return watchQuery(
      this.changes,
      ['posts'],
      async () => readPost(await this.getDb(), postId),
      listener,
    );
  }

  async refreshPost(postId: string): Promise<void> {
    const [post] = await this.remote.fetchPosts({ byId: postId, pageSize: 1 });
    const db = await this.getDb();

    await db.withTransactionAsync((tx) =>
      // Si el servidor no la devuelve, se borró o este usuario ya no puede verla.
      post ? upsertPosts(tx, [post]) : deletePost(tx, postId),
    );
    this.changes.notify('posts');
  }

  async setLiked(postId: string, liked: boolean): Promise<void> {
    const db = await this.getDb();

    // Primero el cambio local: la UI lo refleja al instante, sin esperar a la red.
    const changed = await setLiked(db, postId, liked);
    if (!changed) return;
    this.changes.notify('posts');

    try {
      await this.remote.setLiked(postId, liked);
    } catch (error) {
      // El servidor no lo aceptó: se deshace para no mostrar un estado falso.
      await setLiked(db, postId, !liked);
      this.changes.notify('posts');
      throw error;
    }
  }

  async create(post: NewPost): Promise<void> {
    const userId = await this.remote.currentUserId();
    const id = this.newId();
    // La política de Storage solo deja escribir dentro de la carpeta del propio usuario.
    const imagePath = `${userId}/${id}.jpg`;

    const { width, height } = await this.uploader.upload(
      { uri: post.imageUri, width: post.imageWidth, height: post.imageHeight },
      imagePath,
    );

    try {
      await this.remote.insertPost({
        id,
        imagePath,
        imageWidth: width,
        imageHeight: height,
        caption: post.caption,
      });
    } catch (error) {
      // Sin fila en posts la imagen quedaría huérfana en Storage.
      await this.uploader.remove(imagePath).catch(() => {});
      throw error;
    }

    // Se lee del servidor (trae created_at y el autor) y se coloca al principio de las
    // listas donde debe aparecer.
    const [created] = await this.remote.fetchPosts({ byId: id, pageSize: 1 });
    if (!created) return;

    const db = await this.getDb();
    await db.withTransactionAsync(async (tx) => {
      await upsertPosts(tx, [created]);
      await addToFeed(tx, feedKey({ kind: 'home' }), [id]);
      await addToFeed(tx, feedKey({ kind: 'author', userId }), [id]);
    });
    this.changes.notify('posts');
  }
}
