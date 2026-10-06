// React Native no trae AbortController nativo: instala un polyfill (el paquete
// abort-controller) que no tiene signal.throwIfAborted() ni signal.reason. Estas dos
// funciones hacen lo mismo con lo que sí tiene: signal.aborted.

export function abortError(): Error {
  const error = new Error('La descarga se canceló');
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}
