import {
  TwoLevelImageCache,
  type ImageCacheOptions,
} from '@/data/image-cache/two-level-image-cache';
import { migrate } from '@/data/local/migrations';
import type { ImageRef } from '@/domain/repositories/image-cache';
import { createFakeImageFiles } from '@/testing/fake-image-files';
import { createTestDatabase } from '@/testing/node-sqlite';

const img = (name: string): ImageRef => ({ bucket: 'media', path: `user/${name}.jpg` });
const a = img('a');
const b = img('b');
const c = img('c');

// Deja avanzar las promesas internas (consultas a SQLite) hasta que la descarga arranca.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(options: ImageCacheOptions = {}) {
  const db = createTestDatabase();
  await migrate(db);
  const fake = createFakeImageFiles();
  let fileNumber = 0;
  const create = () =>
    new TwoLevelImageCache(async () => db, fake.files, {
      newFileName: () => `f${++fileNumber}`,
      ...options,
    });
  const cache = create();

  // Carga completa de una imagen que no está en caché.
  const download = async (image: ImageRef, size = 100, target = cache) => {
    const { promise } = target.load(image);
    await settle();
    fake.finishNext(size);
    const uri = await promise;
    await target.whenIdle();
    return uri;
  };

  const indexedKeys = async () =>
    (await db.getAllAsync<{ key: string }>('SELECT key FROM image_cache ORDER BY key', [])).map(
      (row) => row.key,
    );

  return { db, fake, cache, create, download, indexedKeys };
}

describe('niveles de la caché', () => {
  it('la primera vez descarga y devuelve la URI del archivo local', async () => {
    const { fake, download, indexedKeys } = await setup();

    const uri = await download(a);

    expect(uri).toBe('file:///cache/images/f1');
    expect(fake.started).toEqual(['media/user/a.jpg']);
    expect(await indexedKeys()).toEqual(['media/user/a.jpg']);
  });

  it('la segunda vez responde desde memoria, sin red y de forma síncrona con peek', async () => {
    const { cache, fake, download } = await setup();
    expect(cache.peek(a)).toBeNull();
    const uri = await download(a);

    expect(cache.peek(a)).toBe(uri);
    expect(await cache.load(a).promise).toBe(uri);
    expect(fake.started).toHaveLength(1);
  });

  it('tras reiniciar la app responde desde disco, sin red', async () => {
    const { fake, create, download } = await setup();
    const uri = await download(a);

    const afterRestart = create();

    expect(afterRestart.peek(a)).toBeNull();
    expect(await afterRestart.load(a).promise).toBe(uri);
    expect(afterRestart.peek(a)).toBe(uri);
    expect(fake.started).toHaveLength(1);
  });

  it('si el sistema borró el archivo, vuelve a descargar', async () => {
    const { fake, create, download } = await setup();
    await download(a);
    fake.disk.clear();
    const afterRestart = create();

    const uri = await download(a, 100, afterRestart);

    expect(fake.started).toHaveLength(2);
    expect(fake.files.exists(uri.split('/').pop()!)).toBe(true);
  });

  it('el nivel de memoria desaloja por LRU al superar su capacidad', async () => {
    const { cache, download } = await setup({ maxMemoryEntries: 2 });
    await download(a);
    await download(b);
    await cache.load(a).promise; // a pasa a ser la más reciente

    await download(c);

    expect(cache.peek(a)).not.toBeNull();
    expect(cache.peek(b)).toBeNull();
    expect(cache.peek(c)).not.toBeNull();
  });
});

describe('descargas compartidas y cancelación', () => {
  it('dos peticiones simultáneas de la misma imagen comparten una descarga', async () => {
    const { cache, fake } = await setup();

    const first = cache.load(a);
    const second = cache.load(a);
    await settle();
    fake.finishNext();

    expect(await first.promise).toBe(await second.promise);
    expect(fake.started).toHaveLength(1);
  });

  it('cancelar aborta la descarga y no deja rastro', async () => {
    const { cache, fake, indexedKeys } = await setup();
    const { promise, cancel } = cache.load(a);
    await settle();
    const { signal } = fake.pending[0];

    cancel();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(true);
    expect(fake.disk.size).toBe(0);
    expect(await indexedKeys()).toEqual([]);
    expect(cache.peek(a)).toBeNull();
  });

  it('cancelar antes de que empiece la descarga evita la petición de red', async () => {
    const { cache, fake } = await setup();
    const { promise, cancel } = cache.load(a);

    cancel();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.started).toEqual([]);
  });

  it('no aborta mientras quede alguien esperando la imagen', async () => {
    const { cache, fake } = await setup();
    const first = cache.load(a);
    const second = cache.load(a);
    await settle();

    first.cancel();
    first.cancel(); // repetir no descuenta dos veces

    expect(fake.pending[0].signal.aborted).toBe(false);
    fake.finishNext();
    expect(await second.promise).toBe('file:///cache/images/f1');
  });

  it('tras cancelar, una petición nueva empieza otra descarga', async () => {
    const { cache, fake } = await setup();
    const cancelled = cache.load(a);
    await settle();
    cancelled.cancel();

    const retry = cache.load(a);
    await settle();
    fake.finishNext();

    expect(await retry.promise).toBe('file:///cache/images/f2');
    expect(fake.started).toHaveLength(2);
  });

  it('si la descarga falla no guarda nada y se puede reintentar', async () => {
    const { cache, fake, download, indexedKeys } = await setup();
    const { promise } = cache.load(a);
    await settle();

    fake.failNext(new Error('HTTP 500'));

    await expect(promise).rejects.toThrow('HTTP 500');
    expect(await indexedKeys()).toEqual([]);
    expect(await download(a)).toBe('file:///cache/images/f2');
  });
});

describe('desalojo LRU del disco', () => {
  it('al superar el límite borra la imagen que lleva más tiempo sin usarse', async () => {
    const { cache, fake, download, indexedKeys } = await setup({ maxDiskBytes: 250 });
    await download(a);
    await download(b);

    await download(c);

    expect(await indexedKeys()).toEqual(['media/user/b.jpg', 'media/user/c.jpg']);
    expect([...fake.disk.keys()]).toEqual(['f2', 'f3']);
    expect(cache.peek(a)).toBeNull();
  });

  it('un acierto en memoria cuenta como uso para el disco', async () => {
    const { cache, download, indexedKeys } = await setup({ maxDiskBytes: 250 });
    await download(a);
    await download(b);
    await cache.load(a).promise; // se sirve desde memoria, sin tocar SQLite

    await download(c);

    expect(await indexedKeys()).toEqual(['media/user/a.jpg', 'media/user/c.jpg']);
  });

  it('borra las que hagan falta hasta volver a estar bajo el límite', async () => {
    const { download, indexedKeys } = await setup({ maxDiskBytes: 250 });
    await download(a);
    await download(b);

    await download(c, 200);

    expect(await indexedKeys()).toEqual(['media/user/c.jpg']);
  });

  it('no borra la imagen recién guardada aunque sola supere el límite', async () => {
    const { fake, download, indexedKeys } = await setup({ maxDiskBytes: 250 });
    await download(a);

    const uri = await download(b, 1000);

    expect(await indexedKeys()).toEqual(['media/user/b.jpg']);
    expect(fake.files.exists(uri.split('/').pop()!)).toBe(true);
  });

  it('dos usos en el mismo milisegundo conservan su orden', async () => {
    const { download, indexedKeys } = await setup({ maxDiskBytes: 250, now: () => 1000 });
    await download(a);
    await download(b);

    await download(c);

    expect(await indexedKeys()).toEqual(['media/user/b.jpg', 'media/user/c.jpg']);
  });
});

describe('clear', () => {
  it('vacía memoria, índice y archivos, y aborta lo que estaba en curso', async () => {
    const { cache, fake, download, indexedKeys } = await setup();
    await download(a);
    const inProgress = cache.load(b);
    await settle();

    await cache.clear();

    await expect(inProgress.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.peek(a)).toBeNull();
    expect(await indexedKeys()).toEqual([]);
    expect(fake.disk.size).toBe(0);
  });
});
