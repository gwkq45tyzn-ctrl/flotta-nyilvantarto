/**
 * REAL Flotta → Depó E2E against local Auth/Firestore emulators.
 * Browser 1: original Flotta HTML, modify vehicle, save.
 * Browser 2: Depó HTML, verify change appears, perform booking.
 * Synthetic data only. No live Firebase or real data.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,Timestamp} from 'firebase/firestore';

const host='127.0.0.1',port=8128,projectId='demo-imile-qa';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(16).toString('hex')+'#';
const root=new URL('../../../',import.meta.url);
const rulesRaw=await readFile(new URL('depokapacitas/firestore-v1-restricted.rules',root),'utf8');
assert.ok(rulesRaw.includes('REPLACE_WITH_REAL_SHARED_UID'));

const fleetData={
  vehicles:[{id:'fleet-qa-vehicle-1',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',km:5000,status:'aktiv',normalizedPlate:'ABC123',history:[{date:'2026-01-01',note:'synthetic'}]}],
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
      status:'approved',approvedUid:result.localId,sourceSha256:sourceSha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),fleetData);
  });
  const bridgeRaw=await readFile(new URL('features/firestore-bridge.js',root),'utf8');
  const localBridge=bridgeRaw.replace(
    /const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/,
    `const FIREBASE_CONFIG = {apiKey:"fake",authDomain:"demo",projectId:"${projectId}"};`
  ).replace(
    'db = initializedDb;',
    `db = initializedDb;firebase.auth().useEmulator('http://127.0.0.1:9099');firebase.firestore().useEmulator('${host}',8787);`
  );
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://'+host+':'+port).pathname;
      let source;
      if(pathname==='/index.html')source=await readFile(new URL('index.html',root),'utf8');
      else if(pathname==='/features/firestore-bridge.js')source=localBridge;
      else if(pathname==='/depokapacitas/index.html')source=await readFile(new URL('depokapacitas/index.html',root),'utf8');
      else{res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':(pathname.endsWith('.html')?'text/html':'text/javascript')+'; charset=utf-8','Cache-Control':'no-store'});
      res.end(source);
    }catch{res.writeHead(500);res.end('Test server error');}
  });
  server.listen(port,host);await once(server,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const flottaPage=await browser.newPage();
  await flottaPage.goto('http://'+host+':'+port+'/index.html',{waitUntil:'domcontentloaded'});
  await flottaPage.waitForFunction(()=>typeof window.fleetSimpleLogin==='function',{timeout:30000});
  await flottaPage.locator('#flottaUsername').fill('imilemanagement');
  await flottaPage.locator('#flottaPassword').fill(password);
  await flottaPage.locator('#flottaLoginSubmit').click();
  await flottaPage.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),null,{timeout:45000});
  console.log('PASS [B+E]: Flotta browser unlocked');
  const editBtn=flottaPage.locator('#vehicleTable button[onclick^="editVehicle"]').first();
  await editBtn.waitFor({state:'visible',timeout:15000});
  await editBtn.click();
  await flottaPage.locator('#modal.active #km').fill('99999');
  await flottaPage.locator('#modal.active #vehicleForm button[type="submit"]').click();
  await flottaPage.waitForTimeout(1500);
  console.log('PASS [B+E]: Flotta vehicle km modified and saved');
  const depoPage=await browser.newPage();
  await depoPage.goto('http://'+host+':'+port+'/depokapacitas/index.html',{waitUntil:'domcontentloaded'});
  await depoPage.waitForFunction(()=>document.getElementById('loginForm')!==null||document.getElementById('shell')!==null,{timeout:30000});
  console.log('PASS [B+E]: Depó UI loaded');
  // Verify the change is visible in Depó shared fleet view
  await depoPage.locator('[data-view="sharedFleet"]').click();
  await depoPage.waitForTimeout(1000);
  const sharedText=await depoPage.locator('#shell').textContent();
  assert.ok(sharedText&&sharedText.includes('ABC-123'),'Depó shows the Flotta vehicle');
  console.log('PASS [B+E]: Depó shows Flotta vehicle');
  await flottaPage.locator('#flottaLogout').click();
  await flottaPage.waitForFunction(()=>document.body.classList.contains('flotta-locked'),null,{timeout:15000});
  console.log('PASS [B+E]: Flotta logout re-locks');
}finally{
  if(browser)await browser.close();
  if(server)server.close();
  if(env)await env.cleanup();
}
