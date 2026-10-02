import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/presentation/components/themed-text';

export function UnreadBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, style]}>
      <ThemedText style={styles.text}>{count > 99 ? '99+' : count}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ed4956',
  },
  text: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
});
