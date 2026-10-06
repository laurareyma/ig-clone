import { Directory, File, Paths } from 'expo-file-system';

import { throwIfAborted } from '@/data/image-cache/abort';
import type { ImageFiles } from '@/data/image-cache/image-files';
import type { ImageRef } from '@/domain/repositories/image-cache';

type Options = {
  supabaseUrl: string;
  publishableKey: string;
  // Token de la sesión actual; lo exige la RLS del bucket privado.
  getAccessToken: () => Promise<string | null>;
};

// Archivos de la caché en el dispositivo y descarga desde Supabase Storage.
export class ExpoImageFiles implements ImageFiles {
  // Carpeta de caché del sistema: el SO puede vaciarla si falta espacio, y no entra en
  // las copias de seguridad. El motor comprueba que el archivo existe antes de usarlo.
  private readonly directory = new Directory(Paths.cache, 'images');
  private downloads = 0;

  constructor(private readonly options: Options) {}

  uri(fileName: string): string {
    return new File(this.directory, fileName).uri;
  }

  exists(fileName: string): boolean {
    return new File(this.directory, fileName).exists;
  }

  remove(fileName: string): void {
    const file = new File(this.directory, fileName);
    if (file.exists) file.delete();
  }

  removeAll(): void {
    if (this.directory.exists) this.directory.delete();
  }

  async download(image: ImageRef, fileName: string, signal: AbortSignal): Promise<number> {
    const { supabaseUrl, publishableKey, getAccessToken } = this.options;
    const token = (await getAccessToken()) ?? publishableKey;
    throwIfAborted(signal);

    if (!this.directory.exists) this.directory.create({ intermediates: true, idempotent: true });

    // Se descarga a un nombre temporal y se renombra al terminar: en Android una
    // descarga interrumpida deja el archivo a medias, y así nunca queda uno incompleto
    // con el nombre definitivo. El contador evita que dos descargas compartan temporal.
    const partial = new File(this.directory, `${fileName}.${++this.downloads}.part`);

    try {
      // La descarga y la escritura a disco ocurren en hilos nativos; el hilo de JS solo
      // espera la promesa.
      await File.downloadFileAsync(
        `${supabaseUrl}/storage/v1/object/${image.bucket}/${encodeURI(image.path)}`,
        partial,
        {
          headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
          idempotent: true,
          signal,
        },
      );

      const size = partial.size;
      partial.rename(fileName);
      return size;
    } catch (error) {
      if (partial.exists) partial.delete();
      throw error;
    }
  }
}
