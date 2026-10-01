// Aplica las migraciones a un Postgres embebido (PGlite) con un stub mínimo de Supabase
// y comprueba las reglas de privacidad. Uso: npm run test:rls
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
create publication supabase_realtime;
`);
const dir = new URL('../migrations/', import.meta.url);
for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(file, dir), 'utf8'));
console.log('migración aplicada');

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users values ('${A}', '{"username":"ana"}'), ('${B}', '{"username":"beto"}'), ('${C}', '{}')`);

let fails = 0;
const run = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { const r = await db.query(sql); return { rows: r.rows, affected: r.affectedRows }; } catch (e) { return { error: e.message }; } finally { await db.exec('reset role'); }
};
const check = (name, cond, extra) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`, cond ? '' : JSON.stringify(extra)); };
let r;

r = await run(A, `select username from profiles order by username`);
check('perfiles creados por trigger', r.rows?.length === 3 && r.rows[0].username === 'ana', r);
r = await run(B, `update profiles set is_private = true where id = '${B}'`);
check('B se vuelve privada', r.affected === 1, r);
r = await run(A, `update profiles set bio = 'hack' where id = '${B}'`);
check('A no puede editar el perfil de B', r.affected === 0, r);

const P = '10000000-0000-0000-0000-000000000001';
r = await run(B, `insert into posts (id, author_id, image_path, image_width, image_height) values ('${P}', '${B}', '${B}/p.jpg', 1080, 1350)`);
check('B publica', !r.error, r);
r = await run(A, `insert into posts (author_id, image_path, image_width, image_height) values ('${B}', 'x', 1, 1)`);
check('A no puede publicar a nombre de B', !!r.error, r);
r = await run(A, `select * from posts`);
check('A no ve posts de cuenta privada', r.rows?.length === 0, r);

r = await run(C, `insert into follows (follower_id, following_id) values ('${C}', '${A}') returning status`);
check('seguir cuenta pública => accepted', r.rows?.[0]?.status === 'accepted', r);
r = await run(A, `insert into follows (follower_id, following_id) values ('${A}', '${B}') returning status`);
check('seguir cuenta privada => pending', r.rows?.[0]?.status === 'pending', r);
r = await run(A, `insert into follows (follower_id, following_id, status) values ('${A}', '${B}', 'accepted')`);
check('cliente no puede fijar status al insertar', /permission denied/.test(r.error ?? ''), r);
r = await run(A, `update follows set status = 'accepted' where follower_id = '${A}'`);
check('A no puede auto-aprobarse', r.affected === 0, r);
r = await run(A, `select * from posts`);
check('pendiente: A sigue sin ver posts', r.rows?.length === 0, r);
r = await run(C, `select * from follows where following_id = '${B}'`);
check('C no ve la solicitud pendiente', r.rows?.length === 0, r);
r = await run(B, `update follows set status = 'accepted' where follower_id = '${A}' and following_id = '${B}'`);
check('B aprueba', r.affected === 1, r);
r = await run(A, `select * from posts`);
check('aprobado: A ve el post', r.rows?.length === 1, r);
r = await run(C, `select * from posts`);
check('C (no seguidor) no ve el post', r.rows?.length === 0, r);
r = await run(C, `select * from follows where following_id = '${B}'`);
check('C no ve la lista de seguidores de B', r.rows?.length === 0, r);
r = await run(A, `select * from follows where following_id = '${B}'`);
check('A (seguidor) sí ve la lista de B', r.rows?.length === 1, r);
r = await run(C, `select * from get_profile_stats('${B}')`);
check('contadores visibles para C', Number(r.rows?.[0]?.posts) === 1 && Number(r.rows?.[0]?.followers) === 1, r);

r = await run(A, `insert into likes (post_id, user_id) values ('${P}', '${A}') on conflict do nothing`);
r = await run(A, `insert into likes (post_id, user_id) values ('${P}', '${A}') on conflict do nothing`);
check('like repetido no falla', !r.error, r);
r = await run(C, `insert into likes (post_id, user_id) values ('${P}', '${C}')`);
check('C no puede dar like a post que no ve', !!r.error, r);
r = await run(A, `insert into likes (post_id, user_id) values ('${P}', '${B}')`);
check('A no puede dar like a nombre de B', !!r.error, r);
const K = '20000000-0000-0000-0000-000000000001', K2 = '20000000-0000-0000-0000-000000000002';
await run(A, `insert into comments (id, post_id, author_id, body) values ('${K}', '${P}', '${A}', 'hola') on conflict (id) do nothing`);
r = await run(A, `insert into comments (id, post_id, author_id, body) values ('${K}', '${P}', '${A}', 'hola') on conflict (id) do nothing`);
check('comentario reintentado no duplica', !r.error && r.affected === 0, r);
r = await run(B, `insert into comments (id, post_id, author_id, parent_id, body) values ('${K2}', '${P}', '${B}', '${K}', 'respuesta')`);
check('respuesta anidada', !r.error, r);
r = await run(B, `select likes_count, comments_count from posts`);
check('contadores 1 like / 2 comentarios', r.rows?.[0]?.likes_count === 1 && r.rows?.[0]?.comments_count === 2, r);
r = await run(A, `update posts set likes_count = 999`);
check('cliente no puede tocar contadores', /permission denied/.test(r.error ?? ''), r);
r = await run(A, `insert into comments (post_id, author_id, body, created_at) values ('${P}', '${A}', 'x', '2000-01-01')`);
check('cliente no puede fijar created_at', /permission denied/.test(r.error ?? ''), r);
r = await run(A, `delete from likes where post_id = '${P}' and user_id = '${A}'`);
await run(A, `delete from comments where id = '${K}'`);
r = await run(B, `select likes_count, comments_count from posts`);
check('contadores vuelven a 0 (cascada de respuestas)', r.rows?.[0]?.likes_count === 0 && r.rows?.[0]?.comments_count === 0, r);

r = await run(A, `select get_or_create_dm('${B}') as id`); const conv = r.rows?.[0]?.id;
r = await run(B, `select get_or_create_dm('${A}') as id`);
check('una sola conversación por par', conv && r.rows?.[0]?.id === conv, r);
r = await run(A, `insert into messages (conversation_id, sender_id, body) values ('${conv}', '${A}', 'hey') returning created_at`);
check('A envía mensaje', !r.error, r);
r = await run(C, `select * from messages`);
check('C no lee mensajes ajenos', r.rows?.length === 0, r);
r = await run(C, `insert into messages (conversation_id, sender_id, body) values ('${conv}', '${C}', 'spam')`);
check('C no escribe en conversación ajena', !!r.error, r);
r = await run(B, `insert into messages (conversation_id, sender_id, body) values ('${conv}', '${A}', 'falso')`);
check('B no puede suplantar a A', !!r.error, r);
r = await run(B, `select (select last_message_at from conversations) = (select max(created_at) from messages) as ok`);
check('last_message_at sigue al último mensaje', r.rows?.[0]?.ok === true, r);
r = await run(B, `update conversation_participants set last_read_at = now() where conversation_id = '${conv}' and user_id = '${B}'`);
check('B marca visto', r.affected === 1, r);
r = await run(A, `update conversation_participants set last_read_at = now() where user_id = '${B}'`);
check('A no puede marcar visto por B', r.affected === 0, r);
r = await run(A, `select last_read_at from conversation_participants where user_id = '${B}'`);
check('A ve el visto de B', r.rows?.[0]?.last_read_at != null, r);

await run(B, `insert into stories (author_id, image_path) values ('${B}', '${B}/s.jpg')`);
r = await run(A, `select * from stories`); check('A ve historia de B', r.rows?.length === 1, r);
r = await run(C, `select * from stories`); check('C no ve historia de B', r.rows?.length === 0, r);
await db.exec(`update stories set expires_at = now() - interval '1 minute'`);
r = await run(A, `select * from stories`); check('historia expirada oculta para A', r.rows?.length === 0, r);
r = await run(B, `select * from stories`); check('autor aún ve su historia expirada', r.rows?.length === 1, r);

r = await run(B, `insert into storage.objects (bucket_id, name) values ('media', '${B}/p.jpg')`);
check('B sube a su carpeta', !r.error, r);
r = await run(C, `insert into storage.objects (bucket_id, name) values ('media', '${B}/x.jpg')`);
check('C no sube a carpeta de B', !!r.error, r);
r = await run(A, `select * from storage.objects`); check('A descarga imagen de B', r.rows?.length === 1, r);
r = await run(C, `select * from storage.objects`); check('C no descarga imagen de B', r.rows?.length === 0, r);

await run(C, `insert into follows (follower_id, following_id) values ('${C}', '${B}')`);
await run(B, `update profiles set is_private = false where id = '${B}'`);
r = await run(C, `select status from follows where following_id = '${B}' and follower_id = '${C}'`);
check('al hacerse pública, pendientes => accepted', r.rows?.[0]?.status === 'accepted', r);
r = await run(C, `delete from follows where follower_id = '${C}' and following_id = '${B}'`);
check('dejar de seguir', r.affected === 1, r);

await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
try { await db.query('select * from profiles'); check('anon sin acceso', false); } catch (e) { check('anon sin acceso', /permission denied/.test(e.message), e.message); }
await db.exec('reset role');

console.log(fails ? `\n${fails} fallos` : '\ntodo ok');
process.exit(fails ? 1 : 0);
