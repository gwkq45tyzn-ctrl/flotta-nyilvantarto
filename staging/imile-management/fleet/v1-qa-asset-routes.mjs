/**
 * Local QA HTTP allow-list for the original Fleet+Depot browser test.
 * Not a production hosting rule and not an OFD/In-Hub/Excel route.
 */
const SCRIPT_OR_STYLE=/^\/(?:features|depokapacitas|staging\/imile-management)\/[A-Za-z0-9/_-]+\.(?:js|mjs|css)$/;
const DEPOT_HTML=new Set([
  '/depokapacitas/parcel-preview.html',
  '/staging/imile-management/cutover.html'
]);

export function qaAssetAllowed(pathname){
  if(typeof pathname!=='string'||pathname.includes('..')||pathname.includes('\\')) return false;
  if(pathname==='/index.html'||pathname==='/depokapacitas/index.html') return true;
  if(DEPOT_HTML.has(pathname)) return true;
  return SCRIPT_OR_STYLE.test(pathname);
}
