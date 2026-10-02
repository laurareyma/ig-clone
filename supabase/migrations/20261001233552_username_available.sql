-- El formulario de registro comprueba si el nombre de usuario está libre antes de crear
-- la cuenta. En ese momento no hay sesión y anon no puede leer profiles, así que la
-- consulta se expone como función: responde sí o no, sin revelar nada más del perfil.
create function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p where p.username = lower(candidate)
  );
$$;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
