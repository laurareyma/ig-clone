import { Link } from 'expo-router';
import { useState } from 'react';

import { signUp } from '@/domain/usecases/auth';
import { authErrorMessage } from '@/presentation/auth-error-messages';
import { Button } from '@/presentation/components/button';
import { FormScreen } from '@/presentation/components/form-screen';
import { TextField } from '@/presentation/components/text-field';
import { ThemedText } from '@/presentation/components/themed-text';
import { useDependencies } from '@/presentation/dependencies';

export function SignUpScreen() {
  const { auth } = useDependencies();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUp(auth, { username, email, password });
      // Si no hace falta confirmar, la sesión ya está abierta y el layout raíz cambia solo.
      if (needsEmailConfirmation) {
        setAwaitingConfirmation(true);
        setSubmitting(false);
      }
    } catch (e) {
      setError(authErrorMessage(e));
      setSubmitting(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <FormScreen title="Revisa tu correo">
        <ThemedText>
          Te enviamos un enlace a {email.trim()} para confirmar la cuenta. Después podrás iniciar
          sesión.
        </ThemedText>
        <Link href="/sign-in" replace>
          <ThemedText type="linkPrimary">Ir a iniciar sesión</ThemedText>
        </Link>
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Crear cuenta">
      <TextField
        label="Usuario"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username-new"
        autoCorrect={false}
        textContentType="username"
        maxLength={30}
      />
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
        autoComplete="new-password"
        secureTextEntry
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error && (
        <ThemedText type="small" accessibilityRole="alert" style={{ color: '#d93025' }}>
          {error}
        </ThemedText>
      )}
      <Button label="Registrarme" onPress={submit} loading={submitting} />
      <Link href="/sign-in" replace>
        <ThemedText type="linkPrimary">¿Ya tienes cuenta? Inicia sesión</ThemedText>
      </Link>
    </FormScreen>
  );
}
