import type { StoryGroup } from '@/domain/entities';
import type { Unsubscribe } from '@/domain/repositories/auth-repository';
import type { LocalImage } from '@/domain/repositories/post-repository';

export interface StoryRepository {
  // Historias vigentes guardadas en el dispositivo, agrupadas por autor.
  watchGroups(listener: (groups: StoryGroup[]) => void): Unsubscribe;
  refresh(): Promise<void>;
  // Solo se guarda en el dispositivo: no se envía al servidor.
  markSeen(storyId: string): Promise<void>;
  create(image: LocalImage): Promise<void>;
}
