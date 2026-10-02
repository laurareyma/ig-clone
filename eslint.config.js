// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// Regla de dependencias de la arquitectura: app → presentation → domain ← data.
// Solo src/di (la raíz de composición) puede importar de todas las capas.
const forbid = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "src/data/remote/database.types.ts"],
  },
  {
    files: ['src/domain/**'],
    rules: forbid([
      {
        group: ['@/data/**', '@/presentation/**', '@/di/**', '@/app/**'],
        message: 'El dominio no depende de ninguna otra capa.',
      },
      {
        group: ['react', 'react-native', 'expo', 'expo-*', '@supabase/*'],
        message: 'El dominio no depende de frameworks ni de librerías de infraestructura.',
      },
    ]),
  },
  {
    files: ['src/data/**'],
    rules: forbid([
      {
        group: ['@/presentation/**', '@/di/**', '@/app/**'],
        message: 'La capa de datos solo puede depender del dominio.',
      },
    ]),
  },
  {
    files: ['src/presentation/**', 'src/app/**'],
    ignores: ['src/app/_layout.tsx'],
    rules: forbid([
      {
        group: ['@/data/**', '@/di/**', '@supabase/*', 'expo-sqlite', 'expo-sqlite/*'],
        message: 'La UI usa los contratos del dominio a través de useDependencies().',
      },
    ]),
  },
]);
