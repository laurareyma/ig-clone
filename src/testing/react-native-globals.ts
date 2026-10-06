// Las pruebas corren en Node, que tiene APIs que React Native no trae. Aquí se cambian
// por las que instala React Native en el teléfono, para que un uso no disponible falle
// en las pruebas y no en el dispositivo.
import { AbortController, AbortSignal } from 'abort-controller';

Object.assign(globalThis, { AbortController, AbortSignal });
