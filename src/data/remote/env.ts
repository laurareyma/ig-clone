export type Env = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

type RawEnv = { [K in keyof Env]: string | undefined };

const names: { [K in keyof Env]: string } = {
  supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
  supabasePublishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
};

// Falla al arrancar con un mensaje claro, en vez de más tarde con un error de red confuso.
export function parseEnv(raw: RawEnv): Env {
  const missing = (Object.keys(names) as (keyof Env)[]).filter((key) => !raw[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.map((key) => names[key]).join(', ')}. ` +
        'Copia .env.example a .env.local, complétalo y reinicia con "npx expo start -c".',
    );
  }

  try {
    new URL(raw.supabaseUrl!);
  } catch {
    throw new Error(`${names.supabaseUrl} no es una URL válida: "${raw.supabaseUrl}".`);
  }

  return {
    supabaseUrl: raw.supabaseUrl!.trim(),
    supabasePublishableKey: raw.supabasePublishableKey!.trim(),
  };
}
