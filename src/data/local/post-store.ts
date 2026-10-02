import { upsertProfiles } from '@/data/local/profile-store';
import type { SqlExecutor } from '@/data/local/sql-database';
import { postFromRow, type PostRow } from '@/data/mappers/post';
import { AUTHOR_COLUMNS } from '@/data/mappers/profile';
import type { Post } from '@/domain/entities';

const SELECT_POST = `SELECT p.*, ${AUTHOR_COLUMNS} FROM posts p JOIN profiles a ON a.id = p.author_id`;

// Guarda las publicaciones y sus autores. Los contadores y liked_by_me del servidor
// reemplazan a los locales.
export async function upsertPosts(db: SqlExecutor, posts: Post[]): Promise<void> {
  await upsertProfiles(
    db,
    posts.map((post) => post.author),
  );

  for (const post of posts) {
    await db.runAsync(
      `INSERT INTO posts (id, author_id, image_path, image_width, image_height, caption,
                          likes_count, comments_count, liked_by_me, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         caption = excluded.caption,
         likes_count = excluded.likes_count,
         comments_count = excluded.comments_count,
         liked_by_me = excluded.liked_by_me`,
      [
        post.id,
        post.author.id,
        post.imagePath,
        post.imageWidth,
        post.imageHeight,
        post.caption,
        post.likesCount,
        post.commentsCount,
        post.likedByMe ? 1 : 0,
        post.createdAt,
      ],
    );
  }
}

export async function addToFeed(db: SqlExecutor, feed: string, postIds: string[]): Promise<void> {
  for (const postId of postIds) {
    await db.runAsync('INSERT OR IGNORE INTO feed_entries (feed, post_id) VALUES (?, ?)', [
      feed,
      postId,
    ]);
  }
}

export async function clearFeed(db: SqlExecutor, feed: string): Promise<void> {
  await db.runAsync('DELETE FROM feed_entries WHERE feed = ?', [feed]);
}

// Mismo orden que el servidor: (created_at, id) descendente.
export async function readFeed(db: SqlExecutor, feed: string): Promise<Post[]> {
  const rows = await db.getAllAsync<PostRow>(
    `${SELECT_POST} JOIN feed_entries f ON f.post_id = p.id
     WHERE f.feed = ? ORDER BY p.created_at DESC, p.id DESC`,
    [feed],
  );
  return rows.map(postFromRow);
}

// La publicación más antigua de la lista: el cursor de la página siguiente.
export async function readFeedCursor(
  db: SqlExecutor,
  feed: string,
): Promise<{ createdAt: string; id: string } | null> {
  const row = await db.getFirstAsync<{ created_at: string; id: string }>(
    `SELECT p.created_at, p.id FROM posts p JOIN feed_entries f ON f.post_id = p.id
     WHERE f.feed = ? ORDER BY p.created_at ASC, p.id ASC LIMIT 1`,
    [feed],
  );
  return row ? { createdAt: row.created_at, id: row.id } : null;
}

export async function readPost(db: SqlExecutor, postId: string): Promise<Post | null> {
  const row = await db.getFirstAsync<PostRow>(`${SELECT_POST} WHERE p.id = ?`, [postId]);
  return row ? postFromRow(row) : null;
}

export async function deletePost(db: SqlExecutor, postId: string): Promise<void> {
  await db.runAsync('DELETE FROM posts WHERE id = ?', [postId]);
  await db.runAsync('DELETE FROM feed_entries WHERE post_id = ?', [postId]);
  await db.runAsync('DELETE FROM comments WHERE post_id = ?', [postId]);
}

// Devuelve false si la publicación ya estaba en ese estado: así repetir la acción no
// cuenta el like dos veces.
export async function setLiked(db: SqlExecutor, postId: string, liked: boolean): Promise<boolean> {
  const { changes } = await db.runAsync(
    `UPDATE posts
     SET liked_by_me = ?, likes_count = MAX(0, likes_count + ?)
     WHERE id = ? AND liked_by_me <> ?`,
    [liked ? 1 : 0, liked ? 1 : -1, postId, liked ? 1 : 0],
  );
  return changes > 0;
}

export async function adjustCommentsCount(
  db: SqlExecutor,
  postId: string,
  delta: number,
): Promise<void> {
  await db.runAsync('UPDATE posts SET comments_count = MAX(0, comments_count + ?) WHERE id = ?', [
    delta,
    postId,
  ]);
}
