import type { ImageRef } from '@/domain/repositories/image-cache';

// Acceso a los archivos de imagen del disco y a la red. Separado del motor de caché
// para poder probar este con archivos simulados.
export interface ImageFiles {
  uri(fileName: string): string;
  exists(fileName: string): boolean;
  // No falla si el archivo no existe.
  remove(fileName: string): void;
  removeAll(): void;
  // Descarga la imagen a fileName y resuelve con su tamaño en bytes. Si falla o se
  // aborta, rechaza sin dejar ningún archivo.
  download(image: ImageRef, fileName: string, signal: AbortSignal): Promise<number>;
}
