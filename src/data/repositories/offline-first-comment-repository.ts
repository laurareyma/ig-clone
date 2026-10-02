import type { ChangeNotifier } from '@/data/local/change-notifier';
import {
  deleteComment,
  insertComment,
  readComments,
  replaceComments,
} from '@/data/local/comment-store';
import { adjustCommentsCount } from '@/data/local/post-store';
import { readProfile } from '@/data/local/profile-store';
import type { SqlDatabase } from '@/data/local/sql-database';
import { watchQuery } from '@/data/local/watch-query';
import type { CommentRemoteSource, RemoteCommentEvent } from '@/data/remote/comment-source';
import { COMMENT, type CommentPayload } from '@/data/sync/operations';
import type { Outbox } from '@/data/sync/outbox';
import type { Comment, Profile } from '@/domain/entities';
import type { CommentRepository, NewComment } from '@/domain/repositories/comment-repository';

type ProfileFetcher = { fetchProfile(userId: string): Promise<Profile | null> };

export class OfflineFirstCommentRepository implements CommentRepository {
  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly remote: CommentRemoteSource,
    private readonly profiles: ProfileFetcher,
    private readonly changes: ChangeNotifier,
    private readonly outbox: Outbox,
    private readonly newId: () => string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    outbox.register<CommentPayload>(COMMENT, {
      applyLocal: async (tx, comment) => {
        if (await insertComment(tx, comment)) await adjustCommentsCount(tx, comment.postId, 1);
      },
      // El id lo generó el cliente: si se reenvía, el servidor ignora el duplicado.
      send: (comment) => this.remote.insertComment(comment),
      // Rechazado (el post se borró o dejó de ser visible): se retira de la copia local.
      discard: async (comment) => {
        const db = await this.getDb();
        await db.withTransactionAsync(async (tx) => {
          if (await deleteComment(tx, comment.id)) await adjustCommentsCount(tx, comment.postId, -1);
        });
        this.notify();
      },
      tables: ['comments', 'posts'],
    });
  }

  watch(postId: string, listener: (comments: Comment[]) => void): () => void {
    return watchQuery(
      this.changes,
      ['comments'],
      async () => readComments(await this.getDb(), postId),
      listener,
    );
  }

  async refresh(postId: string): Promise<void> {
    const comments = await this.remote.fetchComments(postId);
    const db = await this.getDb();

    await db.withTransactionAsync((tx) => replaceComments(tx, postId, comments));
    this.changes.notify('comments');
  }

  async add({ postId, body, parentId }: NewComment): Promise<void> {
    const author = await this.profileOf(await this.remote.currentUserId());
    if (!author) throw new Error('No se encontró el perfil del usuario actual');

    const comment: Comment = {
      id: this.newId(),
      postId,
      author,
      parentId,
      body,
      createdAt: this.now(),
      pending: true,
    };

    // Se guarda en local junto con la operación pendiente y aparece al instante; el
    // envío lo hace la cola, ahora o cuando vuelva la conexión.
    await this.outbox.enqueue<CommentPayload>(COMMENT, comment.id, comment);
  }

  subscribe(postId: string): () => void {
    return this.remote.subscribe(postId, {
      // Un fallo al aplicar un evento no debe tumbar la suscripción: el siguiente
      // refresh() corrige cualquier diferencia.
      onInsert: (event) => void this.applyInsert(event).catch(() => {}),
      onDelete: (commentId) => void this.applyDelete(commentId).catch(() => {}),
    });
  }

  private async applyInsert(event: RemoteCommentEvent): Promise<void> {
    // El evento no trae el perfil del autor: se busca en local y, si no está, en la red.
    const author = await this.profileOf(event.authorId);
    if (!author) return;

    const db = await this.getDb();
    let inserted = false;
    await db.withTransactionAsync(async (tx) => {
      // Realtime también devuelve los comentarios propios, que ya se guardaron en add().
      // Como el id es el mismo, no se insertan ni se cuentan dos veces.
      inserted = await insertComment(tx, { ...event, author, pending: false });
      if (inserted) await adjustCommentsCount(tx, event.postId, 1);
    });
    if (inserted) this.notify();
  }

  private async applyDelete(commentId: string): Promise<void> {
    const db = await this.getDb();
    let postId: string | null = null;
    await db.withTransactionAsync(async (tx) => {
      postId = await deleteComment(tx, commentId);
      if (postId) await adjustCommentsCount(tx, postId, -1);
    });
    if (postId) this.notify();
  }

  private async profileOf(userId: string): Promise<Profile | null> {
    return (await readProfile(await this.getDb(), userId)) ?? this.profiles.fetchProfile(userId);
  }

  private notify(): void {
    this.changes.notify('comments');
    // comments_count vive en posts.
    this.changes.notify('posts');
  }
}
