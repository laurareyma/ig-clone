import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

export default function ExploreScreen() {
  return (
    <PlaceholderScreen
      title="Explorar"
      links={[{ href: '/(tabs)/(explore)/post/demo', label: 'Abrir un post en esta pestaña' }]}
    />
  );
}
