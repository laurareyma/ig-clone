import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/presentation/components/button';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useDependencies } from '@/presentation/dependencies';
import { useProfile } from '@/presentation/hooks/use-profile';
import { useCurrentUserId } from '@/presentation/session/session-provider';
import { Spacing } from '@/presentation/theme';

export function ProfileScreen() {
  const { auth } = useDependencies();
  const profile = useProfile(useCurrentUserId());
  const [signingOut, setSigningOut] = useState(false);

  function signOut() {
    setSigningOut(true);
    // Al terminar, el layout raíz desmonta esta pantalla y muestra el inicio de sesión.
    void auth.signOut();
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: profile?.username ?? 'Perfil' }} />
      {profile ? (
        <>
          <ThemedText type="subtitle">@{profile.username}</ThemedText>
          {profile.fullName && <ThemedText>{profile.fullName}</ThemedText>}
          {profile.bio && <ThemedText themeColor="textSecondary">{profile.bio}</ThemedText>}
          <ThemedText type="small" themeColor="textSecondary">
            {profile.isPrivate ? 'Cuenta privada' : 'Cuenta pública'}
          </ThemedText>
        </>
      ) : (
        // Primera vez en este dispositivo: aún no hay copia local del perfil.
        <ActivityIndicator />
      )}
      <Button label="Cerrar sesión" variant="secondary" onPress={signOut} loading={signingOut} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
