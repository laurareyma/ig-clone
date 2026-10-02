import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { ProfileDetails } from '@/domain/entities';
import { canViewContent } from '@/domain/profile-visibility';
import { Avatar } from '@/presentation/components/avatar';
import { Button } from '@/presentation/components/button';
import { EmptyState } from '@/presentation/components/empty-state';
import { Icon } from '@/presentation/components/icon';
import { PostGrid } from '@/presentation/components/post-grid';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useDependencies } from '@/presentation/dependencies';
import { formatCount } from '@/presentation/format/relative-time';
import { useFeed } from '@/presentation/hooks/use-feed';
import { useProfileDetails } from '@/presentation/hooks/use-profile-details';
import { useTheme } from '@/presentation/hooks/use-theme';
import { useCurrentUserId } from '@/presentation/session/session-provider';
import { Spacing } from '@/presentation/theme';

const followLabels = { none: 'Seguir', pending: 'Solicitado', accepted: 'Siguiendo' } as const;

function Stat({ count, label }: { count: number; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold">{formatCount(count)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function ProfileHeader({ details, onChanged }: { details: ProfileDetails; onChanged: () => void }) {
  const { auth, profiles } = useDependencies();
  const [busy, setBusy] = useState(false);
  const { profile, followStatus } = details;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      // Seguir o cambiar la privacidad cambia qué publicaciones se pueden ver.
      onChanged();
    } catch {
      Alert.alert('No se pudo completar la acción', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const followsLink = (kind: 'followers' | 'following') =>
    ({ pathname: '/follows/[userId]', params: { userId: profile.id, kind } }) as const;

  return (
    <View style={styles.header}>
      <View style={styles.top}>
        <Avatar profile={profile} size={80} />
        <Stat count={details.postsCount} label="Publicaciones" />
        <Link href={followsLink('followers')} asChild>
          <Pressable accessibilityRole="link">
            <Stat count={details.followersCount} label="Seguidores" />
          </Pressable>
        </Link>
        <Link href={followsLink('following')} asChild>
          <Pressable accessibilityRole="link">
            <Stat count={details.followingCount} label="Seguidos" />
          </Pressable>
        </Link>
      </View>

      {profile.fullName && <ThemedText type="smallBold">{profile.fullName}</ThemedText>}
      {profile.bio && <ThemedText type="small">{profile.bio}</ThemedText>}

      {followStatus === 'self' ? (
        <>
          <View style={styles.setting}>
            <ThemedText type="small">Cuenta privada</ThemedText>
            <Switch
              value={profile.isPrivate}
              disabled={busy}
              onValueChange={(value) => run(() => profiles.setPrivate(value))}
              accessibilityLabel="Cuenta privada"
            />
          </View>
          <Button label="Cerrar sesión" variant="secondary" onPress={() => void auth.signOut()} />
        </>
      ) : (
        <Button
          label={followLabels[followStatus]}
          variant={followStatus === 'none' ? 'primary' : 'secondary'}
          loading={busy}
          onPress={() =>
            run(() =>
              // Pulsar "Solicitado" cancela la solicitud; "Siguiendo" deja de seguir.
              followStatus === 'none' ? profiles.follow(profile.id) : profiles.unfollow(profile.id),
            )
          }
        />
      )}
    </View>
  );
}

export function ProfileScreen({ userId }: { userId: string }) {
  const theme = useTheme();
  const details = useProfileDetails(userId);
  const feed = useFeed('author', userId);
  const { profiles } = useDependencies();

  if (!details) {
    return (
      <ThemedView style={styles.fill}>
        <Stack.Screen options={{ title: 'Perfil' }} />
        {details === undefined ? (
          <ActivityIndicator style={styles.fill} />
        ) : (
          <EmptyState message="Este perfil no existe." />
        )}
      </ThemedView>
    );
  }

  // Solo decide qué mensaje mostrar. Si no se puede ver, el servidor tampoco devuelve
  // publicaciones: la lista llega vacía.
  const visible = canViewContent(details);

  function refresh() {
    profiles.refreshDetails(userId).catch(() => {});
    void feed.refresh();
  }

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: details.profile.username }} />
      <PostGrid
        posts={visible ? (feed.posts ?? []) : []}
        header={<ProfileHeader details={details} onChanged={() => void feed.refresh()} />}
        empty={
          visible ? (
            <EmptyState message="Aún no hay publicaciones." />
          ) : (
            <EmptyState
              icon={<Icon name="lock" size={40} color={theme.textSecondary} />}
              message="Esta cuenta es privada. Síguela para ver sus publicaciones."
            />
          )
        }
        refreshing={feed.refreshing}
        loadingMore={feed.loadingMore}
        onRefresh={refresh}
        onEndReached={feed.loadMore}
      />
    </ThemedView>
  );
}

// Pestaña Perfil: el perfil del usuario con sesión abierta.
export function OwnProfileScreen() {
  return <ProfileScreen userId={useCurrentUserId()} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
  },
  stat: {
    alignItems: 'center',
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
});
