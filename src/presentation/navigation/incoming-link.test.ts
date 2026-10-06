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
    expect(resolveIncomingLink(`${link}?x=1`)).toBe(link);
  });

  describe('parámetros de un enlace externo', () => {
    // Entrada que dispara el decodificado exponencial de decode-uri-component.
    const malicious = '?q=' + '%'.repeat(5000) + '%E0%A4%A';

    it.each([
      [`instagramclone://post/${ID}${malicious}`, `/(tabs)/(home)/post/${ID}`],
      [`instagramclone://user/abc${malicious}`, 'instagramclone://user/abc'],
      [`/explore${malicious}`, '/explore'],
      [`instagramclone://${malicious}`, 'instagramclone://'],
      [`exp://127.0.0.1:8081/--/story/abc#fragmento`, 'exp://127.0.0.1:8081/--/story/abc'],
    ])('se descartan antes de llegar al enrutador: %s', (link, expected) => {
      expect(resolveIncomingLink(link)).toBe(expected);
    });

    it('el enlace de arranque del development build se deja intacto', () => {
      const link = 'exp+instagramclone://expo-development-client/?url=http%3A%2F%2F192.168.1.20%3A8081';

      expect(resolveIncomingLink(link)).toBe(link);
    });
  });

  it.each(['instagramclone://', '/explore', '/story/abc', 'instagramclone://post', '/posts/abc/edit'])(
    'no toca %s',
    (link) => {
      expect(resolveIncomingLink(link)).toBe(link);
    },
  );
});
