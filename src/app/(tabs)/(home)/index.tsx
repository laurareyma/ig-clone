import { PlaceholderScreen } from '@/presentation/components/placeholder-screen';

export default function HomeScreen() {
  return (
    <PlaceholderScreen
      title="Inicio"
      links={[
        { href: '/(home)/post/demo', label: 'Abrir un post en esta pestaña' },
        { href: '/create-post', label: 'Crear publicación (modal)' },
        { href: '/story/demo', label: 'Abrir una historia (pantalla completa)' },
        { href: '/sign-in', label: 'Ir a iniciar sesión' },
      ]}
    />
  );
}
