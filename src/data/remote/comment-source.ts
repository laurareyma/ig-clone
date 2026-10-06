import { PROFILE_COLUMNS, profileFromRow, type ProfileRow } from '@/data/mappers/profile';
import { currentUserId, type Client } from '@/data/remote/current-user';
import type { Comment } from '@/domain/entities';

// Comentario tal como llega por Realtime: la fila de la tabla, sin el perfil del autor.
export type RemoteCommentEvent = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
};

export type CommentEventHandlers = {
  onInsert(comment: RemoteCommentEvent): void;
  onDelete(commentId: string): void;
  // El canal quedó activo: al abrirlo por primera vez y tras cada reconexión.
  onSubscribed(): void;
};

export interface CommentRemoteSource {
  currentUserId(): Promise<string>;
  fetchComments(postId: string): Promise<Comment[]>;
  insertComment(comment: Comment): Promise<void>;
  subscribe(postId: string, handlers: CommentEventHandlers): () => void;
}

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

export class SupabaseCommentSource implements CommentRemoteSource {
  constructor(private readonly client: Client) {}

  currentUserId(): Promise<string> {
    return currentUserId(this.client);
  }

  async fetchComments(postId: string): Promise<Comment[]> {
    const { data, error } = await this.client
      .from('comments')
      .select(
        `id, post_id, author_id, parent_id, body, created_at,
         author:profiles!comments_author_id_fkey(${PROFILE_COLUMNS})`,
      )
      .eq('post_id', postId)
      .order('created_at');

    if (error) throw error;
    return (data as unknown as (CommentRow & { author: ProfileRow })[]).map((row) => ({
      id: row.id,
      postId: row.post_id,
      author: profileFromRow(row.author),
      parentId: row.parent_id,
      body: row.body,
      createdAt: row.created_at,
      pending: false,
    }));
  }

  async insertComment(comment: Comment): Promise<void> {
    // El id lo genera el cliente: si la petición se reintenta (por ejemplo tras perder
    // la respuesta), el segundo intento choca con la clave primaria y se ignora en vez
    // de crear un comentario duplicado.
    const { error } = await this.client.from('comments').upsert(
      {
        id: comment.id,
        post_id: comment.postId,
        author_id: await this.currentUserId(),
        parent_id: comment.parentId,
        body: comment.body,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  subscribe(postId: string, handlers: CommentEventHandlers): () => void {
    // Un canal de Realtime va sobre el WebSocket que comparte todo el cliente. El
    // servidor solo envía las filas que la RLS deja ver a este usuario.
    const channel = this.client
      .channel(`comments:${postId}`)
      .on<CommentRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        ({ new: row }) =>
          handlers.onInsert({
            id: row.id,
            postId: row.post_id,
            authorId: row.author_id,
            parentId: row.parent_id,
            body: row.body,
            createdAt: row.created_at,
          }),
      )
      // Un DELETE solo trae la clave primaria, así que no se puede filtrar por post:
      // llegan los de toda la tabla y el repositorio ignora los que no tiene guardados.
      .on<CommentRow>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        ({ old }) => {
          if (old.id) handlers.onDelete(old.id);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handlers.onSubscribed();
      });

    return () => void this.client.removeChannel(channel);
  }
}
