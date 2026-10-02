// Una imagen se identifica por su ubicación en Storage, que no cambia. Las URL de
// descarga de un bucket privado sí cambian, así que no sirven como clave de caché.
export type ImageRef = {
  bucket: 'media' | 'avatars';
  path: string;
};

export type ImageLoad = {
  // Resuelve con la URI local (file://) de la imagen. Rechaza si falla o se cancela.
  promise: Promise<string>;
  // Quien ya no necesita la imagen (la celda salió de pantalla) debe llamarlo. La
  // descarga se aborta cuando la cancelan todos los que la esperaban.
  cancel: () => void;
};

export interface ImageCache {
  // Consulta solo el nivel de memoria. Es síncrona para poder pintar la imagen en el
  // primer render, sin pasar por un estado de carga.
  peek(image: ImageRef): string | null;
  load(image: ImageRef): ImageLoad;
  clear(): Promise<void>;
}

export function imageKey(image: ImageRef): string {
  return `${image.bucket}/${image.path}`;
}
