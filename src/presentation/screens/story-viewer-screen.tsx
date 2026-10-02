import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { StoryGroup } from '@/domain/entities';
import {
  firstUnseenIndex,
  nextStory,
  previousStory,
  type StoryPosition,
} from '@/domain/story-groups';
import { Avatar } from '@/presentation/components/avatar';
import { CachedImage } from '@/presentation/components/cached-image';
import { Icon } from '@/presentation/components/icon';
import { ThemedText } from '@/presentation/components/themed-text';
import { useDependencies } from '@/presentation/dependencies';
import { formatRelativeTime } from '@/presentation/format/relative-time';
import { useStoryGroups } from '@/presentation/hooks/use-stories';
import { Spacing } from '@/presentation/theme';

export const STORY_DURATION_MS = 5000;
// Por debajo de esto es un toque (pasar de historia); por encima, mantener (pausa).
const HOLD_MS = 200;

function ProgressBar({ state, progress }: { state: 'done' | 'current' | 'upcoming'; progress: SharedValue<number> }) {
  // Se anima la escala y no el ancho: una transformación no obliga a recalcular el
  // layout, así que cada fotograma lo resuelve el hilo de UI sin pasar por JavaScript.
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));

  return (
    <View style={styles.track}>
      {state === 'current' ? (
        <Animated.View style={[styles.fill, animated]} />
      ) : (
        state === 'done' && <View style={styles.fill} />
      )}
    </View>
  );
}

type Playback = { groups: StoryGroup[]; at: StoryPosition };

export function StoryViewerScreen({ userId }: { userId: string }) {
  const { stories, images } = useDependencies();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { groups } = useStoryGroups();
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [readyStoryId, setReadyStoryId] = useState<string>();

  // Avance de la historia actual, de 0 a 1. Vive en el hilo de UI. Se lee y escribe con
  // get()/set() en vez de .value, que es la forma compatible con el React Compiler.
  const progress = useSharedValue(0);
  const imageReady = useSharedValue(false);
  const holding = useSharedValue(false);

  // La lista se fija al abrir. Marcar historias como vistas reordena los grupos en la
  // base local, y si se siguiera esa lista viva las posiciones cambiarían bajo los pies.
  if (!playback && groups) {
    const group = groups.findIndex((item) => item.author.id === userId);
    if (group !== -1) setPlayback({ groups, at: { group, story: firstUnseenIndex(groups[group]) } });
  }

  const current = playback && playback.groups[playback.at.group];
  const story = current?.stories[playback!.at.story];
  const storyId = story?.id;
  const upcoming = playback && nextStory(playback.groups, playback.at);
  const upcomingPath = upcoming
    ? playback.groups[upcoming.group].stories[upcoming.story].imagePath
    : undefined;
  const ready = storyId !== undefined && readyStoryId === storyId;

  function advance() {
    if (!playback) return;
    const next = nextStory(playback.groups, playback.at);
    // Tras la última historia se cierra el visor.
    if (next) setPlayback({ ...playback, at: next });
    else router.back();
  }

  function goBack() {
    if (!playback) return;
    setPlayback({ ...playback, at: previousStory(playback.groups, playback.at) });
    // Si era la primera, la posición no cambia: se reinicia la misma historia.
    progress.set(0);
    if (imageReady.get()) play();
  }

  // Anima lo que falta hasta el final. Se ejecuta en el hilo de UI; al terminar pide al
  // hilo de JavaScript que pase a la siguiente historia.
  function play() {
    'worklet';
    progress.set(
      withTiming(
        1,
        { duration: STORY_DURATION_MS * (1 - progress.get()), easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(advance);
        },
      ),
    );
  }

  useEffect(() => {
    // Historia nueva: la barra vuelve a cero y espera a que la imagen esté lista, para
    // no gastar los 5 segundos mirando un hueco gris.
    cancelAnimation(progress);
    progress.set(0);
    imageReady.set(ready);
    if (ready && !holding.get()) play();
    // play y los valores compartidos son estables: solo importa qué historia es y si
    // su imagen ya está.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, ready]);

  useEffect(() => {
    if (storyId) stories.markSeen(storyId).catch(() => {});
  }, [stories, storyId]);

  useEffect(() => {
    // Se adelanta la descarga de la siguiente imagen para que el cambio sea inmediato.
    if (!upcomingPath) return;
    const { cancel } = images.load({ bucket: 'media', path: upcomingPath });
    return cancel;
  }, [images, upcomingPath]);

  // Los gestos se resuelven en el hilo de UI: pausar y reanudar no esperan a JavaScript,
  // así que la barra se detiene en el mismo fotograma en que se apoya el dedo.
  const hold = Gesture.LongPress()
    .minDuration(HOLD_MS)
    // Sin límite: se puede mantener todo el tiempo que se quiera.
    .maxDistance(10_000)
    .onStart(() => {
      holding.set(true);
      cancelAnimation(progress);
    })
    .onFinalize(() => {
      if (!holding.get()) return;
      holding.set(false);
      if (imageReady.get()) play();
    });

  const tap = Gesture.Tap()
    .maxDuration(HOLD_MS)
    .onEnd((event) => {
      // Tercio izquierdo: anterior. El resto: siguiente.
      scheduleOnRN(event.x < width / 3 ? goBack : advance);
    });

  if (!current || !story) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {groups === undefined ? (
          <ActivityIndicator color="#ffffff" style={styles.screen} />
        ) : (
          <View style={styles.empty}>
            <ThemedText style={styles.white}>Esta historia ya no está disponible.</ThemedText>
            <Pressable onPress={() => router.back()} accessibilityRole="button">
              <ThemedText type="linkPrimary">Cerrar</ThemedText>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    // Un modal necesita su propia raíz de gestos en Android.
    <GestureHandlerRootView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <GestureDetector gesture={Gesture.Exclusive(hold, tap)}>
        <View style={styles.screen} accessibilityLabel={`Historia de ${current.author.username}`}>
          <CachedImage
            image={{ bucket: 'media', path: story.imagePath }}
            style={styles.image}
            onReady={() => setReadyStoryId(story.id)}
          />
        </View>
      </GestureDetector>

      <View style={[styles.overlay, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {current.stories.map((item, index) => (
            <ProgressBar
              key={item.id}
              progress={progress}
              state={
                index < playback.at.story
                  ? 'done'
                  : index === playback.at.story
                    ? 'current'
                    : 'upcoming'
              }
            />
          ))}
        </View>
        <View style={styles.header}>
          <Avatar profile={current.author} size={32} />
          <ThemedText type="smallBold" style={styles.white}>
            {current.author.username}
          </ThemedText>
          <ThemedText type="small" style={styles.dimmed}>
            {formatRelativeTime(story.createdAt)}
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Cerrar historia">
            <Icon name="close" color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  image: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  bars: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  fill: {
    flex: 1,
    backgroundColor: '#ffffff',
    // La barra crece desde la izquierda, no desde el centro.
    transformOrigin: 'left',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  close: {
    marginLeft: 'auto',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  white: {
    color: '#ffffff',
  },
  dimmed: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
