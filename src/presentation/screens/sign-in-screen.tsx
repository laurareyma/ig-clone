import { Link } from 'expo-router';
import { useState } from 'react';

import { signIn } from '@/domain/usecases/auth';
import { authErrorMessage } from '@/presentation/auth-error-messages';
import { Button } from '@/presentation/components/button';
import { FormScreen } from '@/presentation/components/form-screen';
import { TextField } from '@/presentation/components/text-field';
import { ThemedText } from '@/presentation/components/themed-text';
import { useDependencies } from '@/presentation/dependencies';

export function SignInScreen() {
  const { auth } = useDependencies();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      // Si sale bien no hay que navegar: cambia la sesión y el layout raíz muestra las pestañas.
      await signIn(auth, { email, password });
    } catch (e) {
      setError(authErrorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <FormScreen title="Iniciar sesión">
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        secureTextEntry
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error && (
        <ThemedText type="small" accessibilityRole="alert" style={{ color: '#d93025' }}>
          {error}
        </ThemedText>
      )}
      <Button label="Entrar" onPress={submit} loading={submitting} />
      <Link href="/sign-up" replace>
        <ThemedText type="linkPrimary">¿No tienes cuenta? Regístrate</ThemedText>
      </Link>
    </FormScreen>
  );
}
