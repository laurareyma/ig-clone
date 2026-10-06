import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { imageKey, type ImageRef } from '@/domain/repositories/image-cache';
import { useDependencies } from '@/presentation/dependencies';
import { useTheme } from '@/presentation/hooks/use-theme';

type Props = {
  image: ImageRef;
  // ancho / alto de la imagen original. El hueco se reserva antes de que cargue, así
  // la lista no salta ni recalcula alturas cuando llega la imagen. Se omite cuando el
  // tamaño lo fija `style` (por ejemplo, a pantalla completa).
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  // Se llama cuando la imagen ya está disponible para pintarse.
  onReady?: () => void;
};

// Imagen servida por la caché de dos niveles. No usa la carga por URL de <Image>: solo
// se le entregan archivos locales que ya controla la caché.
export function CachedImage({ image, aspectRatio, style, accessibilityLabel, onReady }: Props) {
  const { images } = useDependencies();
  const theme = useTheme();
  const key = imageKey(image);
  const { bucket, path } = image;
  const [loaded, setLoaded] = useState<{ key: string; uri: string }>();

  // Si está en memoria se pinta en este mismo render. El estado guarda la clave para
  // descartar la URI anterior cuando una lista recicla la celda con otra imagen.
  const uri = images.peek(image) ?? (loaded?.key === key ? loaded.uri : null);

  useEffect(() => {
    const cached = images.peek({ bucket, path });
    // Aunque ya esté en memoria se llama a load(): es lo que registra el uso para el LRU.
    const { promise, cancel } = images.load({ bucket, path });
    let active = true;

    promise.then(
      (result) => {
        if (active && result !== cached) setLoaded({ key, uri: result });
      },
      // Cancelada o fallida: se queda el hueco; se reintenta al volver a montar la celda.
      (error: unknown) => {
        // En desarrollo, la causa sale en la terminal de Metro. Cancelar no es un fallo.
        if (__DEV__ && (error as Error | null)?.name !== 'AbortError') {
          console.warn(`[CachedImage] no se pudo cargar ${key}:`, (error as Error)?.message ?? error);
        }
      },
    );

    // La celda sale de pantalla o se recicla: se suelta la descarga.
    return () => {
      active = false;
      cancel();
    };
  }, [images, key, bucket, path]);

  useEffect(() => {
    if (uri) onReady?.();
  }, [uri, onReady]);

  return (
    <View
      style={[{ aspectRatio, backgroundColor: theme.backgroundElement }, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image">
      {uri && (
        <Image
          testID="cached-image-content"
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={(event) => {
            // El archivo local existe pero el componente nativo no lo pudo pintar.
            if (__DEV__) console.warn(`[CachedImage] no se pudo pintar ${uri}:`, event.nativeEvent.error);
          }}
        />
      )}
    </View>
  );
}
