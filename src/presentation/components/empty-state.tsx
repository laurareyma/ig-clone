import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';
import { Spacing } from '@/presentation/theme';

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <View style={styles.container}>
      {icon}
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  text: {
    textAlign: 'center',
  },
});
