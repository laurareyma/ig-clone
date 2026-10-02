type Listener = () => void;

// Avisa a quien esté leyendo una tabla de que cambió, para que repita su consulta.
// Es lo que hace que la UI se actualice sola al escribir en SQLite.
export class ChangeNotifier {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(table: string, listener: Listener): () => void {
    const set = this.listeners.get(table) ?? new Set();
    this.listeners.set(table, set);
    set.add(listener);

    return () => {
      set.delete(listener);
    };
  }

  notify(table: string): void {
    // Copia: un listener puede darse de baja mientras se recorre el conjunto.
    for (const listener of [...(this.listeners.get(table) ?? [])]) listener();
  }
}
