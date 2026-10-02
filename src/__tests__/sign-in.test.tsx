import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { AuthError } from '@/domain/errors';
import type { createFakeDependencies } from '@/testing/fake-dependencies';

jest.mock('@/di/container', () => {
  const fake = jest.requireActual('@/testing/fake-dependencies').createFakeDependencies();
  return { container: fake };
});

const { auth, setSession, resetSession } = jest.requireMock('@/di/container')
  .container as ReturnType<typeof createFakeDependencies>;

beforeEach(resetSession);
afterEach(() => jest.restoreAllMocks());

async function openSignIn() {
  const router = renderRouter('src/app', { initialUrl: '/sign-in' });
  await router;
  await act(async () => setSession(null));
  return { router };
}

async function fillAndSubmit(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Correo'), email);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
}

describe('pantalla de inicio de sesión', () => {
  it('con credenciales correctas entra a la app', async () => {
    const signIn = jest.spyOn(auth, 'signIn');
    const { router } = await openSignIn();

    await fillAndSubmit(' Ana@Example.com ', 'secreto123');

    expect(signIn).toHaveBeenCalledWith('ana@example.com', 'secreto123');
    expect(router.getPathname()).toBe('/');
  });

  it('muestra el error del servidor y se queda en la pantalla', async () => {
    jest.spyOn(auth, 'signIn').mockRejectedValue(new AuthError('invalid_credentials'));
    const { router } = await openSignIn();

    await fillAndSubmit('ana@example.com', 'incorrecta');

    expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy();
    expect(router.getPathname()).toBe('/sign-in');
  });

  it('valida el correo sin llamar al servidor', async () => {
    const signIn = jest.spyOn(auth, 'signIn');
    await openSignIn();

    await fillAndSubmit('ana', 'secreto123');

    expect(screen.getByText('Escribe un correo válido.')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });
});
