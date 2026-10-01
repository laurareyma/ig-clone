import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

export default function ProfileScreen() {
  return (
    <PlaceholderScreen
      title="Perfil"
      link={{ href: '/(profile)/post/demo', label: 'Abrir un post en esta pestaña' }}
    />
  );
}
