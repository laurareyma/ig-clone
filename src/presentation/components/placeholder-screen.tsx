import { Link, Stack, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { Spacing } from '@/presentation/theme';

type Props = {
  title: string;
  detail?: string;
  link?: { href: Href; label: string };
};

// Pantalla temporal para probar la navegación; se reemplaza al construir cada módulo.
export function PlaceholderScreen({ title, detail, link }: Props) {
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title }} />
      <ThemedText type="subtitle">{title}</ThemedText>
      {detail && <ThemedText themeColor="textSecondary">{detail}</ThemedText>}
      {link && (
        <Link href={link.href}>
          <ThemedText type="linkPrimary">{link.label}</ThemedText>
        </Link>
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
