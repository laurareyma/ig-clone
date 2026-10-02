import { buildCommentThreads } from '@/domain/comment-threads';
import type { Comment, Profile } from '@/domain/entities';

const author: Profile = {
  id: 'u',
  username: 'ana',
  fullName: null,
  avatarUrl: null,
  bio: null,
  isPrivate: false,
};

const comment = (id: string, minute: number, parentId: string | null = null): Comment => ({
  id,
  postId: 'p',
  author,
  parentId,
  body: id,
  createdAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:00+00:00`,
  pending: false,
});

const shape = (comments: Comment[]) =>
  buildCommentThreads(comments).map((thread) => [
    thread.comment.id,
    thread.replies.map((reply) => reply.id),
  ]);

describe('buildCommentThreads', () => {
  it('ordena los hilos y las respuestas por fecha, sin importar el orden de entrada', () => {
    const comments = [comment('r2', 5, 'a'), comment('b', 2), comment('r1', 3, 'a'), comment('a', 1)];

    expect(shape(comments)).toEqual([
      ['a', ['r1', 'r2']],
      ['b', []],
    ]);
  });

  it('una respuesta a una respuesta queda en el mismo hilo, sin más niveles', () => {
    const comments = [comment('a', 1), comment('r1', 2, 'a'), comment('r2', 3, 'r1')];

    expect(shape(comments)).toEqual([['a', ['r1', 'r2']]]);
  });

  it('si falta el padre, la respuesta se muestra como hilo propio', () => {
    expect(shape([comment('r1', 2, 'borrado')])).toEqual([['r1', []]]);
  });

  it('con la misma fecha, el id desempata de forma estable', () => {
    expect(shape([comment('b', 1), comment('a', 1)])).toEqual([
      ['a', []],
      ['b', []],
    ]);
  });

  it('sin comentarios no hay hilos', () => {
    expect(buildCommentThreads([])).toEqual([]);
  });
});
