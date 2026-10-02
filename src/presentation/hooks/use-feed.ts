import { useEffect, useRef, useState } from 'react';

import type { Post } from '@/domain/entities';
import type { Feed } from '@/domain/repositories/post-repository';
import { useDependencies } from '@/presentation/dependencies';

function samePost(a: Post, b: Post): boolean {
  return (
    a.id === b.id &&
    a.likesCount === b.likesCount &&
    a.commentsCount === b.commentsCount &&
    a.likedByMe === b.likedByMe &&
    a.caption === b.caption &&
    a.author.username === b.author.username &&
    a.author.avatarUrl === b.author.avatarUrl
  );
}

// Cada lectura de SQLite crea objetos nuevos aunque los datos sean iguales. Aquí se
// conserva el objeto anterior de cada publicación que no cambió, para que al dar un like
// solo se vuelva a renderizar esa tarjeta y no toda la lista.
function reuseUnchanged(previous: Post[] | undefined, next: Post[]): Post[] {
  if (!previous) return next;
  const byId = new Map(previous.map((post) => [post.id, post]));
  return next.map((post) => {
    const old = byId.get(post.id);
    return old && samePost(old, post) ? old : post;
  });
}

export function useFeed(kind: Feed['kind'], userId?: string) {
  const { posts: repository } = useDependencies();
  // undefined = todavía no se ha leído la base local.
  const [posts, setPosts] = useState<Post[]>();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const hasMore = useRef(true);
  const busy = useRef(false);

  const feed: Feed = kind === 'author' ? { kind, userId: userId! } : { kind };

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      hasMore.current = (await repository.refreshFeed(feed)).hasMore;
      setOffline(false);
    } catch {
      // Sin conexión: la lista sigue mostrando lo guardado en el dispositivo.
      setOffline(true);
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }

  // La lista llama a esto varias veces seguidas al llegar al final; `busy` evita pedir
  // la misma página dos veces.
  async function loadMore() {
    if (busy.current || !hasMore.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      hasMore.current = (await repository.loadMoreFeed(feed)).hasMore;
    } catch {
      setOffline(true);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const target: Feed = kind === 'author' ? { kind, userId: userId! } : { kind };
    const unsubscribe = repository.watchFeed(target, (next) =>
      setPosts((previous) => reuseUnchanged(previous, next)),
    );

    hasMore.current = true;
    repository.refreshFeed(target).then(
      (page) => {
        hasMore.current = page.hasMore;
        setOffline(false);
      },
      () => setOffline(true),
    );

    return unsubscribe;
  }, [repository, kind, userId]);

  return { posts, refreshing, loadingMore, offline, refresh, loadMore };
}
