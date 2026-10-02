import { useEffect, useState } from 'react';

import type { Comment, Post } from '@/domain/entities';
import { useDependencies } from '@/presentation/dependencies';

// undefined = todavía no se ha leído la base local; null = no existe o no se puede ver.
export function usePost(postId: string): Post | null | undefined {
  const { posts } = useDependencies();
  const [state, setState] = useState<{ postId: string; post: Post | null; confirmed: boolean }>();

  useEffect(() => {
    let confirmed = false;
    const unsubscribe = posts.watchPost(postId, (post) => setState({ postId, post, confirmed }));

    // Hasta que el servidor responde, que no esté en local no significa que no exista
    // (por ejemplo, al llegar desde un deep link).
    posts
      .refreshPost(postId)
      .catch(() => {})
      .finally(() => {
        confirmed = true;
        setState((current) => (current?.postId === postId ? { ...current, confirmed } : current));
      });

    return unsubscribe;
  }, [posts, postId]);

  if (state?.postId !== postId) return undefined;
  return state.post ?? (state.confirmed ? null : undefined);
}

export function useComments(postId: string): Comment[] {
  const { comments } = useDependencies();
  const [state, setState] = useState<{ postId: string; comments: Comment[] }>();

  useEffect(() => {
    const unwatch = comments.watch(postId, (next) => setState({ postId, comments: next }));
    comments.refresh(postId).catch(() => {});
    // El canal de tiempo real solo vive mientras la pantalla está abierta.
    const unsubscribe = comments.subscribe(postId);

    return () => {
      unwatch();
      unsubscribe();
    };
  }, [comments, postId]);

  return state?.postId === postId ? state.comments : [];
}
