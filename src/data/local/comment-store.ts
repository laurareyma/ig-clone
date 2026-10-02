import { upsertProfiles } from '@/data/local/profile-store';
import type { SqlExecutor } from '@/data/local/sql-database';
import { commentFromLocal, type LocalCommentRow } from '@/data/mappers/post';
import { AUTHOR_COLUMNS } from '@/data/mappers/profile';
import type { Comment } from '@/domain/entities';

// Devuelve false si el comentario ya estaba guardado.
export async function insertComment(db: SqlExecutor, comment: Comment): Promise<boolean> {
  await upsertProfiles(db, [comment.author]);
  const { changes } = await db.runAsync(
    `INSERT OR IGNORE INTO comments (id, post_id, author_id, parent_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      comment.id,
      comment.postId,
      comment.author.id,
      comment.parentId,
      comment.body,
      comment.createdAt,
    ],
  );
  return changes > 0;
}

export async function replaceComments(
  db: SqlExecutor,
  postId: string,
  comments: Comment[],
): Promise<void> {
  await db.runAsync('DELETE FROM comments WHERE post_id = ?', [postId]);
  for (const comment of comments) await insertComment(db, comment);
}

// Devuelve el post al que pertenecía, o null si no estaba guardado.
export async function deleteComment(db: SqlExecutor, commentId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ post_id: string }>(
    'SELECT post_id FROM comments WHERE id = ?',
    [commentId],
  );
  if (!row) return null;

  await db.runAsync('DELETE FROM comments WHERE id = ?', [commentId]);
  return row.post_id;
}

export async function readComments(db: SqlExecutor, postId: string): Promise<Comment[]> {
  const rows = await db.getAllAsync<LocalCommentRow>(
    `SELECT c.*, ${AUTHOR_COLUMNS} FROM comments c JOIN profiles a ON a.id = c.author_id
     WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`,
    [postId],
  );
  return rows.map(commentFromLocal);
}
