import { act, render, screen } from '@testing-library/react-native';

import { imageKey, type ImageCache, type ImageRef } from '@/domain/repositories/image-cache';
import { CachedImage } from '@/presentation/components/cached-image';
import { DependenciesProvider, type Dependencies } from '@/presentation/dependencies';
import { createFakeDependencies } from '@/testing/fake-dependencies';

const a: ImageRef = { bucket: 'media', path: 'user/a.jpg' };
const b: ImageRef = { bucket: 'media', path: 'user/b.jpg' };

// Caché controlada por la prueba: decide qué hay en memoria y cuándo termina cada carga.
function fakeCache() {
  const memory = new Map<string, string>();
  const loads: { key: string; resolve: (uri: string) => void; cancel: jest.Mock }[] = [];

  const images: ImageCache = {
    peek: (image) => memory.get(imageKey(image)) ?? null,
    load(image) {
      const key = imageKey(image);
      const cancel = jest.fn();
      let resolve!: (uri: string) => void;
      const promise = new Promise<string>((res) => (resolve = res));
      if (memory.has(key)) resolve(memory.get(key)!);
      loads.push({ key, resolve, cancel });
      return { promise, cancel };
    },
    clear: async () => {},
  };

  return { images, memory, loads };
}

function tree(dependencies: Dependencies, image: ImageRef) {
  return (
    <DependenciesProvider value={dependencies}>
      <CachedImage image={image} aspectRatio={4 / 5} accessibilityLabel="Foto de ana" />
    </DependenciesProvider>
  );
}

async function setup(image: ImageRef, prepare?: (cache: ReturnType<typeof fakeCache>) => void) {
  const cache = fakeCache();
  prepare?.(cache);
  const dependencies = { ...createFakeDependencies(), images: cache.images };
  await render(tree(dependencies, image));
  return { ...cache, dependencies };
}

const shownUri = () => screen.queryByTestId('cached-image-content')?.props.source.uri ?? null;

describe('CachedImage', () => {
  it('reserva el hueco y muestra la imagen cuando termina la carga', async () => {
    const { loads } = await setup(a);

    expect(screen.getByLabelText('Foto de ana').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ aspectRatio: 4 / 5 })]),
    );
    expect(shownUri()).toBeNull();

    await act(async () => loads[0].resolve('file:///a'));

    expect(shownUri()).toBe('file:///a');
  });

  it('si está en memoria la pinta en el primer render y registra el uso', async () => {
    const { loads } = await setup(a, ({ memory }) => memory.set(imageKey(a), 'file:///a'));

    expect(shownUri()).toBe('file:///a');
    expect(loads.map((load) => load.key)).toEqual([imageKey(a)]);
  });

  it('al desmontarse cancela la carga', async () => {
    const { loads } = await setup(a);

    await screen.unmount();

    expect(loads[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('al reciclarse con otra imagen cancela la anterior y no muestra la vieja', async () => {
    const { loads, dependencies } = await setup(a);
    await act(async () => loads[0].resolve('file:///a'));

    await screen.rerender(tree(dependencies, b));

    expect(loads[0].cancel).toHaveBeenCalledTimes(1);
    expect(shownUri()).toBeNull();

    await act(async () => loads[1].resolve('file:///b'));
    expect(shownUri()).toBe('file:///b');
  });

  it('ignora una carga que termina después de reciclar la celda', async () => {
    const { loads, dependencies } = await setup(a);
    await screen.rerender(tree(dependencies, b));

    await act(async () => loads[0].resolve('file:///a'));

    expect(shownUri()).toBeNull();
  });
});
