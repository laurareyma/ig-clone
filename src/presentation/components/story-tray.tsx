import { launchImageLibraryAsync } from 'expo-image-picker';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { StoryGroup } from '@/domain/entities';
import { Avatar } from '@/presentation/components/avatar';
import { Icon } from '@/presentation/components/icon';
import { ThemedText } from '@/presentation/components/themed-text';
import { useDependencies } from '@/presentation/dependencies';
import { useTheme } from '@/presentation/hooks/use-theme';
import { Spacing } from '@/presentation/theme';

const AVATAR = 60;
const UNSEEN_RING = '#d6249f';

function StoryCircle({ group, isOwn }: { group: StoryGroup; isOwn: boolean }) {
  const theme = useTheme();
  const label = isOwn ? 'Tu historia' : group.author.username;

  return (
    <Link href={{ pathname: '/story/[userId]', params: { userId: group.author.id } }} asChild>
      <Pressable
        style={styles.item}
        accessibilityRole="link"
        accessibilityLabel={`Historia de ${group.author.username}${group.allSeen ? ', vista' : ''}`}>
        {/* El anillo de color indica que queda algo sin ver. */}
        <View
          style={[
            styles.ring,
            { borderColor: group.allSeen ? theme.backgroundSelected : UNSEEN_RING },
          ]}>
          <Avatar profile={group.author} size={AVATAR} />
        </View>
        <ThemedText type="code" numberOfLines={1} style={styles.label}>
          {label}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

function AddStory() {
  const { stories } = useDependencies();
  const theme = useTheme();
  const [uploading, setUploading] = useState(false);

  async function add() {
    const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;

    const [asset] = result.assets;
    setUploading(true);
    try {
      await stories.create({ uri: asset.uri, width: asset.width, height: asset.height });
    } catch {
      Alert.alert('No se pudo publicar la historia', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Pressable
      style={styles.item}
      onPress={add}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel="Añadir historia">
      <View style={[styles.ring, styles.add, { borderColor: theme.backgroundSelected }]}>
        {uploading ? <ActivityIndicator /> : <Icon name="add" />}
      </View>
      <ThemedText type="code" numberOfLines={1} style={styles.label}>
        Añadir
      </ThemedText>
    </Pressable>
  );
}

// Fila horizontal de historias sobre el feed.
export function StoryTray({ groups, currentUserId }: { groups: StoryGroup[]; currentUserId: string }) {
  return (
    <FlatList
      horizontal
      data={groups}
      keyExtractor={(group) => group.author.id}
      renderItem={({ item }) => (
        <StoryCircle group={item} isOwn={item.author.id === currentUserId} />
      )}
      ListHeaderComponent={<AddStory />}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tray}
    />
  );
}

const styles = StyleSheet.create({
  tray: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  item: {
    width: AVATAR + 12,
    alignItems: 'center',
    gap: Spacing.one,
  },
  ring: {
    borderWidth: 2,
    borderRadius: (AVATAR + 12) / 2,
    padding: 3,
  },
  add: {
    width: AVATAR + 10,
    height: AVATAR + 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  label: {
    maxWidth: AVATAR + 12,
  },
});
