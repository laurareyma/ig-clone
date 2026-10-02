import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Profile } from '@/domain/entities';
import { Avatar } from '@/presentation/components/avatar';
import { ThemedText } from '@/presentation/components/themed-text';
import { Spacing } from '@/presentation/theme';

// Fila de usuario para búsquedas, solicitudes y listas de seguidores. `children` son
// las acciones de la derecha.
export function UserRow({ profile, children }: { profile: Profile; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Link href={{ pathname: '/user/[id]', params: { id: profile.id } }} asChild>
        <Pressable style={styles.identity} accessibilityRole="link">
          <Avatar profile={profile} size={44} />
          <View style={styles.names}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {profile.username}
            </ThemedText>
            {profile.fullName && (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {profile.fullName}
              </ThemedText>
            )}
          </View>
        </Pressable>
      </Link>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  names: {
    flex: 1,
  },
});
