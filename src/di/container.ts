import { ChangeNotifier } from '@/data/local/change-notifier';
import { clearUserData } from '@/data/local/clear-user-data';
import { getDatabase } from '@/data/local/database';
import { SupabaseProfileSource } from '@/data/remote/profile-remote-source';
import { supabase } from '@/data/remote/supabase';
import { OfflineFirstProfileRepository } from '@/data/repositories/offline-first-profile-repository';
import { SupabaseAuthRepository } from '@/data/repositories/supabase-auth-repository';
import type { Dependencies } from '@/presentation/dependencies';

// Raíz de composición: el único archivo que conoce a la vez las implementaciones de
// data/ y los contratos que consume presentation/.
const changes = new ChangeNotifier();
const auth = new SupabaseAuthRepository(supabase);
const profiles = new OfflineFirstProfileRepository(
  getDatabase,
  new SupabaseProfileSource(supabase),
  changes,
);

// Cubre cualquier forma de quedarse sin sesión: el botón, un token revocado o caducado.
auth.onSessionChange((session) => {
  if (!session) void getDatabase().then((db) => clearUserData(db, changes));
});

export const container: Dependencies = { auth, profiles };
