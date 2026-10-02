import type { CommentRepository, NewComment } from '@/domain/repositories/comment-repository';
import type { NewPost, PostRepository } from '@/domain/repositories/post-repository';

// Mismo límite que el check de comments.body en la base; se aplica igual al pie de foto.
export const MAX_TEXT_LENGTH = 2200;

export type PostErrorCode = 'empty_comment' | 'text_too_long' | 'invalid_image';

export class PostError extends Error {
  constructor(readonly code: PostErrorCode) {
    super(code);
    this.name = 'PostError';
  }
}

export async function createPost(posts: PostRepository, input: NewPost): Promise<void> {
  const caption = input.caption.trim();
  if (caption.length > MAX_TEXT_LENGTH) throw new PostError('text_too_long');
  if (!input.imageUri || !(input.imageWidth > 0) || !(input.imageHeight > 0)) {
    throw new PostError('invalid_image');
  }

  await posts.create({ ...input, caption });
}

export async function addComment(comments: CommentRepository, input: NewComment): Promise<void> {
  const body = input.body.trim();
  if (body.length === 0) throw new PostError('empty_comment');
  if (body.length > MAX_TEXT_LENGTH) throw new PostError('text_too_long');

  await comments.add({ ...input, body });
}
