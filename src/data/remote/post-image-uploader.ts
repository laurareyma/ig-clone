import type { LocalImage } from '@/domain/repositories/post-repository';

// Prepara y sube la imagen de una publicación o de una historia. La implementación real usa módulos
// nativos de Expo (ver data/media); las pruebas usan una simulada.
export interface PostImageUploader {
  // Reduce y comprime la imagen local, la sube a `path` dentro del bucket media y
  // devuelve las dimensiones finales.
  upload(image: LocalImage, path: string): Promise<{ width: number; height: number }>;
  remove(path: string): Promise<void>;
}
