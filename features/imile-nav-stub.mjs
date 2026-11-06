/**
 * Minimal navigation contract for future unified iMile shell.
 * Does not replace original Flotta UI. Pure data only.
 */
export const NAV_ITEMS = Object.freeze([
  { id: 'flotta', label: 'Flotta Nyilvántartó', href: '/index.html', required: true },
  { id: 'depo', label: 'DepóKapacitás', href: '/depokapacitas/index.html', required: false },
  { id: 'reports', label: 'Napi riportok', href: '/reports/', required: false }
]);

export function navForSession(authenticated) {
  return authenticated ? NAV_ITEMS : NAV_ITEMS.filter(i => i.id === 'flotta');
}
