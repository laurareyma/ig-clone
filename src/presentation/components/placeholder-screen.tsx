import { Link, Stack, router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { Spacing } from '@/presentation/theme';

type Props = {
  title: string;
  detail?: string;
  links?: { href: Href; label: string }[];
  // Para modales a pantalla completa, que no tienen cabecera ni gesto para cerrarse.
  closable?: boolean;
};

// Pantalla temporal para probar la navegación; se reemplaza al construir cada módulo.
export function PlaceholderScreen({ title, detail, links, closable }: Props) {
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title }} />
      <ThemedText type="subtitle">{title}</ThemedText>
      {detail && <ThemedText themeColor="textSecondary">{detail}</ThemedText>}
      {links?.map((link) => (
        <Link key={link.label} href={link.href}>
          <ThemedText type="linkPrimary">{link.label}</ThemedText>
        </Link>
      ))}
      {closable && (
        <Pressable onPress={() => router.back()}>
          <ThemedText type="linkPrimary">Cerrar</ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
});
