import { parseEnv } from '@/data/remote/env';

const valid = {
  supabaseUrl: 'https://abc.supabase.co',
  supabasePublishableKey: 'sb_publishable_123',
};

describe('parseEnv', () => {
  it('devuelve los valores cuando están completos', () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it('quita espacios sobrantes', () => {
    expect(parseEnv({ ...valid, supabasePublishableKey: ' sb_publishable_123\n' })).toEqual(valid);
  });

  it('nombra todas las variables que faltan', () => {
    expect(() => parseEnv({ supabaseUrl: undefined, supabasePublishableKey: '  ' })).toThrow(
      'EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  });

  it('rechaza una URL mal formada', () => {
    expect(() => parseEnv({ ...valid, supabaseUrl: 'abc.supabase.co' })).toThrow(
      'no es una URL válida',
    );
  });
});
