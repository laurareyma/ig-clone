import { act, renderRouter } from 'expo-router/testing-library';

import { resolveIncomingLink } from '@/presentation/navigation/incoming-link';
import { createFakeDependencies, testSession } from '@/testing/fake-dependencies';

// El layout raíz importa el contenedor real (Supabase + SQLite); aquí se cambia por
// repositorios en memoria. Cada prueba controla la sesión con setSession().
jest.mock('@/di/container', () => {
  const fake = jest.requireActual('@/testing/fake-dependencies').createFakeDependencies();
  return { container: fake };
});

const { setSession, resetSession } = jest.requireMock('@/di/container')
  .container as ReturnType<typeof createFakeDependencies>;

beforeEach(resetSession);

// Con Testing Library 14 el render es asíncrono; renderRouter devuelve esa promesa con
// los métodos de consulta de rutas (getPathname, getSegments) añadidos encima.
async function open(initialUrl: string, session: typeof testSession | null) {
  const router = renderRouter('src/app', { initialUrl });
  await router;
  await act(async () => setSession(session));
  // Envuelta en un objeto: devolver la promesa directamente la resolvería y se perderían
  // esos métodos.
  return { router };
}

describe('guardia de sesión', () => {
  it('sin sesión lleva a iniciar sesión', async () => {
    const { router } = await open('/', null);

    expect(router.getPathname()).toBe('/sign-in');
  });

  it('con sesión abre la pestaña Inicio', async () => {
    const { router } = await open('/', testSession);

    expect(router.getPathname()).toBe('/');
    expect(router.getSegments()).toEqual(['(tabs)', '(home)']);
  });

  it('al cerrar sesión vuelve a iniciar sesión', async () => {
    const { router } = await open('/profile', testSession);
    expect(router.getPathname()).toBe('/profile');

    await act(async () => setSession(null));

    expect(router.getPathname()).toBe('/sign-in');
  });

  it('al iniciar sesión entra a las pestañas sin navegar a mano', async () => {
    const { router } = await open('/sign-in', null);

    await act(async () => setSession(testSession));

    expect(router.getPathname()).toBe('/');
  });

  it('sin sesión no se puede abrir una pantalla protegida por URL', async () => {
    const { router } = await open('/create-post', null);

    expect(router.getPathname()).toBe('/sign-in');
  });
});

describe('deep link', () => {
  // +native-intent reescribe instagramclone://post/{id} a esta ruta (ver incoming-link.ts).
  it('abre la publicación dentro de la pestaña Inicio', async () => {
    const { router } = await open(resolveIncomingLink('instagramclone://post/abc-123'), testSession);

    expect(router.getPathname()).toBe('/post/abc-123');
    expect(router.getSegments()).toEqual(['(tabs)', '(home)', 'post', '[id]']);
  });

  it('espera a conocer la sesión en vez de rebotar al login', async () => {
    const router = renderRouter('src/app', { initialUrl: '/story/user-9' });
    await router;
    // Todavía cargando: no se ha decidido ninguna pantalla.
    await act(async () => setSession(testSession));

    expect(router.getPathname()).toBe('/story/user-9');
  });
});
