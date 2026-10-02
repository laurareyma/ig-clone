import type { ChangeNotifier } from '@/data/local/change-notifier';
import type { SqlDatabase } from '@/data/local/sql-database';
import { markStorySeen, readStories, replaceStories } from '@/data/local/story-store';
import { watchQuery } from '@/data/local/watch-query';
import type { PostImageUploader } from '@/data/remote/post-image-uploader';
import type { StoryRemoteSource } from '@/data/remote/story-source';
import type { StoryGroup } from '@/domain/entities';
import type { LocalImage } from '@/domain/repositories/post-repository';
import type { StoryRepository } from '@/domain/repositories/story-repository';
import { groupStories } from '@/domain/story-groups';

export class OfflineFirstStoryRepository implements StoryRepository {
  constructor(
    private readonly getDb: () => Promise<SqlDatabase>,
    private readonly remote: StoryRemoteSource,
    private readonly uploader: PostImageUploader,
    private readonly changes: ChangeNotifier,
    private readonly newId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  watchGroups(listener: (groups: StoryGroup[]) => void): () => void {
    return watchQuery(
      this.changes,
      ['stories'],
      async () => {
        const [stories, me] = await Promise.all([
          readStories(await this.getDb()),
          this.remote.currentUserId(),
        ]);
        // La caducidad se comprueba en cada lectura, con la hora de ese momento.
        return groupStories(stories, this.now(), me);
      },
      listener,
    );
  }

  async refresh(): Promise<void> {
    const stories = await this.remote.fetchStories();
    const db = await this.getDb();

    await db.withTransactionAsync((tx) => replaceStories(tx, stories));
    this.changes.notify('stories');
  }

  async markSeen(storyId: string): Promise<void> {
    const marked = await markStorySeen(await this.getDb(), storyId, this.now().getTime());
    if (marked) this.changes.notify('stories');
  }

  async create(image: LocalImage): Promise<void> {
    const userId = await this.remote.currentUserId();
    const id = this.newId();
    // Dentro de la carpeta del usuario, como exige la política de Storage.
    const imagePath = `${userId}/stories/${id}.jpg`;

    await this.uploader.upload(image, imagePath);
    try {
      await this.remote.insertStory({ id, imagePath });
    } catch (error) {
      await this.uploader.remove(imagePath).catch(() => {});
      throw error;
    }

    await this.refresh();
  }
}
