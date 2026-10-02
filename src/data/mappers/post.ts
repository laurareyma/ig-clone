import { authorFromRow, type AuthorColumns } from '@/data/mappers/profile';
import type { Comment, Post } from '@/domain/entities';

// Misma forma para la fila de get_posts (Supabase) y la de la consulta local (SQLite);
// solo cambian los booleanos, que en SQLite son 0/1.
export type PostRow = AuthorColumns & {
  id: string;
  image_path: string;
  image_width: number;
  image_height: number;
  caption: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean | number;
  created_at: string;
};

export function postFromRow(row: PostRow): Post {
  return {
    id: row.id,
    author: authorFromRow(row),
    imagePath: row.image_path,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    caption: row.caption,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    likedByMe: Boolean(row.liked_by_me),
    createdAt: row.created_at,
  };
}

export type LocalCommentRow = AuthorColumns & {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

export function commentFromLocal(row: LocalCommentRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    author: authorFromRow(row),
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
  };
}
