import type { Comment } from '@/domain/entities';

export type CommentThread = {
  comment: Comment;
  replies: Comment[];
};

// Agrupa los comentarios en hilos de un nivel, como Instagram: cada comentario de primer
// nivel con todas sus respuestas debajo. Una respuesta a otra respuesta se cuelga del
// mismo hilo en vez de anidarse más, para que la sangría no crezca sin límite.
export function buildCommentThreads(comments: Comment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const threads = new Map<string, CommentThread>();
  const byDate = [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );

  // Sube por parentId hasta el comentario de primer nivel. Si un padre no está (se
  // borró o aún no ha llegado), el comentario se trata como raíz en vez de perderse.
  const rootOf = (comment: Comment): Comment => {
    let current = comment;
    const seen = new Set<string>();
    while (current.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId)!;
    }
    return current;
  };

  for (const comment of byDate) {
    const root = rootOf(comment);
    let thread = threads.get(root.id);
    if (!thread) {
      thread = { comment: root, replies: [] };
      threads.set(root.id, thread);
    }
    if (comment.id !== root.id) thread.replies.push(comment);
  }

  return [...threads.values()].sort(
    (a, b) =>
      a.comment.createdAt.localeCompare(b.comment.createdAt) ||
      a.comment.id.localeCompare(b.comment.id),
  );
}
