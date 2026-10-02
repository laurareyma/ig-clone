-- Historias activas de las cuentas que sigue el usuario y las suyas, con el autor en la
-- misma fila. Es security invoker: la RLS de stories sigue decidiendo qué se puede ver
-- (cuenta privada => solo seguidores aceptados).
--
-- El filtro expires_at > now() va explícito porque la RLS deja al autor ver sus propias
-- historias caducadas, y aquí no deben salir.
create function public.get_stories()
returns table (
  id uuid,
  image_path text,
  created_at timestamptz,
  expires_at timestamptz,
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
    s.id,
    s.image_path,
    s.created_at,
    s.expires_at,
    a.id,
    a.username,
    a.full_name,
    a.avatar_url,
    a.bio,
    a.is_private
  from public.stories s
  join public.profiles a on a.id = s.author_id
  where s.expires_at > now()
    and (
      s.author_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = s.author_id
          and f.status = 'accepted'
      )
    )
  order by s.created_at;
$$;

revoke execute on function public.get_stories() from public, anon;
grant execute on function public.get_stories() to authenticated;
