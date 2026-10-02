import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { Story, StoryGroup } from '@/domain/entities';
import { rememberIncomingLink, resetPendingLink } from '@/presentation/navigation/pending-link';
import { testSession, type createFakeDependencies } from '@/testing/fake-dependencies';
import { profileFixture } from '@/testing/fixtures';

jest.mock('@/di/container', () => {
  const fake = jest.requireActual('@/testing/fake-dependencies').createFakeDependencies();
  return { container: fake };
});

const fake = jest.requireMock('@/di/container').container as ReturnType<
  typeof createFakeDependencies
>;
const { data, stories } = fake;

const story = (id: string, authorId: string, seen = false): Story => ({
  id,
  author: profileFixture(authorId, { username: authorId }),
  imagePath: `${authorId}/stories/${id}.jpg`,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  seen,
});

const group = (authorId: string, items: Story[]): StoryGroup => ({
  author: items[0].author,
  stories: items,
  allSeen: items.every((item) => item.seen),
});

beforeEach(() => {
  fake.resetSession();
  resetPendingLink();
  data.storyGroups.set([]);
});
afterEach(() => jest.restoreAllMocks());

async function open(url: string, session: typeof testSession | null = testSession) {
  const router = renderRouter('src/app', { initialUrl: url });
  await router;
  await act(async () => fake.setSession(session));
  return { router };
}

describe('fila de historias', () => {
  it('muestra un círculo por autor, distingue las vistas y abre el visor', async () => {
    data.storyGroups.set([
      group('beto', [story('b1', 'beto')]),
      group('carla', [story('c1', 'carla', true)]),
    ]);
    const { router } = await open('/');

    expect(screen.getByLabelText('Historia de beto')).toBeTruthy();
    expect(screen.getByLabelText('Historia de carla, vista')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Historia de beto'));
    expect(router.getPathname()).toBe('/story/beto');
  });

  it('la historia propia se rotula "Tu historia"', async () => {
    data.storyGroups.set([group(testSession.userId, [story('y1', testSession.userId)])]);

    await open('/');

    expect(screen.getByText('Tu historia')).toBeTruthy();
  });
});

describe('visor de historias', () => {
  const groups = [
    group('beto', [story('b1', 'beto', true), story('b2', 'beto')]),
    group('carla', [story('c1', 'carla')]),
  ];

  it('abre en la primera historia sin ver del autor y la marca como vista', async () => {
    data.storyGroups.set(groups);
    const markSeen = jest.spyOn(stories, 'markSeen');

    await open('/story/beto');

    expect(screen.getByLabelText('Historia de beto')).toBeTruthy();
    expect(markSeen.mock.calls).toEqual([['b2']]);
  });

  it('descarga por adelantado la imagen de la siguiente historia', async () => {
    data.storyGroups.set(groups);
    const load = jest.spyOn(fake.images, 'load');

    await open('/story/beto');

    expect(load).toHaveBeenCalledWith({ bucket: 'media', path: 'carla/stories/c1.jpg' });
  });

  // En Jest, Reanimated termina las animaciones al instante: aquí se comprueba la
  // secuencia (qué pasa cuando una barra llega al final), no los 5 segundos ni la pausa.
  it('al terminar cada barra pasa a la siguiente historia sin ver y cierra tras la última', async () => {
    data.storyGroups.set(groups);
    jest.spyOn(fake.images, 'peek').mockReturnValue('file:///historia.jpg');
    const markSeen = jest.spyOn(stories, 'markSeen');

    const { router } = await open('/story/beto');
    // Cada cambio de historia pasa por un par de vueltas del bucle de eventos.
    for (let i = 0; i < 6; i++) await act(async () => jest.runOnlyPendingTimers());

    expect(markSeen.mock.calls).toEqual([['b2'], ['c1']]);
    expect(router.getPathname()).toBe('/');
  });

  it('mientras la imagen no está lista, la barra no arranca', async () => {
    data.storyGroups.set(groups);
    await open('/story/beto');

    await act(async () => jest.advanceTimersByTime(20_000));

    expect(screen.getByLabelText('Historia de beto')).toBeTruthy();
  });

  it('se puede cerrar', async () => {
    data.storyGroups.set(groups);
    const { router } = await open('/story/beto');

    await fireEvent.press(screen.getByLabelText('Cerrar historia'));

    expect(router.getPathname()).toBe('/');
  });

  it('si el autor no tiene historias vigentes, lo indica', async () => {
    data.storyGroups.set(groups);

    await open('/story/nadie');

    expect(screen.getByText('Esta historia ya no está disponible.')).toBeTruthy();
  });

  it('marcar como vista no descoloca la reproducción en curso', async () => {
    data.storyGroups.set(groups);
    await open('/story/beto');

    // La base local reordena los grupos cuando beto pasa a estar visto del todo.
    await act(async () =>
      data.storyGroups.set([groups[1], group('beto', [story('b1', 'beto', true), story('b2', 'beto', true)])]),
    );

    expect(screen.getByLabelText('Historia de beto')).toBeTruthy();
  });
});

describe('deep link sin sesión', () => {
  it('se retoma después de iniciar sesión', async () => {
    // Lo que hace +native-intent cuando llega instagramclone://post/abc con la app cerrada.
    rememberIncomingLink('/(tabs)/(home)/post/abc');
    const { router } = await open('/(tabs)/(home)/post/abc', null);
    expect(router.getPathname()).toBe('/sign-in');

    await act(async () => fake.setSession(testSession));

    expect(router.getPathname()).toBe('/post/abc');
    expect(router.getSegments()).toEqual(['(tabs)', '(home)', 'post', '[id]']);
  });

  it('con sesión guardada el enlace se abre una sola vez', async () => {
    rememberIncomingLink('/(tabs)/(home)/post/abc');
    const { router } = await open('/(tabs)/(home)/post/abc');

    expect(router.getPathname()).toBe('/post/abc');
    // Sin pantallas duplicadas en la pila: volver atrás lleva a Inicio.
    await act(async () => jest.requireActual('expo-router').router.back());
    expect(router.getPathname()).toBe('/');
  });

  it('iniciar sesión sin enlace pendiente lleva a Inicio', async () => {
    const { router } = await open('/', null);

    await act(async () => fake.setSession(testSession));

    expect(router.getPathname()).toBe('/');
  });
});
