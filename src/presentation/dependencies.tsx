import { createContext, use, type PropsWithChildren } from 'react';

import type { AuthRepository } from '@/domain/repositories/auth-repository';
import type { ImageCache } from '@/domain/repositories/image-cache';
import type { ProfileRepository } from '@/domain/repositories/profile-repository';

// La UI solo conoce los contratos del dominio. Las implementaciones concretas las
// entrega src/di/container.ts desde el layout raíz, y las pruebas pueden pasar otras.
export type Dependencies = {
  auth: AuthRepository;
  profiles: ProfileRepository;
  images: ImageCache;
};

const DependenciesContext = createContext<Dependencies | null>(null);

export function DependenciesProvider({
  value,
  children,
}: PropsWithChildren<{ value: Dependencies }>) {
  return <DependenciesContext value={value}>{children}</DependenciesContext>;
}

export function useDependencies(): Dependencies {
  const value = use(DependenciesContext);
  if (!value) throw new Error('useDependencies debe usarse dentro de <DependenciesProvider>');
  return value;
}
