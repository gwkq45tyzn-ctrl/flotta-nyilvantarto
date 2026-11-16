/**
 * REAL ORIGINAL Fleet HTML Chromium smoke against localhost-only Firebase
 * Auth/Firestore emulators. NEVER deploy this test copy or point at live data.
 * Runtime rewrites bridge configuration IN MEMORY, original index.html unchanged.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';

const host='127.0.0.1',port=8126,projectId='demo-imile-qa';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(20).toString('hex')+'#';
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
assert.match(bridgeRaw,configPattern);
const bridge=bridgeRaw.replace(configPattern,
  "const FIREBASE_CONFIG = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-fleet'};");
// Insert emulator endpoints only AFTER the full compat SDK has loaded and
// both Firebase service instances have been assigned by initFirebase().
const init='db = initializedDb;';
assert.ok(bridge.includes(init),'Bridge emulator injection anchor changed; re-audit before QA');
const localBridge=bridge.replace(init,init+
  "\n      auth.useEmulator('http://127.0.0.1:9099');\n      db.useEmulator('127.0.0.1',8787);");
const initial={
  vehicles:[{id:'local-only',rendszam:'ABC-123',gyartmany:'Ford',modell:'Transit',status:'aktiv',km:12345}],
  fuelCards:[],drivers:[],contacts:[]
};
let env,server,browser;
const forbiddenRequests=[];
try{
  const endpoint='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})});
  const result=await response.json();
  assert.ok(response.ok&&result.localId,'Synthetic Auth emulator only');
  env=await initializeTestEnvironment({
    projectId,firestore:{host,port:8787,
      rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',result.localId)}
  });
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',result.localId),{name:'SYNTHETIC FLEET ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'flottaSharedState','current'),{
      vehicles:[{id:'server-different',rendszam:'XYZ999',status:'szerviz'}],
      drivers:[],fuelCards:[],contacts:[],revision:1
    });
  });
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://'+host+':'+port).pathname;
      if(!(pathname in allowed)){res.writeHead(404);res.end('Not found');return;}
      const source=pathname==='/features/firestore-bridge.js'
        ?localBridge:await readFile(new URL(allowed[pathname],root),'utf8');
      const type=pathname.endsWith('.html')?'text/html':'text/javascript';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8',
        'Cache-Control':'no-store','X-Robots-Tag':'noindex'});
      res.end(source);
    }catch(error){res.writeHead(500);res.end('Test server error');}
  });
  server.listen(port,host);await once(server,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:false});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('http://127.0.0.1:')||url.startsWith('https://www.gstatic.com/')){
      route.continue();return;
    }
    forbiddenRequests.push(url.split('?')[0]);route.abort();
  });
  await context.addInitScript(localState=>{
    localStorage.setItem('flotta_nyilvantarto_v16',JSON.stringify(localState));
    sessionStorage.setItem('flotta_simple_session_v23',JSON.stringify({
      user:'fleetmanager',at:Date.now()
    }));
  },initial);
  const page=await context.newPage(),errors=[],browserConsoleErrors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')browserConsoleErrors.push(msg.text().slice(0,700));});
  await page.goto('http://'+host+':'+port+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.fleetSimpleLogin==='function'&&
    document.getElementById('flottaLoginForm')!==null,{timeout:30000});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('flotta-locked')),true,
    'Untrusted Fleet legacy session cannot unlock UI');
  assert.equal(await page.evaluate(()=>window.fleetGateSession()),null,
    'Legacy session must be rejected by early patched bridge');
  const before=await page.evaluate(()=>localStorage.getItem('flotta_nyilvantarto_v16'));
  await page.locator('#flottaUsername').fill('imilemanagement');
  await page.locator('#flottaPassword').fill(password);
  await page.locator('#flottaLoginSubmit').click();
  try {
    await page.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),
      null,{timeout:45000});
  } catch (error) {
    // Only synthetic/emulated state; never log passwords, tokens or real Fleet data.
    const diagnostic=await page.evaluate(()=>({
      authSdkLoaded:!!window.firebase,
      emulatorAuthHasUser:!!(window.firebase?.auth()?.currentUser),
      loginHandlerPatched:String(window.fleetSimpleLogin).includes('signInWithEmailAndPassword'),
      sessionGatePatched:String(window.fleetGateSession).includes('isAuthenticated'),
      loginButtonDisabled:document.getElementById('flottaLoginSubmit')?.disabled,
      status:document.getElementById('syncStatus')?.textContent?.slice(0,250),
      loginError:document.getElementById('flottaLoginMessage')?.textContent?.slice(0,250),
      sessionAlias:(()=>{try{return JSON.parse(sessionStorage.getItem('flotta_simple_session_v23')||'null')?.user||null;}catch{return null;}})()
    }));
    console.error('FAIL [B+E] sanitized local-emulator login diagnostics:',
      JSON.stringify({diagnostic,pageErrors:errors,browserConsoleErrors,forbiddenRequests}));
    throw error;
  }
  console.log('PASS [B+E]: REAL original Fleet HTML rejects stale legacy session and unlocks after server-verified Auth');
  await page.waitForTimeout(800);
  // Real Chromium DOM test of the ORIGINAL Fleet renderAlerts, not a copied
  // algorithm. Synthetic rows are transient: no save(), SDK writes or imports.
  const mileageUi=await page.evaluate(()=>{
    const originalVehicles=vehicles,originalSnapshot=JSON.stringify(snapshot());
    const samples=[];
    try{
      for(const [km,due] of [[37891,37500],[37500,38000],[39000,40001],[100000,0]]){
        vehicles=[{id:'synthetic-mileage',rendszam:'QA-KM-001',status:'aktiv',
          km,kovetkezoSzervizKm:due,history:[{type:'qa',note:'preserved'}]}];
        renderAlerts();
        const el=document.getElementById('alerts');
        samples.push({km,due,text:el.textContent,
          overdue:!!el.querySelector('.badge.overdue'),
          soon:!!el.querySelector('.badge.soon')});
      }
    }finally{
      vehicles=originalVehicles;
      renderAlerts();
    }
    return {samples,unchanged:originalSnapshot===JSON.stringify(snapshot())};
  });
  assert.equal(mileageUi.unchanged,true,'Original rich Fleet data must not mutate in alert rendering');
  assert.match(mileageUi.samples[0].text,/391 km-rel túllépte/);
  assert.match(mileageUi.samples[0].text,/Aktuális: 37891 km · Határ: 37500 km/);
  assert.equal(mileageUi.samples[0].overdue,true,'Overdue alert badge visible in real original DOM');
  assert.match(mileageUi.samples[1].text,/500 km múlva esedékes/);
  assert.equal(mileageUi.samples[1].soon,true,'500-km warning badge visible');
  assert.doesNotMatch(mileageUi.samples[2].text,/Kötelező olajcsere/);
  assert.doesNotMatch(mileageUi.samples[3].text,/Kötelező olajcsere/);
  console.log('PASS [B+E]: REAL original Fleet Chromium DOM displays overdue/near service km alerts; no bogus unconfigured alert or source mutation');
  // The original clickable dashboard STAT counters previously counted date
  // fields but omitted oil-change mileage. The lists omitted those cars too.
  // Real DOM checks: exactly one row per vehicle even with multiple warnings.
  const counters=await page.evaluate(()=>{
    const originalVehicles=vehicles,before=JSON.stringify(snapshot());
    let result;
    try{
      vehicles=[
        {id:'qa-overdue',rendszam:'QA-OVERDUE',status:'aktiv',
          km:37891,kovetkezoSzervizKm:37500,
          biztositasLejarat:'2020-01-01',muszakiLejarat:'2020-02-01'},
        {id:'qa-soon',rendszam:'QA-SOON',status:'aktiv',
          km:37500,kovetkezoSzervizKm:38000},
        {id:'qa-far',rendszam:'QA-FAR',status:'aktiv',
          km:39000,kovetkezoSzervizKm:40001},
        {id:'qa-none',rendszam:'QA-NONE',status:'aktiv',
          km:100000,kovetkezoSzervizKm:0}
      ];
      renderStats();
      const overdue=Number(document.querySelector('#stats .stat-card.danger .value')?.textContent);
      const soon=Number(document.querySelector('#stats .stat-card.warning .value')?.textContent);
      filterByStat('overdue');
      const overdueCount=document.querySelectorAll('#filterModalContent tbody tr').length;
      const overdueText=document.getElementById('filterModalContent')?.textContent||'';
      const overdueTitle=document.getElementById('filterModalTitle')?.textContent||'';
      filterByStat('soon');
      const soonCount=document.querySelectorAll('#filterModalContent tbody tr').length;
      const soonText=document.getElementById('filterModalContent')?.textContent||'';
      const soonTitle=document.getElementById('filterModalTitle')?.textContent||'';
      result={overdue,soon,overdueCount,soonCount,
        overdueText,soonText,overdueTitle,soonTitle};
    }finally{
      vehicles=originalVehicles;
      renderStats();
      document.getElementById('filterModal')?.classList.remove('active');
    }
    return {...result,unchanged:JSON.stringify(snapshot())===before};
  });
  assert.equal(counters.overdue,1,
    'One overdue vehicle must count ONCE despite overdue km + two expired dates');
  assert.equal(counters.soon,1,'Exactly one vehicle with oil change due in 500 km');
  assert.equal(counters.overdueCount,1,'Overdue stat list must equal counter');
  assert.equal(counters.soonCount,1,'Soon stat list must equal counter');
  assert.match(counters.overdueText,/QA-OVERDUE/);
  assert.doesNotMatch(counters.overdueText,/QA-SOON|QA-FAR|QA-NONE/);
  assert.match(counters.soonText,/QA-SOON/);
  assert.doesNotMatch(counters.soonText,/QA-OVERDUE|QA-FAR|QA-NONE/);
  assert.match(counters.overdueTitle,/olajcsere-km/);
  assert.match(counters.soonTitle,/1000 km/);
  assert.equal(counters.unchanged,true,'Stats and modal lists must remain read-only');
  console.log('PASS [REAL CHROMIUM]: original Fleet stat counters and click-through lists include oil-change km exactly once per vehicle without data mutation');
  // Browser-level proof that the integrated bridge intercepts the ORIGINAL
  // importData handler BEFORE FileReader can replace live source arrays.
  // The import is synthetic, in-memory only; no cloud or local persistence.
  const blockedImport=await page.evaluate(async()=>{
    const before=JSON.stringify(snapshot()),oldPending=localStorage.getItem('flotta_pending_v16');
    const fixture={vehicles:[{id:'qa-v',rendszam:'QA-123'}],
      drivers:[{id:'qa-d',daCode:'QA0001',kapacitas:70,status:'aktiv'}],
      fuelCards:[],contacts:[]};
    const input={value:'synthetic.json',files:[
      new File([JSON.stringify(fixture)],'synthetic.json',{type:'application/json'})
    ]};
    let prevented=false,stopped=false;
    window.importData({target:input,
      preventDefault(){prevented=true;},
      stopImmediatePropagation(){stopped=true;}
    });
    await new Promise(resolve=>setTimeout(resolve,120));
    return {unchanged:JSON.stringify(snapshot())===before,
      pendingUnchanged:localStorage.getItem('flotta_pending_v16')===oldPending,
      prevented,stopped,inputCleared:input.value==='',
      status:document.getElementById('syncStatus')?.textContent||''};
  });
  assert.equal(blockedImport.prevented,true,'Original import event must be intercepted before FileReader');
  assert.equal(blockedImport.stopped,true,'Original inline import must not continue');
  assert.equal(blockedImport.inputCleared,true,'Rejected bulk file selection must reset');
  assert.equal(blockedImport.unchanged,true,'Authenticated Fleet rich arrays must remain unchanged');
  assert.equal(blockedImport.pendingUnchanged,true,'Rejected import must not create pending snapshot');
  assert.match(blockedImport.status,/közvetlen JSON-importja letiltva/);
  console.log('PASS [B+E]: REAL original Fleet browser denies unsafe bulk JSON import before seal, no rich mutation/pending replay');
  const after=await page.evaluate(()=>localStorage.getItem('flotta_nyilvantarto_v16'));
  assert.equal(after,before,'Pre-import legacy Fleet snapshot must remain unchanged');
  await page.evaluate(()=>window.save());
  assert.equal(await page.evaluate(()=>localStorage.getItem('flotta_pending_v16')),null,
    'Original save() must not create preimport pending data');
  assert.equal(forbiddenRequests.length,0,
    'Original Fleet must not call Apps Script/unknown host: '+forbiddenRequests.join(','));
  console.log('PASS [B+E]: REAL original Fleet pre-import is read-only, no Apps Script calls or remote overwrite');
  await page.locator('#flottaLogout').click();
  await page.waitForFunction(()=>document.body.classList.contains('flotta-locked'),
    null,{timeout:15000});
  assert.equal(errors.length,0,'Fleet page errors: '+errors.join('; '));
  console.log('PASS [B+E]: REAL Fleet UI logout re-locks with no JS page errors');
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}
