import { throwIfAborted } from '@/data/image-cache/abort';
import { DiskIndex } from '@/data/image-cache/disk-index';
import type { ImageFiles } from '@/data/image-cache/image-files';
import { LruMap } from '@/data/image-cache/lru-map';
import type { SqlDatabase } from '@/data/local/sql-database';
import {
  imageKey,
  type ImageCache,
  type ImageLoad,
  type ImageRef,
} from '@/domain/repositories/image-cache';

export type ImageCacheOptions = {
  // Entradas en el nivel de memoria.
  maxMemoryEntries?: number;
  // Bytes en el nivel de disco.
  maxDiskBytes?: number;
  now?: () => number;
  newFileName?: () => string;
};

type Flight = {
  promise: Promise<string>;
  controller: AbortController;
  consumers: number;
};

const EVICTION_BATCH = 50;
const TOUCH_FLUSH_THRESHOLD = 64;

// Caché de imágenes de dos niveles con desalojo LRU en ambos.
//
// Nivel 1, memoria: clave → URI local. Responde de forma síncrona, así que una imagen ya
// vista se pinta en el primer render sin consultar SQLite ni el disco.
// Nivel 2, disco: los archivos en la carpeta de caché más un índice en SQLite con tamaño
// y último uso de cada uno. Sobrevive a reinicios y tiene un límite en bytes.
//
// Los bitmaps decodificados no viven aquí: los gestiona el componente Image nativo.
export class TwoLevelImageCache implements ImageCache {
  private readonly memory: LruMap<string, string>;
  private readonly index: DiskIndex;
  private readonly maxDiskBytes: number;
  private readonly now: () => number;
  private readonly newFileName: () => string;

  // Descargas en curso por clave: varias celdas que piden la misma imagen comparten una.
  private readonly inFlight = new Map<string, Flight>();
  // Usos aún no escritos en el índice (ver touch()).
  private readonly pendingTouches = new Map<string, number>();
  private eviction: Promise<void> = Promise.resolve();
  private lastTick = 0;

  constructor(
    getDb: () => Promise<SqlDatabase>,
    private readonly files: ImageFiles,
    options: ImageCacheOptions = {},
  ) {
    this.memory = new LruMap(options.maxMemoryEntries ?? 300);
    this.index = new DiskIndex(getDb);
    this.maxDiskBytes = options.maxDiskBytes ?? 200 * 1024 * 1024;
    this.now = options.now ?? Date.now;
    this.newFileName =
      options.newFileName ??
      (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  }

  peek(image: ImageRef): string | null {
    return this.memory.peek(imageKey(image)) ?? null;
  }

  load(image: ImageRef): ImageLoad {
    const key = imageKey(image);

    let flight = this.inFlight.get(key);
    if (!flight) {
      flight = this.startFlight(key, image);
      this.inFlight.set(key, flight);
    }

    const joined = flight;
    joined.consumers++;
    let cancelled = false;

    return {
      promise: joined.promise,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        joined.consumers--;

        // Nadie más espera esta imagen: se aborta la descarga. Se retira ya del mapa
        // para que una petición nueva empiece de cero en vez de unirse a una abortada.
        if (joined.consumers === 0 && this.inFlight.get(key) === joined) {
          this.inFlight.delete(key);
          joined.controller.abort();
        }
      },
    };
  }

  async clear(): Promise<void> {
    for (const flight of this.inFlight.values()) flight.controller.abort();
    this.inFlight.clear();
    this.memory.clear();
    this.pendingTouches.clear();

    // Tras cualquier desalojo en curso, para que no reescriba lo que se acaba de vaciar.
    this.eviction = this.eviction.then(async () => {
      await this.index.clear();
      this.files.removeAll();
    });
    await this.eviction;
  }

  // Resuelve cuando no queda ningún desalojo pendiente.
  whenIdle(): Promise<void> {
    return this.eviction;
  }

  private startFlight(key: string, image: ImageRef): Flight {
    const controller = new AbortController();
    const flight: Flight = {
      controller,
      consumers: 0,
      promise: this.resolve(key, image, controller.signal).finally(() => {
        if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
      }),
    };
    // Quien canceló ya no escucha el rechazo; sin esto sería un "unhandled rejection".
    flight.promise.catch(() => {});
    return flight;
  }

  private async resolve(key: string, image: ImageRef, signal: AbortSignal): Promise<string> {
    // Nivel 1.
    const inMemory = this.memory.get(key);
    if (inMemory) {
      this.touch(key);
      return inMemory;
    }

    // Nivel 2.
    const entry = await this.index.get(key);
    if (entry) {
      if (this.files.exists(entry.file_name)) {
        const uri = this.files.uri(entry.file_name);
        this.memory.set(key, uri);
        this.touch(key);
        return uri;
      }
      // El sistema operativo puede vaciar la carpeta de caché si falta espacio.
      await this.index.delete([key]);
    }

    // Red.
    throwIfAborted(signal);
    const fileName = this.newFileName();
    const size = await this.files.download(image, fileName, signal);

    if (signal.aborted) {
      // Se canceló justo al terminar: el archivo ya no le sirve a nadie.
      this.files.remove(fileName);
      throwIfAborted(signal);
    }

    await this.index.put({ key, file_name: fileName, size, last_accessed: this.tick() });
    const uri = this.files.uri(fileName);
    this.memory.set(key, uri);
    this.scheduleEviction(key);
    return uri;
  }

  // Un acierto en memoria no toca el disco, así que el índice no se enteraría de que la
  // imagen se sigue usando y el LRU de disco borraría justo las más vistas. Los usos se
  // acumulan aquí y se escriben juntos antes de cada desalojo.
  private touch(key: string): void {
    this.pendingTouches.set(key, this.tick());
    if (this.pendingTouches.size >= TOUCH_FLUSH_THRESHOLD) void this.flushTouches();
  }

  private async flushTouches(): Promise<void> {
    const touches = new Map(this.pendingTouches);
    this.pendingTouches.clear();
    await this.index.touch(touches);
  }

  // Los desalojos se encadenan: dos descargas que terminan a la vez no calculan el
  // espacio ocupado en paralelo.
  private scheduleEviction(justStored: string): void {
    this.eviction = this.eviction.then(() => this.evict(justStored)).catch(() => {});
  }

  private async evict(justStored: string): Promise<void> {
    await this.flushTouches();
    let total = await this.index.totalSize();

    while (total > this.maxDiskBytes) {
      const candidates = await this.index.leastRecentlyUsed(EVICTION_BATCH);
      const victims: string[] = [];

      for (const entry of candidates) {
        if (total <= this.maxDiskBytes) break;
        // La imagen recién guardada se está mostrando: no se borra aunque sola supere el límite.
        if (entry.key === justStored) continue;

        this.files.remove(entry.file_name);
        this.memory.delete(entry.key);
        victims.push(entry.key);
        total -= entry.size;
      }

      if (victims.length === 0) break;
      await this.index.delete(victims);
    }
  }

  // Marca de tiempo estrictamente creciente: dos usos en el mismo milisegundo conservan
  // su orden en el LRU.
  private tick(): number {
    this.lastTick = Math.max(this.now(), this.lastTick + 1);
    return this.lastTick;
  }
}
