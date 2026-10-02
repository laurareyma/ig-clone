import { upsertProfiles } from '@/data/local/profile-store';
import type { SqlExecutor } from '@/data/local/sql-database';
import { AUTHOR_COLUMNS, authorFromRow, type AuthorColumns } from '@/data/mappers/profile';
import type { Story } from '@/domain/entities';

type LocalStoryRow = AuthorColumns & {
  id: string;
  image_path: string;
  created_at: string;
  expires_at: string;
  seen: number;
};

// Sustituye las historias guardadas por las que devuelve el servidor. Las marcas de
// "visto" están en otra tabla y no se tocan, salvo las de historias que ya no existen.
export async function replaceStories(db: SqlExecutor, stories: Story[]): Promise<void> {
  await upsertProfiles(
    db,
    stories.map((story) => story.author),
  );
  await db.runAsync('DELETE FROM stories', []);

  for (const story of stories) {
    await db.runAsync(
      'INSERT INTO stories (id, author_id, image_path, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [story.id, story.author.id, story.imagePath, story.createdAt, story.expiresAt],
    );
  }

  await db.runAsync('DELETE FROM story_views WHERE story_id NOT IN (SELECT id FROM stories)', []);
}

export async function readStories(db: SqlExecutor): Promise<Story[]> {
  const rows = await db.getAllAsync<LocalStoryRow>(
    `SELECT s.*, ${AUTHOR_COLUMNS},
       EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id) AS seen
     FROM stories s JOIN profiles a ON a.id = s.author_id`,
    [],
  );

  return rows.map((row) => ({
    id: row.id,
    author: authorFromRow(row),
    imagePath: row.image_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    seen: row.seen === 1,
  }));
}

// Devuelve false si ya estaba marcada.
export async function markStorySeen(
  db: SqlExecutor,
  storyId: string,
  viewedAt: number,
): Promise<boolean> {
  const { changes } = await db.runAsync(
    'INSERT OR IGNORE INTO story_views (story_id, viewed_at) VALUES (?, ?)',
    [storyId, viewedAt],
  );
  return changes > 0;
}
