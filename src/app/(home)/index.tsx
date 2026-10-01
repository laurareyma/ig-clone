import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

export default function HomeScreen() {
  return (
    <PlaceholderScreen
      title="Inicio"
      link={{ href: '/(home)/post/demo', label: 'Abrir un post en esta pestaña' }}
    />
  );
}
