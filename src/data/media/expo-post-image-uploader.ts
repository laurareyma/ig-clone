import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Client } from '@/data/remote/current-user';
import type { LocalImage, PostImageUploader } from '@/data/remote/post-image-uploader';

// Una foto de cámara ronda los 4000 px y varios MB. Ninguna pantalla de teléfono muestra
// el feed a más de 1080 px de ancho, así que subir más solo gasta datos, almacenamiento
// y memoria al decodificar.
const MAX_WIDTH = 1080;
const JPEG_QUALITY = 0.8;

export class ExpoPostImageUploader implements PostImageUploader {
  constructor(private readonly client: Client) {}

  async upload(image: LocalImage, path: string): Promise<{ width: number; height: number }> {
    // El redimensionado y la compresión los hace el módulo nativo fuera del hilo de JS.
    const context = ImageManipulator.manipulate(image.uri);
    // Solo se reduce: una imagen pequeña no se amplía. El alto se ajusta en proporción.
    if (image.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    const file = new File(saved.uri);

    try {
      const bytes = await file.bytes();
      const { error } = await this.client.storage
        .from('media')
        .upload(path, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg' });
      if (error) throw error;
    } finally {
      // El archivo comprimido es temporal.
      if (file.exists) file.delete();
    }

    return { width: saved.width, height: saved.height };
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from('media').remove([path]);
    if (error) throw error;
  }
}
