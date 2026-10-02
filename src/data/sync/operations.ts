import type { Comment } from '@/domain/entities';

// Tipos de operación que pasan por la cola y lo que guarda cada una.
export const LIKE = 'like';
export const COMMENT = 'comment';

export type LikePayload = { postId: string; liked: boolean };
export type CommentPayload = Comment;
