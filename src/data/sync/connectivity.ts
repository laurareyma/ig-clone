export interface Connectivity {
  isOnline(): boolean;
  // Avisa cada vez que cambia el estado de la conexión.
  subscribe(listener: (online: boolean) => void): () => void;
}
