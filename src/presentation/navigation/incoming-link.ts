// post/[id] existe dentro de las cuatro pestañas, así que un enlace externo a
// /post/{id} es ambiguo y el enrutador elegiría la primera por orden alfabético
// (Actividad). Aquí se fija que los enlaces que llegan de fuera abran en Inicio.
//
// El valor puede llegar como URL completa (instagramclone://post/{id},
// exp://host/--/post/{id}) o como ruta (/post/{id}).
const POST_LINK = /(?:^|\/)post\/([^/?#]+)\/?(?:[?#].*)?$/;

export function resolveIncomingLink(path: string): string {
  // Ya indica la pestaña: se respeta.
  if (path.includes('(')) return path;

  const match = POST_LINK.exec(path);
  return match ? `/(tabs)/(home)/post/${match[1]}` : path;
}
