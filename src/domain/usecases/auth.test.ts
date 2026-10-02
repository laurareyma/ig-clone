import { AuthError } from '@/domain/errors';
import type { AuthRepository } from '@/domain/repositories/auth-repository';
import { signIn, signUp } from '@/domain/usecases/auth';

function fakeAuth(overrides: Partial<AuthRepository> = {}) {
  return {
    onSessionChange: jest.fn(() => () => {}),
    signIn: jest.fn(async () => {}),
    signUp: jest.fn(async () => ({ needsEmailConfirmation: false })),
    signOut: jest.fn(async () => {}),
    isUsernameAvailable: jest.fn(async () => true),
    ...overrides,
  } satisfies AuthRepository;
}

const valid = { email: 'ana@example.com', password: 'secreto123', username: 'ana.lopez' };

async function codeOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(AuthError);
  return (error as AuthError).code;
}

describe('signUp', () => {
  it('normaliza correo y usuario antes de registrar', async () => {
    const auth = fakeAuth();

    await signUp(auth, { ...valid, email: '  Ana@Example.com ', username: ' Ana.Lopez ' });

    expect(auth.isUsernameAvailable).toHaveBeenCalledWith('ana.lopez');
    expect(auth.signUp).toHaveBeenCalledWith(valid);
  });

  it.each([
    ['ab', 'demasiado corto'],
    ['ana lopez', 'con espacios'],
    ['ana-lopez', 'con guion'],
    ['a'.repeat(31), 'demasiado largo'],
  ])('rechaza el usuario "%s" (%s) sin llamar al servidor', async (username) => {
    const auth = fakeAuth();

    expect(await codeOf(signUp(auth, { ...valid, username }))).toBe('invalid_username');
    expect(auth.isUsernameAvailable).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('rechaza un correo mal formado', async () => {
    expect(await codeOf(signUp(fakeAuth(), { ...valid, email: 'ana@' }))).toBe('invalid_email');
  });

  it('rechaza una contraseña corta', async () => {
    expect(await codeOf(signUp(fakeAuth(), { ...valid, password: '1234567' }))).toBe(
      'weak_password',
    );
  });

  it('no crea la cuenta si el usuario ya existe', async () => {
    const auth = fakeAuth({ isUsernameAvailable: jest.fn(async () => false) });

    expect(await codeOf(signUp(auth, valid))).toBe('username_taken');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('devuelve si hace falta confirmar el correo', async () => {
    const auth = fakeAuth({ signUp: jest.fn(async () => ({ needsEmailConfirmation: true })) });

    expect(await signUp(auth, valid)).toEqual({ needsEmailConfirmation: true });
  });
});

describe('signIn', () => {
  it('normaliza el correo', async () => {
    const auth = fakeAuth();

    await signIn(auth, { email: ' Ana@Example.com', password: 'secreto123' });

    expect(auth.signIn).toHaveBeenCalledWith('ana@example.com', 'secreto123');
  });

  it('no llama al servidor con datos incompletos', async () => {
    const auth = fakeAuth();

    expect(await codeOf(signIn(auth, { email: 'ana', password: 'x' }))).toBe('invalid_email');
    expect(await codeOf(signIn(auth, { email: valid.email, password: '' }))).toBe(
      'invalid_credentials',
    );
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio', async () => {
    const auth = fakeAuth({
      signIn: jest.fn(async () => {
        throw new AuthError('invalid_credentials');
      }),
    });

    expect(await codeOf(signIn(auth, valid))).toBe('invalid_credentials');
  });
});
