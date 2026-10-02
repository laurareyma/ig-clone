import type { ChangeNotifier } from '@/data/local/change-notifier';

// Consulta "viva": ejecuta la lectura, entrega el resultado y la repite cada vez que
// cambia alguna de las tablas indicadas. Es la base de todos los watch() de los
// repositorios.
export function watchQuery<T>(
  changes: ChangeNotifier,
  tables: string[],
  read: () => Promise<T>,
  listener: (value: T) => void,
): () => void {
  let active = true;
  let lastRead = 0;

  const run = async () => {
    const thisRead = ++lastRead;
    const value = await read();
    // Si mientras tanto empezó otra lectura, esta ya es vieja y no debe pisarla.
    if (active && thisRead === lastRead) listener(value);
  };

  void run();
  const unsubscribes = tables.map((table) => changes.subscribe(table, () => void run()));

  return () => {
    active = false;
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}
