import { launchImageLibraryAsync } from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';

import { createPost, MAX_TEXT_LENGTH, PostError } from '@/domain/usecases/posts';
import { Button } from '@/presentation/components/button';
import { TextField } from '@/presentation/components/text-field';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useDependencies } from '@/presentation/dependencies';
import { Spacing } from '@/presentation/theme';

type PickedImage = { uri: string; width: number; height: number };

function errorMessage(error: unknown): string {
  if (error instanceof PostError && error.code === 'text_too_long') {
    return `El pie de foto no puede superar los ${MAX_TEXT_LENGTH} caracteres.`;
  }
  return 'No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.';
}

export function CreatePostScreen() {
  const { posts } = useDependencies();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function pickImage() {
    // El selector del sistema no necesita pedir permiso de galería: la app solo recibe
    // la foto que el usuario elige. Se pide a calidad completa; la reducción y la
    // compresión las hace la capa de datos antes de subir.
    const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;

    const [asset] = result.assets;
    setImage({ uri: asset.uri, width: asset.width, height: asset.height });
    setError(null);
  }

  async function publish() {
    if (!image) return;
    setError(null);
    setPublishing(true);

    try {
      await createPost(posts, {
        imageUri: image.uri,
        imageWidth: image.width,
        imageHeight: image.height,
        caption,
      });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setPublishing(false);
    }
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: 'Nueva publicación' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={pickImage}
          disabled={publishing}
          accessibilityRole="button"
          accessibilityLabel={image ? 'Cambiar foto' : 'Elegir foto'}>
          {image ? (
            // Archivo local recién elegido: no pasa por la caché de imágenes remotas.
            <Image
              source={{ uri: image.uri }}
              style={[styles.preview, { aspectRatio: image.width / image.height }]}
              resizeMode="cover"
            />
          ) : (
            <ThemedView type="backgroundElement" style={[styles.preview, styles.placeholder]}>
              <ThemedText themeColor="textSecondary">Toca para elegir una foto</ThemedText>
            </ThemedView>
          )}
        </Pressable>

        <TextField
          label="Pie de foto"
          value={caption}
          onChangeText={setCaption}
          maxLength={MAX_TEXT_LENGTH}
          multiline
          editable={!publishing}
        />

        {error && (
          <ThemedText type="small" accessibilityRole="alert" style={styles.error}>
            {error}
          </ThemedText>
        )}

        {image && <Button label="Publicar" onPress={publish} loading={publishing} />}
        <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  preview: {
    width: '100%',
    maxHeight: 420,
    borderRadius: Spacing.two,
  },
  placeholder: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#d93025',
  },
});
