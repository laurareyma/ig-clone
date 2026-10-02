-- Consulta única para todas las listas de publicaciones: feed de Inicio, Explorar,
-- cuadrícula de un perfil y una publicación suelta.
--
-- Devuelve el autor y liked_by_me en la misma fila, así el cliente no hace una consulta
-- extra por publicación. Es security invoker: la visibilidad la sigue decidiendo la RLS
-- de posts, esta función no puede saltársela.
--
-- Paginación por cursor (keyset): se pasa (created_at, id) de la última publicación
-- recibida. A diferencia de OFFSET, no repite ni salta filas si entran publicaciones
-- nuevas mientras se pagina, y no recorre las páginas anteriores.
create function public.get_posts(
  page_size int default 20,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  only_following boolean default false,
  by_author uuid default null,
  by_id uuid default null
)
returns table (
  id uuid,
  image_path text,
  image_width int,
  image_height int,
  caption text,
  likes_count int,
  comments_count int,
  created_at timestamptz,
  liked_by_me boolean,
  author_id uuid,
  author_username text,
  author_full_name text,
  author_avatar_url text,
  author_bio text,
  author_is_private boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.image_path,
    p.image_width,
    p.image_height,
    p.caption,
    p.likes_count,
    p.comments_count,
    p.created_at,
    exists (
      select 1 from public.likes l
      where l.post_id = p.id and l.user_id = (select auth.uid())
    ),
    a.id,
    a.username,
    a.full_name,
    a.avatar_url,
    a.bio,
    a.is_private
  from public.posts p
  join public.profiles a on a.id = p.author_id
  where (by_id is null or p.id = by_id)
    and (by_author is null or p.author_id = by_author)
    and (
      not only_following
      or p.author_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = p.author_id
          and f.status = 'accepted'
      )
    )
    and (
      cursor_created_at is null
      or (p.created_at, p.id) < (cursor_created_at, cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(page_size, 1), 50);
$$;

revoke execute on function public.get_posts(int, timestamptz, uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.get_posts(int, timestamptz, uuid, boolean, uuid, uuid) to authenticated;

-- El orden del cursor es (created_at, id); este índice lo cubre también por autor.
drop index public.posts_created_idx;
create index posts_feed_idx on public.posts (created_at desc, id desc);
drop index public.posts_author_idx;
create index posts_author_feed_idx on public.posts (author_id, created_at desc, id desc);

-- Búsqueda de usuarios por prefijo (username like 'ana%'). El índice único normal no
-- sirve para LIKE salvo que la base use la collation C; text_pattern_ops sí.
create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);
