// Prepara cada enlace que abre la app desde fuera antes de que lo interprete el
// enrutador (lo llama +native-intent).
//
// 1. Quita los parámetros (?…) y el fragmento (#…). Ningún enlace externo de la app los
//    usa, y el enrutador los decodifica con decode-uri-component, que tiene un fallo de
//    denegación de servicio con entradas mal codificadas (GHSA-vcc3-ghjq-m6fr): un
//    enlace malicioso podría congelar la app. La corrección llega con expo-router 58;
//    hasta entonces, lo que viene de fuera nunca llega a esa función.
//
// 2. Lleva los enlaces a /post/{id} a la pestaña Inicio. post/[id] existe dentro de las
//    cuatro pestañas, así que el enlace es ambiguo y el enrutador elegiría la primera por
//    orden alfabético (Actividad).
//
// El valor puede llegar como URL completa (instagramclone://post/{id},
// exp://host/--/post/{id}) o como ruta (/post/{id}).
const POST_LINK = /(?:^|\/)post\/([^/]+)\/?$/;

// El development build arranca con exp+instagramclone://expo-development-client/?url=…:
// el destino va en un parámetro y el enrutador lo extrae él mismo. Solo existe en builds
// de desarrollo.
const DEV_CLIENT_LINK = /^[^:]+:\/\/expo-development-client\b/;

export function resolveIncomingLink(path: string): string {
  if (DEV_CLIENT_LINK.test(path)) return path;

  const withoutQuery = path.split(/[?#]/, 1)[0];

  // Ya indica la pestaña: se respeta.
  if (withoutQuery.includes('(')) return withoutQuery;

  const match = POST_LINK.exec(withoutQuery);
  return match ? `/(tabs)/(home)/post/${match[1]}` : withoutQuery;
}
