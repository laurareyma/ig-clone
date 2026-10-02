import { resolveIncomingLink } from '@/presentation/navigation/incoming-link';

const ID = '3f2b8c1e-9d4a-4c61-8f0e-2b7a5d9c1e44';

describe('resolveIncomingLink', () => {
  it.each([
    [`instagramclone://post/${ID}`, 'esquema propio'],
    [`/post/${ID}`, 'ruta'],
    [`post/${ID}`, 'ruta sin barra inicial'],
    [`exp://127.0.0.1:8081/--/post/${ID}`, 'Expo Go'],
    [`instagramclone://post/${ID}/`, 'barra final'],
    [`instagramclone://post/${ID}?ref=share`, 'con parámetros'],
  ])('%s (%s) abre el post en la pestaña Inicio', (link) => {
    expect(resolveIncomingLink(link)).toBe(`/(tabs)/(home)/post/${ID}`);
  });

  it('respeta un enlace que ya indica la pestaña', () => {
    const link = `/(tabs)/(explore)/post/${ID}`;

    expect(resolveIncomingLink(link)).toBe(link);
  });

  it.each(['instagramclone://', '/explore', '/story/abc', 'instagramclone://post', '/posts/abc/edit'])(
    'no toca %s',
    (link) => {
      expect(resolveIncomingLink(link)).toBe(link);
    },
  );
});
