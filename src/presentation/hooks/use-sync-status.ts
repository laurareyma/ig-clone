import { useEffect, useState } from 'react';

import type { SyncStatus } from '@/domain/repositories/sync-monitor';
import { useDependencies } from '@/presentation/dependencies';

export function useSyncStatus(): SyncStatus {
  const { sync } = useDependencies();
  const [status, setStatus] = useState<SyncStatus>({ online: true, pendingCount: 0 });

  useEffect(() => sync.watchStatus(setStatus), [sync]);

  return status;
}
