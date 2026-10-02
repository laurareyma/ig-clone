import type { ImageFiles } from '@/data/image-cache/image-files';
import { imageKey, type ImageRef } from '@/domain/repositories/image-cache';

type Pending = {
  image: ImageRef;
  fileName: string;
  signal: AbortSignal;
  finish: (size: number) => void;
  fail: (error: Error) => void;
};

// Disco y red simulados. Cada descarga queda pendiente hasta que la prueba decide
// cuándo y cómo termina.
export function createFakeImageFiles() {
  const disk = new Map<string, number>();
  const pending: Pending[] = [];
  const started: string[] = [];

  const files: ImageFiles = {
    uri: (fileName) => `file:///cache/images/${fileName}`,
    exists: (fileName) => disk.has(fileName),
    remove: (fileName) => void disk.delete(fileName),
    removeAll: () => disk.clear(),
    download(image, fileName, signal) {
      started.push(imageKey(image));

      return new Promise<number>((resolve, reject) => {
        const entry: Pending = {
          image,
          fileName,
          signal,
          finish: (size) => {
            disk.set(fileName, size);
            resolve(size);
          },
          fail: reject,
        };
        pending.push(entry);

        signal.addEventListener('abort', () => {
          pending.splice(pending.indexOf(entry), 1);
          reject(signal.reason);
        });
      });
    },
  };

  return {
    files,
    disk,
    // Claves cuya descarga llegó a empezar, en orden.
    started,
    pending,
    // Termina la descarga pendiente más antigua.
    finishNext(size = 100) {
      const next = pending.shift();
      if (!next) throw new Error('No hay descargas pendientes');
      next.finish(size);
    },
    failNext(error = new Error('fallo de red')) {
      const next = pending.shift();
      if (!next) throw new Error('No hay descargas pendientes');
      next.fail(error);
    },
  };
}
