import type { Comment } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';

export type NewComment = {
  postId: string;
  body: string;
  // Comentario al que responde, o null si es de primer nivel.
  parentId: string | null;
};

export interface CommentRepository {
  // Comentarios guardados en el dispositivo, del más antiguo al más nuevo.
  watch(postId: string, listener: (comments: Comment[]) => void): Unsubscribe;
  refresh(postId: string): Promise<void>;
  add(comment: NewComment): Promise<void>;
  // Mientras esté activa, los comentarios que otros publican o borran llegan solos a
  // la copia local (y de ahí a watch).
  subscribe(postId: string): Unsubscribe;
}
