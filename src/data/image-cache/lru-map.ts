// Mapa con capacidad fija y desalojo LRU (Least Recently Used).
//
// Map de JavaScript recuerda el orden de inserción: el primer elemento al iterar es el
// más antiguo. Cada uso borra y reinserta la clave, que pasa al final; así el primero
// es siempre el que lleva más tiempo sin usarse. Todas las operaciones son O(1).
export class LruMap<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error('La capacidad debe ser al menos 1');
  }

  get size(): number {
    return this.entries.size;
  }

  // Consulta sin contar como uso.
  peek(key: K): V | undefined {
    return this.entries.get(key);
  }

  // Consulta y marca la clave como la más reciente.
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;

    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);

    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as K;
      this.entries.delete(oldest);
    }
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
