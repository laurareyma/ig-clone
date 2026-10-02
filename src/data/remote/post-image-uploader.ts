export type LocalImage = { uri: string; width: number; height: number };

// Prepara y sube la imagen de una publicación. La implementación real usa módulos
// nativos de Expo (ver data/media); las pruebas usan una simulada.
export interface PostImageUploader {
  // Reduce y comprime la imagen local, la sube a `path` dentro del bucket media y
  // devuelve las dimensiones finales.
  upload(image: LocalImage, path: string): Promise<{ width: number; height: number }>;
  remove(path: string): Promise<void>;
}
