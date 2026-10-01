import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

export default function ActivityScreen() {
  return (
    <PlaceholderScreen
      title="Actividad"
      links={[{ href: '/(activity)/post/demo', label: 'Abrir un post en esta pestaña' }]}
    />
  );
}
