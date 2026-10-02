import type { ChangeNotifier } from '@/data/local/change-notifier';
import {
  addToFeed,
  adjustCommentsCount,
  clearFeed,
  deletePost,
  readFeed,
  readFeedCursor,
  readPost,
  setLiked,
  upsertPosts,
} from '@/data/local/post-store';
import type { SqlDatabase, SqlExecutor } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import type { PostImageUploader } from '@/data/remote/post-image-uploader';
import type { PostQuery, PostRemoteSource } from '@/data/remote/post-source';
import { COMMENT, LIKE, type CommentPayload, type LikePayload } from '@/data/sync/operations';
import type { Outbox } from '@/data/sync/outbox';
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
    private readonly outbox: Outbox,
    private readonly newId: () => string,
    private readonly pageSize = PAGE_SIZE,
  ) {
    outbox.register<LikePayload>(LIKE, {
      // Solo cambia la fila si el estado es distinto, así repetirlo no cuenta doble.
      applyLocal: async (tx, { postId, liked }) => void (await setLiked(tx, postId, liked)),
      // Idempotente en el servidor: repetir un like no falla ni suma (clave primaria
      // post_id + user_id) y borrar uno que no existe no hace nada.
      send: ({ postId, liked }) => this.remote.setLiked(postId, liked),
      // Rechazado (el post se borró o dejó de ser visible): se trae la verdad del
      // servidor. Si no se puede, al menos se deshace el cambio local.
      discard: ({ postId, liked }) =>
        this.refreshPost(postId).catch(async () => {
          await setLiked(await this.getDb(), postId, !liked);
          this.changes.notify('posts');
        }),
      tables: ['posts'],
    });
  }

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
      await this.saveFromServer(tx, posts);
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
      await this.saveFromServer(tx, posts);
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
      post ? this.saveFromServer(tx, [post]) : deletePost(tx, postId),
    );
    this.changes.notify('posts');
  }

  async setLiked(postId: string, liked: boolean): Promise<void> {
    const post = await readPost(await this.getDb(), postId);
    // Ya está en ese estado: no hay nada que enviar.
    if (!post || post.likedByMe === liked) return;

    // El cambio local y la operación pendiente se guardan juntos; el envío al servidor
    // lo hace la cola, ahora o cuando vuelva la conexión.
    await this.outbox.enqueue<LikePayload>(LIKE, postId, { postId, liked });
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
      await this.saveFromServer(tx, [created]);
      await addToFeed(tx, feedKey({ kind: 'home' }), [id]);
      await addToFeed(tx, feedKey({ kind: 'author', userId }), [id]);
    });
    this.changes.notify('posts');
  }

  // Guarda lo que llega del servidor y vuelve a aplicar encima las acciones que siguen en
  // la cola. El servidor aún no las conoce, así que sus datos las "deshacen": sin esto,
  // refrescar sin conexión estable haría parpadear un like recién dado.
  private async saveFromServer(tx: SqlExecutor, posts: Post[]): Promise<void> {
    await upsertPosts(tx, posts);
    const saved = new Set(posts.map((post) => post.id));

    for (const like of await this.outbox.pending<LikePayload>(tx, LIKE)) {
      if (saved.has(like.postId)) await setLiked(tx, like.postId, like.liked);
    }
    for (const comment of await this.outbox.pending<CommentPayload>(tx, COMMENT)) {
      if (saved.has(comment.postId)) await adjustCommentsCount(tx, comment.postId, 1);
    }
  }
}
