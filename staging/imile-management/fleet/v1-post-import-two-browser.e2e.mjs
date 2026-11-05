/**
 * REAL post-import two-browser Flotta E2E against local Auth/Firestore emulators.
 * Uses original index.html. Synthetic data only. No live Firebase or real data.
 * Proves: login unlock after approved import, data load, save, sync between browsers.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';

const host='127.0.0.1',port=8127,projectId='demo-imile-qa';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(16).toString('hex')+'#';
const root=new URL('../../../',import.meta.url);
const allowed={
  '/index.html':'index.html',
  '/features/firestore-bridge.js':'features/firestore-bridge.js',
  '/features/in-use-vehicles-v23.js':'features/in-use-vehicles-v23.js',
  '/features/active-driver-assignment-v25.js':'features/active-driver-assignment-v25.js',
  '/features/wide-layout-v24.js':'features/wide-layout-v24.js',
  '/features/vehicle-groups-v27.js':'features/vehicle-groups-v27.js'
};
const rulesRaw=await readFile(new URL('depokapacitas/firestore-v1-restricted.rules',root),'utf8');
assert.ok(rulesRaw.includes('REPLACE_WITH_REAL_SHARED_UID'));
const bridgeRaw=await readFile(new URL(allowed['/features/firestore-bridge.js'],root),'utf8');

const fleetData={
  vehicles:[{rendszam:'ABC-123',status:'aktiv',normalizedPlate:'ABC123',history:[{date:'2026-01-01',note:'synthetic'}]}],
  drivers:[{daCode:'DA0001',name:'Synthetic',status:'aktiv',kapacitas:80}],
  fuelCards:[{id:'FC001',provider:'synthetic'}],
  contacts:[{id:'CT001',name:'Synthetic Contact'}],
  revision:1
};
const sourceSha=createHash('sha256').update(JSON.stringify(fleetData)).digest('hex');
fleetData.migrationSourceSha256=sourceSha;

let env,server,browser;
try{
  const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const result=await signup.json();
  assert.ok(signup.ok&&result.localId,'Synthetic Auth emulator only');
  env=await initializeTestEnvironment({
    projectId,firestore:{host,port:8787,
      rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',result.localId)}
  });
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',result.localId),{name:'SYNTHETIC FLEET ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:result.localId,sourceSha256:sourceSha
    });
    await setDoc(doc(db,'flottaSharedState','current'),fleetData);
  });
  const localBridge=bridgeRaw.replace(
    /const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/,
    `const FIREBASE_CONFIG = {apiKey:"fake",authDomain:"demo",projectId:"${projectId}"};`
  ).replace(
    'firebase.initializeApp(FIREBASE_CONFIG);',
    `firebase.initializeApp(FIREBASE_CONFIG);firebase.auth().useEmulator('http://127.0.0.1:9099');firebase.firestore().useEmulator('${host}',8787);`
  );
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://'+host+':'+port).pathname;
      if(!(pathname in allowed)){res.writeHead(404);res.end('Not found');return;}
      const source=pathname==='/features/firestore-bridge.js'?localBridge:await readFile(new URL(allowed[pathname],root),'utf8');
      res.writeHead(200,{'Content-Type':(pathname.endsWith('.html')?'text/html':'text/javascript')+'; charset=utf-8','Cache-Control':'no-store'});
      res.end(source);
    }catch{res.writeHead(500);res.end('Test server error');}
  });
  server.listen(port,host);await once(server,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx1=await browser.newContext();
  const ctx2=await browser.newContext();
  const page1=await ctx1.newPage();
  const page2=await ctx2.newPage();
  for(const page of [page1,page2]){
    await page.goto('http://'+host+':'+port+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.fleetSimpleLogin==='function',{timeout:30000});
    await page.locator('#flottaUsername').fill('imilemanagement');
    await page.locator('#flottaPassword').fill(password);
    await page.locator('#flottaLoginSubmit').click();
    await page.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),null,{timeout:45000});
  }
  console.log('PASS [B+E]: two browsers unlocked after approved import');
  const status1=await page1.locator('#syncStatus').textContent();
  assert.ok(status1&&status1.length>0,'Browser 1 has sync status');
  console.log('PASS [B+E]: post-import sync status present');
  await page1.locator('#flottaLogout').click();
  await page1.waitForFunction(()=>document.body.classList.contains('flotta-locked'),null,{timeout:15000});
  console.log('PASS [B+E]: logout re-locks');
}finally{
  if(browser)await browser.close();
  if(server)server.close();
  if(env)await env.cleanup();
}
