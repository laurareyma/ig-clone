// Llena una cuenta con publicaciones de prueba para medir el feed con listas largas
// (FPS, memoria, caché de imágenes). Las imágenes son de 1080 px de ancho, como las que
// sube la app, así que ocupan lo mismo en memoria al decodificarse.
//
// Uso:
//   SEED_EMAIL=tu@correo SEED_PASSWORD=... npm run seed            # 60 publicaciones
//   SEED_EMAIL=... SEED_PASSWORD=... SEED_COUNT=200 npm run seed
//   SEED_EMAIL=... SEED_PASSWORD=... npm run seed -- --clean       # borra las de prueba
//
// Usa la clave pública y la sesión de esa cuenta: pasa por las mismas reglas de RLS y
// Storage que la app.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CAPTION_PREFIX = '[seed]';

function readEnv() {
  const values = { ...process.env };
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const index = line.indexOf('=');
      if (index > 0 && !line.startsWith('#')) values[line.slice(0, index)] ??= line.slice(index + 1).trim();
    }
  } catch {
    // Sin .env.local: se usan solo las variables del entorno.
  }
  return values;
}

// PNG sin dependencias: franjas horizontales de dos colores.
function png(width, height, top, bottom) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };

  const rows = [];
  for (let y = 0; y < height; y++) {
    const color = Math.floor(y / (height / 8)) % 2 === 0 ? top : bottom;
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) row.set(color, 1 + x * 3);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const randomColor = () => [0, 0, 0].map(() => 40 + Math.floor(Math.random() * 200));
const sizes = [
  [1080, 1350],
  [1080, 1080],
  [1080, 810],
];

async function main() {
  const env = readEnv();
  const { SEED_EMAIL: email, SEED_PASSWORD: password } = env;
  if (!email || !password) throw new Error('Faltan SEED_EMAIL y SEED_PASSWORD.');

  const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`No se pudo iniciar sesión: ${signInError.message}`);
  const userId = auth.user.id;

  if (process.argv.includes('--clean')) {
    const { data: posts, error } = await client
      .from('posts')
      .select('id, image_path')
      .eq('author_id', userId)
      .like('caption', `${CAPTION_PREFIX}%`);
    if (error) throw error;
    if (posts.length > 0) {
      await client.storage.from('media').remove(posts.map((post) => post.image_path));
      const { error: deleteError } = await client.from('posts').delete().in('id', posts.map((post) => post.id));
      if (deleteError) throw deleteError;
    }
    console.log(`Borradas ${posts.length} publicaciones de prueba.`);
    return;
  }

  const count = Number(env.SEED_COUNT ?? 60);
  for (let i = 1; i <= count; i++) {
    const [width, height] = sizes[i % sizes.length];
    const id = randomUUID();
    const path = `${userId}/seed-${id}.png`;

    const upload = await client.storage
      .from('media')
      .upload(path, png(width, height, randomColor(), randomColor()), { contentType: 'image/png' });
    if (upload.error) throw upload.error;

    const { error } = await client.from('posts').insert({
      id,
      author_id: userId,
      image_path: path,
      image_width: width,
      image_height: height,
      caption: `${CAPTION_PREFIX} Publicación de prueba ${i} de ${count}`,
    });
    if (error) throw error;
    process.stdout.write(`\r${i}/${count}`);
  }
  console.log(`\nCreadas ${count} publicaciones en la cuenta ${email}.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
