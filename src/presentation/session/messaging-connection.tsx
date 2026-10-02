import { useEffect } from 'react';

import { useDependencies } from '@/presentation/dependencies';

// Mantiene abierto el canal de mensajes mientras haya sesión, esté el usuario en la
// pantalla que esté: así la bandeja se reordena, el contador de no leídos sube y el
// remitente recibe el "entregado" aunque el chat no esté abierto.
export function MessagingConnection() {
  const { messages } = useDependencies();

  useEffect(() => {
    // Lo que llegó mientras la app estaba cerrada.
    messages.refreshInbox().catch(() => {});
    return messages.connect();
  }, [messages]);

  return null;
}
