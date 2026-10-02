import type { Unsubscribe } from '@/domain/repositories/auth-repository';

export type SyncStatus = {
  online: boolean;
  // Acciones del usuario guardadas en el dispositivo que el servidor aún no ha recibido.
  pendingCount: number;
};

export interface SyncMonitor {
  watchStatus(listener: (status: SyncStatus) => void): Unsubscribe;
}
