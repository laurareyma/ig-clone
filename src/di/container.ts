import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

import { ExpoImageFiles } from '@/data/image-cache/expo-image-files';
import { TwoLevelImageCache } from '@/data/image-cache/two-level-image-cache';
import { ChangeNotifier } from '@/data/local/change-notifier';
import { clearUserData } from '@/data/local/clear-user-data';
import { getDatabase } from '@/data/local/database';
import { ExpoPostImageUploader } from '@/data/media/expo-post-image-uploader';
import { SupabaseCommentSource } from '@/data/remote/comment-source';
import { SupabaseMessageSource } from '@/data/remote/message-source';
import { SupabasePostSource } from '@/data/remote/post-source';
import { SupabaseProfileSource } from '@/data/remote/profile-source';
import { SupabaseStorySource } from '@/data/remote/story-source';
import { env, supabase } from '@/data/remote/supabase';
import { OfflineFirstCommentRepository } from '@/data/repositories/offline-first-comment-repository';
import { OfflineFirstMessageRepository } from '@/data/repositories/offline-first-message-repository';
import { OfflineFirstPostRepository } from '@/data/repositories/offline-first-post-repository';
import { OfflineFirstStoryRepository } from '@/data/repositories/offline-first-story-repository';
import { OfflineFirstProfileRepository } from '@/data/repositories/offline-first-profile-repository';
import { SupabaseAuthRepository } from '@/data/repositories/supabase-auth-repository';
import { NetInfoConnectivity } from '@/data/sync/net-info-connectivity';
import { Outbox } from '@/data/sync/outbox';
import type { Dependencies } from '@/presentation/dependencies';

// Raíz de composición: el único archivo que conoce a la vez las implementaciones de
// data/ y los contratos que consume presentation/.
const changes = new ChangeNotifier();
const outbox = new Outbox(getDatabase, changes, new NetInfoConnectivity());
const auth = new SupabaseAuthRepository(supabase);
const profileSource = new SupabaseProfileSource(supabase);
const profiles = new OfflineFirstProfileRepository(getDatabase, profileSource, changes);
const uploader = new ExpoPostImageUploader(supabase);
const posts = new OfflineFirstPostRepository(
  getDatabase,
  new SupabasePostSource(supabase),
  uploader,
  changes,
  outbox,
  randomUUID,
);
const comments = new OfflineFirstCommentRepository(
  getDatabase,
  new SupabaseCommentSource(supabase),
  profileSource,
  changes,
  outbox,
  randomUUID,
);
const messages = new OfflineFirstMessageRepository(
  getDatabase,
  new SupabaseMessageSource(supabase),
  changes,
  outbox,
  randomUUID,
);
const stories = new OfflineFirstStoryRepository(
  getDatabase,
  new SupabaseStorySource(supabase),
  uploader,
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

// La cola envía lo pendiente al arrancar, al recuperar la conexión y cada vez que la app
// vuelve a primer plano (el sistema pudo suspenderla con operaciones a medias).
outbox.start();
AppState.addEventListener('change', (state) => {
  if (state === 'active') void outbox.resume();
});

export const container: Dependencies = {
  auth,
  profiles,
  posts,
  comments,
  messages,
  stories,
  images,
  sync: outbox,
};
