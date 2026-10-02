import { LruMap } from '@/data/image-cache/lru-map';

describe('LruMap', () => {
  it('al llenarse desaloja la clave que lleva más tiempo sin usarse', () => {
    const lru = new LruMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);

    lru.set('c', 3);

    expect(lru.peek('a')).toBeUndefined();
    expect(lru.peek('b')).toBe(2);
    expect(lru.peek('c')).toBe(3);
  });

  it('get cuenta como uso y salva la clave del desalojo', () => {
    const lru = new LruMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);

    lru.get('a');
    lru.set('c', 3);

    expect(lru.peek('a')).toBe(1);
    expect(lru.peek('b')).toBeUndefined();
  });

  it('peek no cuenta como uso', () => {
    const lru = new LruMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);

    lru.peek('a');
    lru.set('c', 3);

    expect(lru.peek('a')).toBeUndefined();
  });

  it('volver a guardar una clave la actualiza sin ocupar otro hueco', () => {
    const lru = new LruMap<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);

    lru.set('a', 10);

    expect(lru.size).toBe(2);
    expect(lru.peek('a')).toBe(10);

    lru.set('c', 3);
    expect(lru.peek('b')).toBeUndefined();
  });

  it('nunca supera la capacidad', () => {
    const lru = new LruMap<number, number>(3);

    for (let i = 0; i < 100; i++) lru.set(i, i);

    expect(lru.size).toBe(3);
    expect([97, 98, 99].map((key) => lru.peek(key))).toEqual([97, 98, 99]);
  });

  it('rechaza una capacidad no válida', () => {
    expect(() => new LruMap(0)).toThrow();
  });
});
