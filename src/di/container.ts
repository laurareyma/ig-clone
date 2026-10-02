import { randomUUID } from 'expo-crypto';

import { ExpoImageFiles } from '@/data/image-cache/expo-image-files';
import { TwoLevelImageCache } from '@/data/image-cache/two-level-image-cache';
import { ChangeNotifier } from '@/data/local/change-notifier';
import { clearUserData } from '@/data/local/clear-user-data';
import { getDatabase } from '@/data/local/database';
import { ExpoPostImageUploader } from '@/data/media/expo-post-image-uploader';
import { SupabaseCommentSource } from '@/data/remote/comment-source';
import { SupabasePostSource } from '@/data/remote/post-source';
import { SupabaseProfileSource } from '@/data/remote/profile-source';
import { env, supabase } from '@/data/remote/supabase';
import { OfflineFirstCommentRepository } from '@/data/repositories/offline-first-comment-repository';
import { OfflineFirstPostRepository } from '@/data/repositories/offline-first-post-repository';
import { OfflineFirstProfileRepository } from '@/data/repositories/offline-first-profile-repository';
import { SupabaseAuthRepository } from '@/data/repositories/supabase-auth-repository';
import type { Dependencies } from '@/presentation/dependencies';

// Raíz de composición: el único archivo que conoce a la vez las implementaciones de
// data/ y los contratos que consume presentation/.
const changes = new ChangeNotifier();
const auth = new SupabaseAuthRepository(supabase);
const profileSource = new SupabaseProfileSource(supabase);
const profiles = new OfflineFirstProfileRepository(getDatabase, profileSource, changes);
const posts = new OfflineFirstPostRepository(
  getDatabase,
  new SupabasePostSource(supabase),
  new ExpoPostImageUploader(supabase),
  changes,
  randomUUID,
);
const comments = new OfflineFirstCommentRepository(
  getDatabase,
  new SupabaseCommentSource(supabase),
  profileSource,
  changes,
  randomUUID,
);

const images = new TwoLevelImageCache(
  getDatabase,
  new ExpoImageFiles({
    supabaseUrl: env.supabaseUrl,
    publishableKey: env.supabasePublishableKey,
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  }),
);

// Cubre cualquier forma de quedarse sin sesión: el botón, un token revocado o caducado.
// Las imágenes también se borran: pueden ser de cuentas privadas que seguía ese usuario.
auth.onSessionChange((session) => {
  if (session) return;
  void getDatabase().then((db) => clearUserData(db, changes));
  void images.clear();
});

export const container: Dependencies = { auth, profiles, posts, comments, images };
