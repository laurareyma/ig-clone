import { StyleSheet } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { Spacing } from '@/presentation/theme';

export function OfflineBanner() {
  return (
    <ThemedView type="backgroundElement" style={styles.banner} accessibilityRole="alert">
      <ThemedText type="small" themeColor="textSecondary">
        Sin conexión. Mostrando lo guardado en el dispositivo.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    padding: Spacing.two,
  },
});
