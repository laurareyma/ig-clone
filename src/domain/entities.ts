// Entidades del dominio. No dependen de Supabase, SQLite ni React.

export type Session = {
  userId: string;
  email: string | null;
};

export type Profile = {
  id: string;
  username: string;
  fullName: string | null;
  // Ruta en el bucket avatars.
  avatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
};

// Relación del usuario actual con otro perfil.
export type FollowStatus = 'self' | 'none' | 'pending' | 'accepted';

export type ProfileDetails = {
  profile: Profile;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  followStatus: FollowStatus;
};

export type Post = {
  id: string;
  author: Profile;
  // Ruta en el bucket media.
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  caption: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  author: Profile;
  parentId: string | null;
  body: string;
  createdAt: string;
  // Guardado en el dispositivo pero aún no confirmado por el servidor.
  pending: boolean;
};

export type Story = {
  id: string;
  authorId: string;
  imagePath: string;
  createdAt: string;
  expiresAt: string;
};

export type Conversation = {
  id: string;
  otherUserId: string;
  lastMessageAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};
