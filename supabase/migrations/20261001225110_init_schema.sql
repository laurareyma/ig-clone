-- Esquema inicial: perfiles, seguimiento con privacidad, publicaciones, DMs e historias.
-- Toda la privacidad se decide aquí (RLS), nunca en el cliente.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,30}$'),
  full_name text,
  avatar_url text,
  bio text,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create type public.follow_status as enum ('pending', 'accepted');

-- Una fila = "follower sigue (o pidió seguir) a following". Rechazar = borrar la fila.
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status public.follow_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, status);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  image_path text not null,
  -- El tamaño se guarda para reservar el alto de la celda antes de que cargue la imagen.
  image_width int not null check (image_width > 0),
  image_height int not null check (image_height > 0),
  caption text not null default '',
  likes_count int not null default 0,
  comments_count int not null default 0,
  created_at timestamptz not null default now()
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on public.likes (user_id);

-- El id lo genera el cliente: reintentar el mismo comentario desde la cola offline no lo duplica.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid,
  body text not null check (char_length(body) between 1 and 2200),
  created_at timestamptz not null default now(),
  unique (id, post_id),
  -- Una respuesta solo puede colgar de un comentario del mismo post.
  foreign key (parent_id, post_id) references public.comments (id, post_id) on delete cascade
);
create index comments_post_idx on public.comments (post_id, created_at);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index stories_author_idx on public.stories (author_id, expires_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- "uuidMenor:uuidMayor": garantiza una sola conversación por par de usuarios.
  dm_key text not null unique,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index conversations_last_message_idx on public.conversations (last_message_at desc);

-- "Entregado" y "Visto" son marcas de agua: un mensaje está visto si
-- created_at <= last_read_at del otro participante.
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_delivered_at timestamptz,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Funciones de apoyo para RLS
-- Son security definer para consultar follows/participants sin que sus propias
-- políticas se llamen entre sí en bucle.
-- ---------------------------------------------------------------------------

create function public.can_view_profile_content(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = target and not p.is_private)
    or exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and f.following_id = target
        and f.status = 'accepted'
    );
$$;

create function public.is_conversation_participant(conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation and cp.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 12)
    ),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El estado inicial lo decide el servidor: cuenta privada => solicitud pendiente.
create function public.set_follow_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select p.is_private from public.profiles p where p.id = new.following_id) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end;
$$;

create trigger follows_set_status
  before insert on public.follows
  for each row execute function public.set_follow_status();

-- Si una cuenta pasa de privada a pública, sus solicitudes pendientes se aceptan.
create function public.accept_pending_follows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.follows set status = 'accepted'
  where following_id = new.id and status = 'pending';
  return null;
end;
$$;

create trigger profiles_made_public
  after update of is_private on public.profiles
  for each row
  when (old.is_private and not new.is_private)
  execute function public.accept_pending_follows();

create function public.sync_post_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  delta int;
begin
  if tg_op = 'INSERT' then
    target := new.post_id;
    delta := 1;
  else
    target := old.post_id;
    delta := -1;
  end if;

  if tg_table_name = 'likes' then
    update public.posts set likes_count = likes_count + delta where id = target;
  else
    update public.posts set comments_count = comments_count + delta where id = target;
  end if;
  return null;
end;
$$;

create trigger likes_sync_counter
  after insert or delete on public.likes
  for each row execute function public.sync_post_counter();

create trigger comments_sync_counter
  after insert or delete on public.comments
  for each row execute function public.sync_post_counter();

-- Reordena la bandeja de entrada: la conversación sube con cada mensaje nuevo.
create function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at
  where id = new.conversation_id;
  return null;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- Devuelve la conversación 1 a 1 con `other`, creándola si no existe.
create function public.get_or_create_dm(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  key text;
  conversation uuid;
begin
  if me is null or other is null or me = other then
    raise exception 'invalid participants';
  end if;

  key := least(me, other)::text || ':' || greatest(me, other)::text;

  insert into public.conversations (dm_key) values (key)
  on conflict (dm_key) do nothing
  returning id into conversation;

  if conversation is null then
    select c.id into conversation from public.conversations c where c.dm_key = key;
  else
    insert into public.conversation_participants (conversation_id, user_id)
    values (conversation, me), (conversation, other);
  end if;

  return conversation;
end;
$$;

-- Los contadores del perfil se ven aunque la cuenta sea privada (las listas no).
create function public.get_profile_stats(target uuid)
returns table (posts bigint, followers bigint, following bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.posts p where p.author_id = target),
    (select count(*) from public.follows f where f.following_id = target and f.status = 'accepted'),
    (select count(*) from public.follows f where f.follower_id = target and f.status = 'accepted');
$$;

-- ---------------------------------------------------------------------------
-- Permisos por columna
-- El cliente solo puede escribir las columnas listadas: no puede fijar
-- created_at, los contadores ni el estado inicial de un follow.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;

grant update (username, full_name, avatar_url, bio, is_private) on public.profiles to authenticated;

grant insert (follower_id, following_id) on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
grant delete on public.follows to authenticated;

grant insert (id, author_id, image_path, image_width, image_height, caption) on public.posts to authenticated;
grant update (caption) on public.posts to authenticated;
grant delete on public.posts to authenticated;

grant insert (post_id, user_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;

grant insert (id, post_id, author_id, parent_id, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;

grant insert (id, author_id, image_path) on public.stories to authenticated;
grant delete on public.stories to authenticated;

grant update (last_delivered_at, last_read_at) on public.conversation_participants to authenticated;

grant insert (id, conversation_id, sender_id, body) on public.messages to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.stories enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- profiles: el perfil básico (usuario, avatar, si es privado) siempre es visible.
create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- follows: las dos partes siempre ven su fila; un tercero solo ve follows
-- aceptados entre cuentas cuyo contenido puede ver.
create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
    or (
      status = 'accepted'
      and public.can_view_profile_content(follower_id)
      and public.can_view_profile_content(following_id)
    )
  );

create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

-- Solo el dueño de la cuenta puede aprobar, y solo de pendiente a aceptado.
create policy follows_accept on public.follows
  for update to authenticated
  using (following_id = (select auth.uid()) and status = 'pending')
  with check (following_id = (select auth.uid()) and status = 'accepted');

-- Dejar de seguir, cancelar la solicitud, rechazarla o eliminar a un seguidor.
create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));

-- posts
create policy posts_select on public.posts
  for select to authenticated
  using (public.can_view_profile_content(author_id));

create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy posts_update_own on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- likes y comments heredan la visibilidad del post: el subselect pasa por la RLS de posts.
create policy likes_select on public.likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on public.comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- Borra el autor del comentario o el dueño del post.
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = (select auth.uid())
    )
  );

-- stories: pasadas 24 h solo las ve su autor.
create policy stories_select on public.stories
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (expires_at > now() and public.can_view_profile_content(author_id))
  );

create policy stories_insert_own on public.stories
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy stories_delete_own on public.stories
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- DMs: las conversaciones se crean solo con get_or_create_dm().
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id));

create policy participants_select on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy participants_update_own on public.conversation_participants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_participant(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- Storage
-- avatars es público; media (posts e historias) es privado y sigue la misma
-- regla de privacidad. Ruta de cada archivo: {user_id}/{archivo}.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('media', 'media', false)
on conflict (id) do nothing;

create policy objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    or (
      bucket_id = 'media'
      and public.can_view_profile_content(((storage.foldername(name))[1])::uuid)
    )
  );

create policy own_folder_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy own_folder_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy own_folder_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'media')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- "Escribiendo..." no va aquí: es un evento efímero que se envía por Broadcast.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.messages,
  public.conversations,
  public.conversation_participants,
  public.comments,
  public.follows;
