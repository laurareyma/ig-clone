import { StyleSheet } from 'react-native';

import type { SyncStatus } from '@/domain/repositories/sync-monitor';
import { ThemedText } from '@/presentation/components/themed-text';
import { ThemedView } from '@/presentation/components/themed-view';
import { useSyncStatus } from '@/presentation/hooks/use-sync-status';
import { Spacing } from '@/presentation/theme';

function message({ online, pendingCount }: SyncStatus): string | null {
  const actions = pendingCount === 1 ? '1 acción' : `${pendingCount} acciones`;

  if (!online) {
    return pendingCount > 0
      ? `Sin conexión. ${actions} se ${pendingCount === 1 ? 'enviará' : 'enviarán'} al reconectar.`
      : 'Sin conexión. Mostrando lo guardado en el dispositivo.';
  }
  return pendingCount > 0 ? `Enviando ${actions}…` : null;
}

// Estado de la cola de sincronización: sin conexión y/o acciones aún no enviadas.
export function SyncBanner() {
  const text = message(useSyncStatus());
  if (!text) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.banner} accessibilityRole="alert">
      <ThemedText type="small" themeColor="textSecondary">
        {text}
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
