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
create schema realtime;
create table realtime.messages (id uuid default gen_random_uuid(), topic text, extension text, payload jsonb);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to authenticated; grant select, insert on realtime.messages to authenticated;
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
r = await run(A, `select id, liked_by_me, author_username from get_posts(only_following => true)`);
check('feed de A: post de B con autor y liked_by_me', r.rows?.length === 1 && r.rows[0].liked_by_me === true && r.rows[0].author_username === 'beto', r);
r = await run(B, `select liked_by_me from get_posts(by_author => '${B}')`);
check('liked_by_me es por usuario', r.rows?.length === 1 && r.rows[0].liked_by_me === false, r);
r = await run(C, `select * from get_posts()`);
check('get_posts respeta la RLS: C no ve el post privado', r.rows?.length === 0, r);
r = await run(C, `select * from get_posts(by_id => '${P}')`);
check('get_posts por id tampoco lo revela', r.rows?.length === 0, r);
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
check('el cliente no puede escribir los acuses directamente', /permission denied/.test(r.error ?? ''), r);
r = await run(B, `select conversation_id, unread_count, last_message_body, last_message_sender_id, other_username, other_last_read_at from get_inbox()`);
check('bandeja de B: último mensaje, 1 sin leer, el otro es ana', r.rows?.length === 1 && r.rows[0].unread_count === 1 && r.rows[0].last_message_body === 'hey' && r.rows[0].last_message_sender_id === A && r.rows[0].other_username === 'ana', r);
r = await run(A, `select unread_count, other_last_delivered_at, other_last_read_at from get_inbox()`);
check('bandeja de A: nada sin leer; B aún no recibió ni leyó', r.rows?.[0]?.unread_count === 0 && r.rows[0].other_last_delivered_at === null && r.rows[0].other_last_read_at === null, r);
r = await run(C, `select * from get_inbox()`);
check('bandeja de C vacía', r.rows?.length === 0, r);
r = await run(C, `select * from get_inbox('${conv}')`);
check('C no ve una conversación ajena ni pidiéndola por id', r.rows?.length === 0, r);
await run(B, `select mark_delivered()`);
r = await run(A, `select other_last_delivered_at is not null as delivered, other_last_read_at is null as unread from get_inbox()`);
check('B recibe: A ve entregado pero no leído', r.rows?.[0]?.delivered === true && r.rows[0].unread === true, r);
r = await run(B, `select last_delivered_at from conversation_participants where user_id = '${B}'`); const firstDelivery = r.rows?.[0]?.last_delivered_at;
await run(B, `select mark_delivered()`);
r = await run(B, `select last_delivered_at from conversation_participants where user_id = '${B}'`);
check('mark_delivered sin mensajes nuevos no cambia nada', String(r.rows?.[0]?.last_delivered_at) === String(firstDelivery), r);
await run(C, `select mark_read('${conv}')`);
r = await run(A, `select other_last_read_at from get_inbox()`);
check('C no puede marcar leído en una conversación ajena', r.rows?.[0]?.other_last_read_at === null, r);
await run(B, `select mark_read('${conv}')`);
r = await run(A, `select other_last_read_at is not null as read from get_inbox()`);
check('B lee: A ve el visto', r.rows?.[0]?.read === true, r);
r = await run(B, `select unread_count from get_inbox()`);
check('tras leer, B no tiene pendientes', r.rows?.[0]?.unread_count === 0, r);
r = await run(A, `insert into messages (conversation_id, sender_id, body) values ('${conv}', '${A}', 'otro')`);
r = await run(B, `select unread_count, last_message_body from get_inbox()`);
check('un mensaje nuevo vuelve a contar como no leído y pasa a ser el último', r.rows?.[0]?.unread_count === 1 && r.rows[0].last_message_body === 'otro', r);
const dm2 = (await run(C, `select get_or_create_dm('${B}') as id`)).rows[0].id;
await run(C, `insert into messages (conversation_id, sender_id, body) values ('${dm2}', '${C}', 'hola beto')`);
r = await run(B, `select other_username from get_inbox()`);
check('la bandeja se ordena por el último mensaje', r.rows?.map((row) => row.other_username).join(',') === `${(await run(C, `select username from profiles where id = '${C}'`)).rows[0].username},ana`, r);

const topic = async (uid, name, sql) => { await db.exec(`select set_config('realtime.topic', '${name}', false)`); return run(uid, sql); };
r = await topic(A, `conversation:${conv}`, `insert into realtime.messages (topic, extension) values ('conversation:${conv}', 'broadcast')`);
check('A emite "escribiendo" en su conversación', !r.error, r);
r = await topic(B, `conversation:${conv}`, `select * from realtime.messages`);
check('B lo recibe', r.rows?.length === 1, r);
r = await topic(C, `conversation:${conv}`, `select * from realtime.messages`);
check('C no puede escuchar el canal de una conversación ajena', r.rows?.length === 0, r);
r = await topic(C, `conversation:${conv}`, `insert into realtime.messages (topic, extension) values ('conversation:${conv}', 'broadcast')`);
check('C no puede emitir en él', !!r.error, r);
r = await topic(A, 'conversation:no-es-un-uuid', `insert into realtime.messages (topic, extension) values ('x', 'broadcast')`);
check('un topic mal formado se rechaza sin error de conversión', /row-level security/.test(r.error ?? ''), r);
r = await topic(A, `conversation:${conv}`, `insert into realtime.messages (topic, extension) values ('conversation:${conv}', 'presence')`);
check('solo se autoriza broadcast', !!r.error, r);
await db.exec(`select set_config('realtime.topic', '', false)`);

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

for (const n of [1, 2, 3]) await run(A, `insert into posts (id, author_id, image_path, image_width, image_height) values ('30000000-0000-0000-0000-00000000000${n}', '${A}', '${A}/${n}.jpg', 10, 10)`);
// Dos posts con el mismo created_at: el id desempata y el cursor no debe saltarse ninguno.
await db.exec(`update posts set created_at = '2026-01-01T00:00:00Z' where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002')`);
const page = async (cursor) => (await run(C, `select id, created_at from get_posts(page_size => 1, by_author => '${A}'${cursor ? `, cursor_created_at => '${cursor.created_at.toISOString()}', cursor_id => '${cursor.id}'` : ''})`)).rows;
const p1 = await page(), p2 = await page(p1[0]), p3 = await page(p2[0]), p4 = await page(p3[0]);
check('paginación por cursor: 3 páginas sin repetir ni saltar', [p1, p2, p3].map((p) => p[0]?.id.slice(-1)).join('') === '321' && p4.length === 0, { p1, p2, p3, p4 });
r = await run(C, `select count(*)::int as n from get_posts(page_size => 1000)`);
check('page_size tiene tope', r.rows?.[0]?.n <= 50, r);
r = await run(C, `select count(*)::int as n from get_posts(only_following => true)`);
check('feed de C: solo de cuentas que sigue', r.rows?.[0]?.n === 3, r);
r = await run(B, `select count(*)::int as n from get_posts(only_following => true)`);
check('feed de B: no incluye a quien no sigue', r.rows?.[0]?.n === 1, r);

await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
try { await db.query('select * from profiles'); check('anon sin acceso', false); } catch (e) { check('anon sin acceso', /permission denied/.test(e.message), e.message); }
r = await db.query(`select is_username_available('ana') as taken, is_username_available('ANA') as upper, is_username_available('libre') as free`);
check('anon consulta si un usuario está libre', r.rows[0].taken === false && r.rows[0].upper === false && r.rows[0].free === true, r.rows);
try { await db.query(`select * from get_posts()`); check('anon no ejecuta get_posts', false); } catch (e) { check('anon no ejecuta get_posts', /permission denied/.test(e.message), e.message); }
try { await db.query(`select get_profile_stats('${A}')`); check('anon no ejecuta otras funciones', false); } catch (e) { check('anon no ejecuta otras funciones', /permission denied/.test(e.message), e.message); }
await db.exec('reset role');

console.log(fails ? `\n${fails} fallos` : '\ntodo ok');
process.exit(fails ? 1 : 0);
