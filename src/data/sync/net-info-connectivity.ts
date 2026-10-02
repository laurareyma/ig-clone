import NetInfo from '@react-native-community/netinfo';

import type { Connectivity } from '@/data/sync/connectivity';

// Estado de la red según el sistema operativo.
export class NetInfoConnectivity implements Connectivity {
  // Hasta que el sistema informa, se supone que hay conexión: si no la hay, el primer
  // envío falla y se reintenta.
  private online = true;
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor() {
    NetInfo.addEventListener((state) => {
      // isConnected es null mientras el estado aún no se conoce.
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      if (online === this.online) return;

      this.online = online;
      this.listeners.forEach((listener) => listener(online));
    });
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}
