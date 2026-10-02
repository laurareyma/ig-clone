-- Mensajes directos: bandeja de entrada, acuses de entrega y lectura, y autorización
-- del canal de "Escribiendo...".

-- ---------------------------------------------------------------------------
-- Bandeja de entrada en una sola consulta
-- Por cada conversación del usuario: el otro participante, el último mensaje, cuántos
-- hay sin leer y hasta dónde ha recibido y leído el otro. Es security invoker: solo
-- devuelve lo que la RLS deja ver. Con `only_conversation` trae una conversación concreta.
-- ---------------------------------------------------------------------------
create function public.get_inbox(only_conversation uuid default null)
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  unread_count int,
  other_last_delivered_at timestamptz,
  other_last_read_at timestamptz,
  last_message_id uuid,
  last_message_sender_id uuid,
  last_message_body text,
  last_message_created_at timestamptz,
  other_id uuid,
  other_username text,
  other_full_name text,
  other_avatar_url text,
  other_bio text,
  other_is_private boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.last_message_at,
    (
      select count(*)::int from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> me.user_id
        and (me.last_read_at is null or m.created_at > me.last_read_at)
    ),
    other.last_delivered_at,
    other.last_read_at,
    last_message.id,
    last_message.sender_id,
    last_message.body,
    last_message.created_at,
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.bio,
    p.is_private
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  join public.profiles p on p.id = other.user_id
  left join lateral (
    select m.id, m.sender_id, m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) last_message on true
  where me.user_id = (select auth.uid())
    and (only_conversation is null or c.id = only_conversation)
  order by c.last_message_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Acuses de entrega y lectura
-- Son marcas de agua por participante: un mensaje está entregado (o leído) si su
-- created_at es anterior a la marca del destinatario. La hora la pone el servidor con
-- now(): el cliente ya no puede escribir estas columnas, así que no puede fijar una
-- fecha arbitraria ni depender del reloj del teléfono.
-- ---------------------------------------------------------------------------
revoke update on public.conversation_participants from authenticated;
drop policy participants_update_own on public.conversation_participants;

-- El dispositivo del usuario recibió todo lo que había hasta ahora.
create function public.mark_delivered()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants cp
  set last_delivered_at = now()
  where cp.user_id = (select auth.uid())
    -- Solo donde hay algo nuevo, para no emitir cambios por Realtime sin motivo.
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cp.conversation_id
        and m.sender_id <> cp.user_id
        and (cp.last_delivered_at is null or m.created_at > cp.last_delivered_at)
    );
$$;

-- El usuario abrió la conversación: leído implica entregado.
create function public.mark_read(conversation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_participants cp
  set last_read_at = now(), last_delivered_at = now()
  where cp.user_id = (select auth.uid())
    and cp.conversation_id = conversation;
$$;

revoke execute on function public.get_inbox(uuid) from public, anon;
revoke execute on function public.mark_delivered() from public, anon;
revoke execute on function public.mark_read(uuid) from public, anon;
grant execute on function public.get_inbox(uuid) to authenticated;
grant execute on function public.mark_delivered() to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Canal de "Escribiendo..."
-- Se envía por Realtime Broadcast: es un evento efímero que no se guarda en ninguna
-- tabla, así que la RLS de messages no lo protege. El canal se llama
-- conversation:{uuid} y se abre como privado; estas políticas sobre realtime.messages
-- hacen que solo los participantes puedan escuchar (select) y emitir (insert) en él.
-- ---------------------------------------------------------------------------
create function public.can_use_conversation_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Se valida el formato antes de convertir a uuid: un topic cualquiera no debe
    -- provocar un error de conversión.
    when topic ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_conversation_participant(split_part(topic, ':', 2)::uuid)
    else false
  end;
$$;

revoke execute on function public.can_use_conversation_topic(text) from public, anon;
grant execute on function public.can_use_conversation_topic(text) to authenticated;

create policy conversation_broadcast_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_use_conversation_topic((select realtime.topic()))
  );

create policy conversation_broadcast_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.can_use_conversation_topic((select realtime.topic()))
  );
