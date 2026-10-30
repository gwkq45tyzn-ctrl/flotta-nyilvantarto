/**
 * Produce a minimal, isolated Firebase Hosting preview from the staging branch.
 * Never package the legacy Fleet index.html, Google Apps Script or live fleet data.
 * Usage (Node 22): node staging/imile-management/build-preview.mjs
 */
import {cpSync,existsSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const target=join(root,'preview-imile-staging');
const allowed=[
  'staging/imile-management/index.html',
  'staging/imile-management/app.mjs',
  'staging/imile-management/session-policy.mjs',
  'staging/imile-management/fleet/index.html',
  'staging/imile-management/fleet/app.mjs',
  'staging/imile-management/fleet/master-data.mjs',
  'staging/imile-management/fleet/master-editor.mjs',
  'staging/imile-management/qa/index.html',
  'staging/imile-management/qa/app.mjs',
  'staging/imile-management/qa/functional-flow.mjs',
  'staging/imile-management/qa/run-flow.mjs',
  'staging/imile-management/shared-records.mjs',
  'staging/imile-management/shared-import-plan.mjs',
  'depokapacitas/index.html',
  'depokapacitas/style.css',
  'depokapacitas/app.js',
  'depokapacitas/firebase-config.js',
  'depokapacitas/import-dates.mjs',
  'depokapacitas/import-validation.mjs',
  'depokapacitas/capacity-eligibility.mjs'
];
for(const p of allowed)if(!existsSync(join(root,p)))throw Error('Missing staging file: '+p);
if(existsSync(target))throw Error('Preview directory exists. Remove it manually before rebuilding: '+target);
mkdirSync(target,{recursive:true});
try {
  for(const p of allowed) {
    const output=join(target,p);
    mkdirSync(dirname(output),{recursive:true});
    cpSync(join(root,p),output);
  }
  writeFileSync(join(target,'index.html'),
    '<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>iMile staging</title><meta http-equiv="refresh" content="0;url=./staging/imile-management/index.html"><a href="./staging/imile-management/index.html">Közös bejelentkezés</a></html>\n');
  writeFileSync(join(target,'firebase.json'),JSON.stringify({
    hosting:{
      public:'.',
      ignore:['firebase.json','**/.*','**/node_modules/**','**/*.log','**/*.log.*'],
      headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}]
    }
  },null,2)+'\n');
  console.log('Safe preview generated: '+target);
  console.log('Only shared menu, read-only Fleet preview and DepoKapacitas copied: '+allowed.length+' files');
  console.log('No legacy production Fleet application, no customer data, no Apps Script credentials.');
} catch(error) {
  rmSync(target,{recursive:true,force:true});
  throw error;
}
