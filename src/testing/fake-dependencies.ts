import type {
  Comment,
  Conversation,
  Message,
  Post,
  Profile,
  ProfileDetails,
  Session,
  StoryGroup,
} from '@/domain/entities';
import type { AuthRepository } from '@/domain/repositories/auth-repository';
import type { CommentRepository } from '@/domain/repositories/comment-repository';
import type { ImageCache } from '@/domain/repositories/image-cache';
import type { MessageRepository } from '@/domain/repositories/message-repository';
import { feedKey, type PostRepository } from '@/domain/repositories/post-repository';
import type { ProfileRepository } from '@/domain/repositories/profile-repository';
import type { StoryRepository } from '@/domain/repositories/story-repository';
import type { SyncMonitor, SyncStatus } from '@/domain/repositories/sync-monitor';

export const testSession: Session = { userId: 'user-1', email: 'ana@example.com' };

export const testProfile: Profile = {
  id: 'user-1',
  username: 'ana',
  fullName: 'Ana López',
  avatarUrl: null,
  bio: null,
  isPrivate: false,
};

// Valor observable mínimo: lo que guardaría SQLite, pero en memoria.
function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener(next));
    },
    watch(listener: (value: T) => void) {
      listeners.add(listener);
      listener(value);
      return () => void listeners.delete(listener);
    },
  };
}

// Repositorios en memoria para probar la UI sin Supabase ni SQLite. Las pruebas cambian
// los datos con `data` y espían los métodos con jest.spyOn.
export function createFakeDependencies() {
  let session: Session | null | undefined;
  const sessionListeners = new Set<(session: Session | null) => void>();

  // Una lista por clave de feed: 'home', 'explore' o 'author:{id}'.
  const feeds = new Map<string, ReturnType<typeof observable<Post[]>>>();
  const feed = (key: string) => {
    if (!feeds.has(key)) feeds.set(key, observable<Post[]>([]));
    return feeds.get(key)!;
  };

  const data = {
    feed,
    resetFeeds: () => feeds.forEach((list) => list.set([])),
    post: observable<Post | null>(null),
    comments: observable<Comment[]>([]),
    details: observable<ProfileDetails | null>({
      profile: testProfile,
      postsCount: 0,
      followersCount: 0,
      followingCount: 0,
      followStatus: 'self',
    }),
    inbox: observable<Conversation[]>([]),
    conversation: observable<Conversation | null>(null),
    messages: observable<Message[]>([]),
    // La prueba lo llama para simular que el otro escribe.
    receiveTyping: (_typing: boolean) => {},
    storyGroups: observable<StoryGroup[]>([]),
    syncStatus: observable<SyncStatus>({ online: true, pendingCount: 0 }),
    followRequests: [] as Profile[],
    searchResults: [] as Profile[],
  };

  // Simula lo que hace Supabase al leer la sesión guardada o al cambiarla.
  const setSession = (next: Session | null) => {
    session = next;
    sessionListeners.forEach((listener) => listener(next));
  };

  const auth: AuthRepository = {
    onSessionChange(listener) {
      sessionListeners.add(listener);
      if (session !== undefined) listener(session);
      return () => sessionListeners.delete(listener);
    },
    signIn: async () => setSession(testSession),
    signUp: async () => {
      setSession(testSession);
      return { needsEmailConfirmation: false };
    },
    signOut: async () => setSession(null),
    isUsernameAvailable: async () => true,
  };

  const profiles: ProfileRepository = {
    watch(_userId, listener) {
      listener(testProfile);
      return () => {};
    },
    refresh: async () => {},
    // Solo responde por el perfil cargado en `data.details`; cualquier otro no existe.
    watchDetails: (userId, listener) =>
      data.details.watch((details) => listener(details?.profile.id === userId ? details : null)),
    refreshDetails: async () => {},
    follow: async () => {},
    unfollow: async () => {},
    setPrivate: async () => {},
    search: async () => data.searchResults,
    listFollowRequests: async () => data.followRequests,
    respondToFollowRequest: async () => {},
    listFollowers: async () => [],
    listFollowing: async () => [],
  };

  const posts: PostRepository = {
    watchFeed: (target, listener) => data.feed(feedKey(target)).watch(listener),
    refreshFeed: async () => ({ hasMore: false }),
    loadMoreFeed: async () => ({ hasMore: false }),
    watchPost: (_postId, listener) => data.post.watch(listener),
    refreshPost: async () => {},
    setLiked: async () => {},
    create: async () => {},
  };

  const comments: CommentRepository = {
    watch: (_postId, listener) => data.comments.watch(listener),
    refresh: async () => {},
    add: async () => {},
    subscribe: () => () => {},
  };

  const messages: MessageRepository = {
    watchInbox: (listener) => data.inbox.watch(listener),
    refreshInbox: async () => {},
    watchConversation: (_id, listener) => data.conversation.watch(listener),
    watchMessages: (_id, listener) => data.messages.watch(listener),
    refreshMessages: async () => ({ hasMore: false }),
    loadEarlierMessages: async () => ({ hasMore: false }),
    openConversationWith: async (userId) => `c-${userId}`,
    send: async () => {},
    markRead: async () => {},
    connect: () => () => {},
    joinTyping(_id, onTyping) {
      data.receiveTyping = onTyping;
      return { notifyTyping: () => {}, leave: () => {} };
    },
  };

  const stories: StoryRepository = {
    watchGroups: (listener) => data.storyGroups.watch(listener),
    refresh: async () => {},
    markSeen: async () => {},
    create: async () => {},
  };

  const images: ImageCache = {
    peek: () => null,
    load: () => ({ promise: new Promise(() => {}), cancel: () => {} }),
    clear: async () => {},
  };

  const sync: SyncMonitor = {
    watchStatus: (listener) => data.syncStatus.watch(listener),
  };

  // Vuelve al estado de arranque: todavía no se sabe si hay sesión guardada.
  const resetSession = () => {
    session = undefined;
  };

  return {
    auth,
    profiles,
    posts,
    comments,
    messages,
    stories,
    images,
    sync,
    data,
    setSession,
    resetSession,
  };
}
