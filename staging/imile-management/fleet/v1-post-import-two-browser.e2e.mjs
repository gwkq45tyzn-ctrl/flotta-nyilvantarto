/**
 * REAL post-import two-browser Flotta E2E against local Auth/Firestore emulators.
 * Uses original index.html. Synthetic data only. No live Firebase or real data.
 * Proves: login + server source readback after approval, preseal read-only in both real browser contexts.
 * The same CI workflow separately runs the actual postseal two-browser Fleet/Depo save and conflict acceptance.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,Timestamp} from 'firebase/firestore';

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
const configPattern=/const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/;
assert.match(bridgeRaw,configPattern,'Unexpected Fleet config format, block cloud fallback');
const emulatorAnchor='db = initializedDb;';
assert.ok(bridgeRaw.includes(emulatorAnchor),'Bridge injection point changed: STOP');


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
  // Same emulator injection as existing passing original-Fleet browser test.
  // A test must never silently fall back to a real cloud project.
  const localBridge=bridgeRaw.replace(configPattern,
    `const FIREBASE_CONFIG = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'${projectId}',appId:'1:123:web:local-fleet'};`
  ).replace(emulatorAnchor,emulatorAnchor+
    "\n      auth.useEmulator('http://127.0.0.1:9099');"+
    "\n      db.useEmulator('127.0.0.1',8787);");
  assert.ok(localBridge.includes("auth.useEmulator('http://127.0.0.1:9099')"));
  assert.ok(localBridge.includes("db.useEmulator('127.0.0.1',8787)"));
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
  for(const [number,page] of [page1,page2].entries()){
    const pageErrors=[],consoleErrors=[],failedRequests=[];
    page.on('pageerror',error=>pageErrors.push(String(error.message).slice(0,250)));
    page.on('console',message=>{
      if(message.type()==='error')consoleErrors.push(message.text().slice(0,250));
    });
    page.on('requestfailed',request=>failedRequests.push({
      url:request.url().split('?')[0].slice(0,160),
      error:request.failure()?.errorText?.slice(0,140)
    }));
    await page.goto('http://'+host+':'+port+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.fleetSimpleLogin==='function'
      && String(window.fleetSimpleLogin).includes('signInWithEmailAndPassword'),null,{timeout:30000});
    await page.locator('#flottaUsername').fill('imilemanagement');
    await page.locator('#flottaPassword').fill(password);
    await page.locator('#flottaLoginSubmit').click();
    try {
      await page.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),null,{timeout:45000});
    } catch(error) {
      // Local synthetic identities only. Never log passwords or tokens.
      const diagnostic=await page.evaluate(()=>({
        sdk:!!window.firebase,
        loginHandlerPatched:String(window.fleetSimpleLogin).includes('signInWithEmailAndPassword'),
        authEmulatorUser:!!window.firebase?.auth?.()?.currentUser,
        status:document.getElementById('syncStatus')?.textContent?.slice(0,250),
        loginError:document.getElementById('flottaLoginMessage')?.textContent?.slice(0,250),
        buttonDisabled:document.getElementById('flottaLoginSubmit')?.disabled
      }));
      console.error('FAIL [B+E]: original Fleet login '+(number+1),JSON.stringify({
        diagnostic,pageErrors,consoleErrors,failedRequests
      }));
      throw error;
    }
  }
  console.log('PASS [B+E]: two browsers unlocked after approved import');
  // A status label alone is NOT a data-loading proof: inspect actual approved
  // source snapshot in both independent original-Fleet browser contexts.
  for(const [number,page] of [page1,page2].entries()){
    await page.waitForFunction(()=>{
      const raw=localStorage.getItem('flotta_firestore_cache_v3');
      if(!raw)return false;
      try{
        const x=JSON.parse(raw);
        return x.revision===1
          && x.vehicles?.[0]?.rendszam==='ABC-123'
          && x.vehicles?.[0]?.history?.[0]?.note==='synthetic'
          && x.drivers?.[0]?.kapacitas===80
          && x.fuelCards?.[0]?.id==='FC001'
          && x.contacts?.[0]?.id==='CT001';
      }catch{return false;}
    },null,{timeout:15000});
    const sync=await page.locator('#syncStatus').textContent();
    assert.match(sync||'',/Firestore|rev/, 'Browser '+(number+1)+' has confirmed sync status');
  }
  console.log('PASS [B+E]: both original Fleet browsers actually loaded rich approved source snapshot');
  // #133/#141: approved SOURCE without a privileged full keyed seal is
  // READ-ONLY in BOTH actual original Fleet browsers. This is intentional.
  // The first browser's edit controls must never open a preseal mutation form.
  for(const [browserNumber,page] of [page1,page2].entries()){
    const button=page.locator('#vehicleTable button[onclick^="editVehicle"]').first();
    await button.waitFor({state:'visible',timeout:15000});
    await button.click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#modal.active').count(),0,
      'Browser '+(browserNumber+1)+' must block preseal source edits');
    const read=await page.evaluate(()=>({
      cache:JSON.parse(localStorage.getItem('flotta_firestore_cache_v3')||'{}'),
      pending:localStorage.getItem('flotta_pending_v16')
    }));
    assert.equal(read.cache.revision,1);
    assert.equal(read.cache.vehicles?.[0]?.km,5000);
    assert.equal(read.pending,null,'No rejected preseal edit can be queued for replay');
  }
  // Only independent privileged migration can seed keyed masters and seal.
  // The separate ORIGINAL Fleet+Depot 2-browser E2E in this same CI workflow
  // proves sealed form km/capacity/status changes and the stale-form STOP.
  let persisted;
  await env.withSecurityRulesDisabled(async ctx=>{
    persisted=await getDoc(doc(ctx.firestore(),'flottaSharedState','current'));
  });
  assert.equal(persisted.exists(),true);
  assert.equal(persisted.data().revision,1);
  assert.equal(persisted.data().vehicles[0].km,5000);
  assert.deepEqual(persisted.data().vehicles[0].history,fleetData.vehicles[0].history);
  assert.equal(persisted.data().drivers[0].kapacitas,80);
  assert.equal(persisted.data().migrationSourceSha256,sourceSha);
  console.log('PASS [B+E]: BOTH original Fleet browsers remain preseal read-only, no pending replay or rich data loss');
  await page1.locator('#flottaLogout').click();
  await page1.waitForFunction(()=>document.body.classList.contains('flotta-locked'),null,{timeout:15000});
  console.log('PASS [B+E]: logout re-locks');
}finally{
  if(browser)await browser.close();
  if(server)server.close();
  if(env)await env.cleanup();
}
