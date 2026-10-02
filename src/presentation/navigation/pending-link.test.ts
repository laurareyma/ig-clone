import {
  rememberIncomingLink,
  resetPendingLink,
  sessionChanged,
} from '@/presentation/navigation/pending-link';

const link = '/(tabs)/(home)/post/abc';

beforeEach(resetPendingLink);

describe('enlace pendiente', () => {
  it('app cerrada y sin sesión: el enlace se retoma al iniciar sesión', () => {
    rememberIncomingLink(link);
    expect(sessionChanged(false)).toBeNull();

    expect(sessionChanged(true)).toBe(link);
  });

  it('solo se retoma una vez', () => {
    rememberIncomingLink(link);
    sessionChanged(false);
    sessionChanged(true);
    sessionChanged(false);

    expect(sessionChanged(true)).toBeNull();
  });

  it('app cerrada con sesión guardada: el enrutador ya lo abrió, no se repite', () => {
    rememberIncomingLink(link);

    expect(sessionChanged(true)).toBeNull();
  });

  it('app abierta sin sesión: el enlace que llega se retoma al entrar', () => {
    sessionChanged(false);
    rememberIncomingLink(link);

    expect(sessionChanged(true)).toBe(link);
  });

  it('app abierta con sesión: no se guarda nada para más tarde', () => {
    sessionChanged(true);
    rememberIncomingLink(link);
    sessionChanged(false);

    expect(sessionChanged(true)).toBeNull();
  });

  it('si llegan varios sin sesión, vale el último', () => {
    sessionChanged(false);
    rememberIncomingLink('/(tabs)/(home)/post/uno');
    rememberIncomingLink('/(tabs)/(home)/post/dos');

    expect(sessionChanged(true)).toBe('/(tabs)/(home)/post/dos');
  });

  it.each(['', '/', 'instagramclone://', 'instagramclone:///'])(
    'abrir la app sin destino ("%s") no cuenta como enlace',
    (path) => {
      rememberIncomingLink(path);
      sessionChanged(false);

      expect(sessionChanged(true)).toBeNull();
    },
  );
});
