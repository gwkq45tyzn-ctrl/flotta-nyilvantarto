/**
 * One-command, local Firebase Hosting preview deployment for a signed-in
 * maintainer. This NEVER deploys to the live Hosting channel or GitHub Pages.
 * Run from any directory after cloning the staging branch:
 * node staging/imile-management/deploy-preview.mjs
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const branch='staging/imile-management-integration';
const project='imile-management-staging';
const channel='imile-qa';
const output=join(root,'preview-imile-staging');
const fail=msg=>{console.error('\nHIBA: '+msg);process.exit(1);};
const run=(cmd,args,options={})=>{
 const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit',shell:false,...options});
 if(result.error||result.status!==0)fail('A parancs nem sikerült: '+cmd+' '+args.join(' '));
 return result;
};
if(Number(process.versions.node.split('.')[0])<22)fail('Node.js 22 vagy újabb szükséges.');
const git=spawnSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'});
if(git.status!==0 || git.stdout.trim()!==branch)
 fail('Kizárólag a '+branch+' GitHub-fejlesztői ágból telepíthető.');
if(existsSync(output))
 fail('A preview-imile-staging könyvtár már létezik. Ne írj felül előző csomagot; tiszta checkout szükséges.');
const tests=[
 'depokapacitas/firebase-config.test.mjs',
 'depokapacitas/rules-contract.test.mjs',
 'depokapacitas/rules-calendar.test.mjs',
 'staging/imile-management/session-policy.test.mjs',
 'staging/imile-management/qa/functional-flow.test.mjs',
 'staging/imile-management/qa/run-flow.test.mjs',
 'staging/imile-management/entry.test.mjs'
];
console.log('Staging tesztek futtatása, éles adatírás nélkül…');
for(const file of tests)run(process.execPath,[file]);
console.log('Izolált Firebase Hosting csomag előállítása…');
run(process.execPath,['staging/imile-management/build-preview.mjs']);
const npx=process.platform==='win32'?'npx.cmd':'npx';
console.log('Firebase-bejelentkezés a saját böngésződben; jelszót a script nem kér és nem tárol.');
run(npx,['--yes','firebase-tools','login'],{shell:process.platform==='win32'});
console.log('Staging Firestore-szabályok ellenőrzött telepítése (csak '+project+').');
run(npx,['--yes','firebase-tools@15.34.2','deploy',
 '--only','firestore:rules','--project',project,'--config','firebase.depo-qa.json',
 '--non-interactive'],{shell:process.platform==='win32'});
console.log('Kizárólag '+project+' / '+channel+' preview csatorna következik. Nincs live deployment.');
run(npx,['--yes','firebase-tools','hosting:channel:deploy',channel,
 '--project',project,'--expires','7d'],{cwd:output,shell:process.platform==='win32'});
console.log('\nSIKER: a Firebase CLI által fent kiírt preview URL-en ellenőrizhető az alkalmazás.');
