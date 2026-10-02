import { useEffect, useState } from 'react';

import type { StoryGroup } from '@/domain/entities';
import { useDependencies } from '@/presentation/dependencies';

export function useStoryGroups() {
  const { stories } = useDependencies();
  // undefined = todavía no se ha leído la base local.
  const [groups, setGroups] = useState<StoryGroup[]>();

  useEffect(() => {
    const unsubscribe = stories.watchGroups(setGroups);
    stories.refresh().catch(() => {});
    return unsubscribe;
  }, [stories]);

  return { groups, refresh: () => stories.refresh().catch(() => {}) };
}
