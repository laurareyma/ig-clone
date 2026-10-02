import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';

import { useTheme } from '@/presentation/hooks/use-theme';

// SF Symbols en iOS y Material Symbols en Android.
const symbols = {
  heart: { ios: 'heart', android: 'favorite_border' },
  heartFilled: { ios: 'heart.fill', android: 'favorite' },
  comment: { ios: 'bubble.right', android: 'chat_bubble_outline' },
  share: { ios: 'paperplane', android: 'send' },
  plus: { ios: 'plus.app', android: 'add_box' },
  messages: { ios: 'bubble.left.and.bubble.right', android: 'forum' },
  lock: { ios: 'lock', android: 'lock' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof symbols;

export function Icon({ name, size = 26, color }: { name: IconName; size?: number; color?: string }) {
  const theme = useTheme();
  const symbol = symbols[name];

  return (
    <SymbolView
      name={{ ios: symbol.ios, android: symbol.android, web: symbol.android }}
      size={size}
      tintColor={color ?? theme.text}
    />
  );
}
