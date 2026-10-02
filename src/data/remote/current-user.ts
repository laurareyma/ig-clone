import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/data/remote/database.types';

export type Client = SupabaseClient<Database>;

// Lee la sesión guardada, sin ir a la red. Las escrituras llevan este id (author_id,
// user_id...) y la RLS comprueba en el servidor que coincide con el token.
export async function currentUserId(client: Client): Promise<string> {
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('No hay sesión abierta');
  return userId;
}
