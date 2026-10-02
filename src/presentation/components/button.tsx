import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';
import { useTheme } from '@/presentation/hooks/use-theme';
import { Spacing } from '@/presentation/theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

const PRIMARY = '#3c87f7';

export function Button({ label, onPress, loading = false, variant = 'primary' }: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? PRIMARY : theme.backgroundElement },
        (pressed || loading) && styles.dimmed,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? '#ffffff' : theme.text} />
      ) : (
        <ThemedText type="smallBold" style={primary && styles.primaryLabel}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  dimmed: {
    opacity: 0.6,
  },
  primaryLabel: {
    color: '#ffffff',
  },
});
