import type { Comment, Post, Profile } from '@/domain/entities';

export function profileFixture(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    username: `user_${id}`,
    fullName: null,
    avatarUrl: null,
    bio: null,
    isPrivate: false,
    ...overrides,
  };
}

// minute fija el orden: a mayor minuto, más reciente.
export function postFixture(id: string, minute: number, overrides: Partial<Post> = {}): Post {
  return {
    id,
    author: profileFixture('ana'),
    imagePath: `ana/${id}.jpg`,
    imageWidth: 1080,
    imageHeight: 1350,
    caption: `post ${id}`,
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
    createdAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:00+00:00`,
    ...overrides,
  };
}

export function commentFixture(
  id: string,
  minute: number,
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    postId: 'p1',
    author: profileFixture('beto'),
    parentId: null,
    body: `comentario ${id}`,
    createdAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:00+00:00`,
    ...overrides,
  };
}
