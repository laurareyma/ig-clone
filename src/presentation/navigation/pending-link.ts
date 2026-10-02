// Enlace con el que se abrió la app sin sesión iniciada. La guardia de rutas manda al
// login y el enlace se perdería; aquí se guarda para retomarlo al entrar.
//
// Es estado de módulo, no de React: +native-intent se ejecuta fuera del árbol de
// componentes, antes de que exista ninguno.

let pending: string | null = null;
// undefined = aún no se sabe si hay sesión (arranque en frío).
let signedIn: boolean | undefined;

export function rememberIncomingLink(path: string): void {
  // Con sesión abierta el enrutador abre el enlace directamente: no hay nada que retomar.
  if (signedIn) return;
  // La raíz no lleva a ningún sitio en concreto.
  if (path === '' || path === '/' || /^[a-z][a-z0-9+.-]*:\/\/\/?$/i.test(path)) return;
  pending = path;
}

// Lo llama el layout raíz cada vez que cambia la sesión. Devuelve el enlace que hay que
// abrir ahora, si lo hay.
export function sessionChanged(nowSignedIn: boolean): string | null {
  const wasSignedOut = signedIn === false;
  signedIn = nowSignedIn;
  if (!nowSignedIn) return null;

  const link = pending;
  pending = null;
  // Si la sesión ya estaba guardada al arrancar, el enlace se abrió solo. Solo se retoma
  // cuando el usuario acaba de pasar por el login.
  return wasSignedOut ? link : null;
}

export function resetPendingLink(): void {
  pending = null;
  signedIn = undefined;
}
