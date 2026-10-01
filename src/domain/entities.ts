// Entidades del dominio. No dependen de Supabase, SQLite ni React.

export type FollowStatus = 'pending' | 'accepted';

export type Profile = {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
};

export type Post = {
  id: string;
  authorId: string;
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
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
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
