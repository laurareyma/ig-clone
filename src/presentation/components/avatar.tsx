import { StyleSheet, View } from 'react-native';

import type { Profile } from '@/domain/entities';
import { CachedImage } from '@/presentation/components/cached-image';
import { ThemedText } from '@/presentation/components/themed-text';
import { useTheme } from '@/presentation/hooks/use-theme';

type Props = {
  profile: Pick<Profile, 'username' | 'avatarUrl'>;
  size?: number;
};

export function Avatar({ profile, size = 36 }: Props) {
  const theme = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (profile.avatarUrl) {
    return (
      <CachedImage
        image={{ bucket: 'avatars', path: profile.avatarUrl }}
        aspectRatio={1}
        style={[styles.clip, shape]}
        accessibilityLabel={`Foto de perfil de ${profile.username}`}
      />
    );
  }

  // Sin foto: la inicial del usuario.
  return (
    <View style={[styles.placeholder, shape, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText style={{ fontSize: size * 0.42, lineHeight: size * 0.56 }}>
        {profile.username.charAt(0).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
