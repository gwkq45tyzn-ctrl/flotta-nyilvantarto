/**
 * REAL, isolated, original Flotta HTML -> actual Depo UI booking E2E.
 * All reads/writes after synthetic privileged seed use ORIGINAL browser UIs.
 * Auth/Firestore on local emulators only; no live project, deployment or import.
 * Proves: genuine Fleet form edit; remote Depot onSnapshot readback; actual
 * booking UI submits canonical two-document transaction under unchanged Rules.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,Timestamp} from 'firebase/firestore';

const host='127.0.0.1',port=8128,projectId='demo-imile-qa';
const origin='http://'+host+':'+port;
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(16).toString('hex')+'#';
const root=new URL('../../../',import.meta.url);
const rulesRaw=await readFile(new URL('depokapacitas/firestore-v1-restricted.rules',root),'utf8');
assert.ok(rulesRaw.includes('REPLACE_WITH_REAL_SHARED_UID'),
  'Real UID must never be wired into synthetic QA');

const bridgeRaw=await readFile(new URL('features/firestore-bridge.js',root),'utf8');
const bridgeConfigPattern=/const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/;
assert.match(bridgeRaw,bridgeConfigPattern,'Original Fleet Firebase config anchor changed: STOP');
const bridgeAnchor='db = initializedDb;';
assert.ok(bridgeRaw.includes(bridgeAnchor),'Fleet emulator injection anchor changed: STOP');
const localBridge=bridgeRaw.replace(bridgeConfigPattern,
  "const FIREBASE_CONFIG = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-fleet'};"
).replace(bridgeAnchor,bridgeAnchor+
  "\n      auth.useEmulator('http://127.0.0.1:9099');"+
  "\n      db.useEmulator('127.0.0.1',8787);");
assert.ok(localBridge.includes("db.useEmulator('127.0.0.1',8787)"));

const depotAppRaw=await readFile(new URL('depokapacitas/app.js',root),'utf8');
const depotInit='const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);';
assert.ok(depotAppRaw.includes(depotInit),'Original Depot modular Firebase init changed: STOP');
const localDepotApp=
  "import {connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';\n"+
  "import {connectFirestoreEmulator} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';\n"+
  depotAppRaw.replace(depotInit,depotInit+
    "\n  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});"+
    "\n  connectFirestoreEmulator(db,'127.0.0.1',8787);");
assert.ok(localDepotApp.includes("connectFirestoreEmulator(db,'127.0.0.1',8787)"));
const localDepotConfig=
  "export const firebaseConfig = {apiKey:'fake-api-key',authDomain:'localhost',"+
  "projectId:'demo-imile-qa',appId:'1:123:web:local-depot'};";

const fleetData={
  vehicles:[{id:'fleet-qa-vehicle-1',rendszam:'ABC-123',gyartmany:'Ford',
    modell:'Transit',km:5000,status:'aktiv',normalizedPlate:'ABC123',
    history:[{date:'2026-01-01',note:'synthetic'}]}],
  drivers:[{id:'fleet-qa-driver-1',daCode:'DA0001',name:'Synthetic',
    status:'aktiv',kapacitas:80}],
  fuelCards:[{id:'FC001',provider:'synthetic'}],
  contacts:[{id:'CT001',name:'Synthetic Contact'}],
  revision:1
};
const sourceSha=createHash('sha256').update(JSON.stringify(fleetData)).digest('hex');
fleetData.migrationSourceSha256=sourceSha;

let env,server,browser;
const errors=[],blockedCloud=[];
try{
  const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const result=await signup.json();
  assert.ok(signup.ok&&result.localId,'Local synthetic Auth user must exist');
  env=await initializeTestEnvironment({projectId,firestore:{host,port:8787,
    rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',result.localId)}});
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',result.localId),
      {name:'SYNTHETIC FLEET ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:result.localId,sourceSha256:sourceSha,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(doc(db,'flottaSharedState','current'),fleetData);
  });
  async function serverRead(path){
    let snapshot;
    await env.withSecurityRulesDisabled(async ctx=>{
      snapshot=await getDoc(doc(ctx.firestore(),path));
    });
    assert.equal(snapshot.exists(),true,'Server document missing: '+path);
    return snapshot.data();
  }

  // Serve only public original HTML/modules locally, and never real Firebase
  // configuration, npm files, raw data exports, service credentials or Rules.
  const allowed=/^\/(?:features|depokapacitas|staging\/imile-management)\/[A-Za-z0-9/_-]+\.(?:js|mjs|css)$/;
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,origin).pathname;
      if(pathname!=='/index.html'&&pathname!=='/depokapacitas/index.html'&&!allowed.test(pathname)){
        res.writeHead(404);res.end('QA file not allowed');return;
      }
      let source;
      if(pathname==='/features/firestore-bridge.js')source=localBridge;
      else if(pathname==='/depokapacitas/app.js')source=localDepotApp;
      else if(pathname==='/depokapacitas/firebase-config.js')source=localDepotConfig;
      else source=await readFile(new URL('.'+pathname,root),'utf8');
      const type=pathname.endsWith('.html')?'text/html':
        pathname.endsWith('.css')?'text/css':'text/javascript';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8',
        'Cache-Control':'no-store'});
      res.end(source);
    }catch(error){
      res.writeHead(500);res.end('Local synthetic test asset error');
    }
  });
  server.listen(port,host);await once(server,'listening');

  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctxFleet=await browser.newContext();
  const ctxDepot=await browser.newContext();
  // Fail closed if either browser ever attempts an actual cloud Auth/Firestore
  // endpoint, even if the emulator SDK injection is accidentally removed.
  for(const ctx of [ctxFleet,ctxDepot]){
    await ctx.route('**/*',route=>{
      const u=new URL(route.request().url());
      const allowedHost=['127.0.0.1','localhost','www.gstatic.com',
        'cdnjs.cloudflare.com'].includes(u.hostname);
      if(!allowedHost){blockedCloud.push(u.origin);return route.abort();}
      return route.continue();
    });
  }
  const flottaPage=await ctxFleet.newPage();
  const depotPage=await ctxDepot.newPage();
  for(const [label,page] of [['Flotta',flottaPage],
    ['Depo pre-auth session',depotPage]]){
    page.on('pageerror',e=>errors.push(label+': '+String(e.message).slice(0,240)));
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.fleetSimpleLogin==='function'
      && String(window.fleetSimpleLogin).includes('signInWithEmailAndPassword'),
      null,{timeout:30000});
    await page.locator('#flottaUsername').fill('imilemanagement');
    await page.locator('#flottaPassword').fill(password);
    await page.locator('#flottaLoginSubmit').click();
    await page.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),
      null,{timeout:45000});
  }
  console.log('PASS [B+E]: two isolated signed-in original Fleet sessions; Depot session prepared via real Firebase Auth');

  // Same second browser context, authenticated via a real Fleet login before
  // navigating to the original Depot UI. No fake shell/document injection.
  await depotPage.goto(origin+'/depokapacitas/index.html',{waitUntil:'domcontentloaded'});
  try{
    await depotPage.locator('#shell').waitFor({state:'visible',timeout:35000});
  }catch(error){
    const diagnostic=await depotPage.evaluate(()=>({
      page:location.pathname,body:document.body?.textContent?.slice(0,160),shellPresent:!!document.getElementById('shell'),shellHidden:document.getElementById('shell')?.hidden,
      denied:document.getElementById('denied')?.hidden===false,
      login:document.getElementById('login')?.hidden===false,
      setup:document.getElementById('setup')?.hidden===false,
      error:document.getElementById('loginError')?.textContent?.slice(0,180)
    }));
    console.error('FAIL [B+E]: actual Depot Auth/shell not ready',
      JSON.stringify({diagnostic,errors,blockedCloud}));
    throw error;
  }
  await depotPage.locator('#shell [data-view="sharedFleet"]').click();
  await depotPage.waitForFunction(()=>
    document.getElementById('content')?.textContent
      ?.includes('Eredeti Flotta – szerverről visszaigazolt adat (rev 1)')
    && document.getElementById('content')?.textContent?.includes('ABC123'),
    null,{timeout:20000});
  console.log('PASS [B+E]: actual original Depot UI shows server-confirmed Fleet rev 1 and normalized plate');

  // Real user action in original Fleet form, while original Depot page is open.
  await flottaPage.locator('#vehicleTable button[onclick^="editVehicle"]').first()
    .click();
  await flottaPage.locator('#modal.active #km').fill('99999');
  await flottaPage.locator('#modal.active #vehicleForm button[type="submit"]')
    .click();

  // The source identity archive is deliberately read-only before a
  // privileged, verified seal. The browser must NOT be able to change KM
  // (or normalized DA/plate arrays) in the old unsealed source.
  await flottaPage.waitForFunction(oldKm=>{
    const car=typeof vehicles!=='undefined'&&vehicles.find(v=>v.rendszam==='ABC-123');
    return !!car && car.km===oldKm &&
      document.getElementById('syncStatus')?.textContent?.includes('csak olvasható');
  },fleetData.vehicles[0].km,{timeout:20000});
  const persisted=await serverRead('flottaSharedState/current');
  assert.equal(persisted.revision,1,'preseal source revision must stay frozen');
  assert.equal(persisted.vehicles[0].km,fleetData.vehicles[0].km);
  assert.deepEqual(persisted.vehicles[0].history,fleetData.vehicles[0].history);
  assert.deepEqual(persisted.fuelCards,fleetData.fuelCards);
  assert.deepEqual(persisted.contacts,fleetData.contacts);
  assert.equal(persisted.drivers[0].kapacitas,80);
  assert.equal(persisted.migrationSourceSha256,sourceSha);
  assert.ok((await depotPage.locator('#content').innerText())
    .includes('Eredeti Flotta – szerverről visszaigazolt adat (rev 1)'));
  console.log('PASS DENY [B+E]: preseal original Fleet form edit is read-only, no phantom save or archived source drift');

  // A booking is deliberately FORBIDDEN before trusted sealed migration
  // (#147). This synthetic, privileged local-emulator-only dry-run creates
  // FULL RICH keyed masters from server-confirmed post-edit Fleet source,
  // checks parity, and marks source sealed ONLY AFTER keyed reads match.
  // This is a test fixture, NOT a browser ability to seal or a live import.
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    const sourceRef=doc(admin,'flottaSharedState','current');
    const confirmed=(await getDoc(sourceRef)).data();
    assert.equal(confirmed.revision,1);
    const driver=confirmed.drivers[0],vehicle=confirmed.vehicles[0];
    assert.equal(driver.daCode,'DA0001');
    assert.equal(vehicle.rendszam,'ABC-123');
    await setDoc(doc(admin,'flottaDrivers','DA0001'),{...driver,revision:1});
    await setDoc(doc(admin,'flottaVehicles','ABC123'),{...vehicle,revision:1});
    const [readD,readV]=await Promise.all([
      getDoc(doc(admin,'flottaDrivers','DA0001')),
      getDoc(doc(admin,'flottaVehicles','ABC123'))
    ]);
    assert.equal(readD.data().kapacitas,80,'trusted seed driver capacity parity');
    assert.deepEqual(readV.data().history,confirmed.vehicles[0].history,
      'trusted seed rich vehicle history parity');
    await setDoc(sourceRef,{...confirmed,sealed:true});
  });
  console.log('PASS [B+E]: synthetic privileged post-import rich keyed parity verified before immutable seal');

  // Real booking through original Depot planning UI; tomorrow is deliberate:
  // same-day bookings additionally require a trusted Attendance clearance
  // publisher, which this synthetic test cannot manufacture as a browser.
  await depotPage.locator('#shell [data-view="planning"]').click();
  await depotPage.locator('#content form[data-form="booking"]')
    .waitFor({state:'visible',timeout:20000});
  const today=await depotPage.locator('#datePick').inputValue();
  assert.match(today,/^\d{4}-\d{2}-\d{2}$/);
  const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000)
    .toISOString().slice(0,10);
  await depotPage.locator('#datePick').fill(tomorrow);
  await depotPage.locator('#datePick').dispatchEvent('change');
  const form=depotPage.locator('#content form[data-form="booking"]');
  await form.locator('select[name="driverId"]').selectOption('DA0001');
  await form.locator('select[name="vehicleId"]').selectOption('ABC123');
  await form.locator('input[name="district"]').fill('IX');
  await form.locator('select[name="status"]').selectOption('planned');
  await form.locator('button[type="submit"]').click();

  await depotPage.waitForFunction(()=>
    document.getElementById('content')?.textContent
      ?.includes('Napi foglalások · 1')
    && document.getElementById('content')?.textContent?.includes('ABC123'),
    null,{timeout:20000});
  const saved=await serverRead('bookings/'+tomorrow+'__ABC123');
  const claimed=await serverRead('driverClaims/'+tomorrow+'__DA0001');
  assert.equal(saved.driverId,'DA0001');
  assert.equal(saved.vehicleId,'ABC123');
  assert.equal(saved.capacity,80,'Canonical source capacity; never legacy mirror');
  assert.equal(saved.driverIndex,0);
  assert.equal(saved.vehicleIndex,0);
  assert.equal(saved.district,'IX');
  assert.equal(claimed.bookingId,tomorrow+'__ABC123');
  assert.equal(claimed.driverId,'DA0001');
  const afterBooking=await serverRead('flottaSharedState/current');
  assert.equal(afterBooking.revision,1,'Booking must not rewrite Fleet revision');
  assert.equal(afterBooking.migrationSourceSha256,sourceSha);
  assert.deepEqual(errors,[],'No hidden JS exceptions in actual app UIs');
  assert.deepEqual(blockedCloud,[],'No real Firebase cloud/prod network access');
  console.log('PASS [B+E]: ACTUAL Depot UI submitted next-day booking under unchanged Rules; Firestore canonical booking+claim verified at capacity 80, Fleet SHA unchanged');

  // POST-SEAL ACCEPTANCE: unlike the earlier pre-cutover edit, a sealed
  // original Fleet edit must write live keyed master AND the second isolated
  // real browser must read the updated master (not the archived old array).
  // This intentionally exposes the remaining keyed listener/readback gap.
  const secondFleetPage=await ctxDepot.newPage();
  secondFleetPage.on('pageerror',e=>errors.push('Second Fleet: '+String(e.message).slice(0,240)));
  await secondFleetPage.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await secondFleetPage.waitForFunction(()=>
    !document.body.classList.contains('flotta-locked'),
    null,{timeout:35000});
  console.log('PASS [B+E] second original Fleet browser authenticated after sealed import');

  await flottaPage.locator('#vehicleTable button[onclick^="editVehicle"]').first().click();
  await flottaPage.locator('#modal.active #km').fill('100100');
  await flottaPage.locator('#modal.active #vehicleForm button[type="submit"]').click();
  let serverKeyed;
  for(let attempt=0;attempt<35;attempt++){
    serverKeyed=await serverRead('flottaVehicles/ABC123');
    if(serverKeyed.km===100100)break;
    await new Promise(r=>setTimeout(r,200));
  }
  assert.equal(serverKeyed.km,100100,
    'POST-SEAL: original HTML form must actually save KM 100100 in rich keyed server master');
  assert.deepEqual(serverKeyed.history,fleetData.vehicles[0].history,
    'POST-SEAL: original rich vehicle history must survive real HTML form save');
  console.log('PASS [B+E] first browser original Fleet HTML form saved keyed KM 100100 with rich history');
  await secondFleetPage.waitForFunction(()=>
    typeof vehicles!=='undefined' &&
    vehicles.some(v=>v.rendszam==='ABC-123'&&v.km===100100),
    null,{timeout:12000});
  console.log('PASS [B+E] SECOND signed-in original Fleet browser sees updated KEYED KM 100100 without reload');

  // V1 actual postseal operational acceptance: update the REAL original
  // Fleet driver capacity form and verify the actual Depot shared Fleet screen
  // sees it, then the booking server stores the CURRENT keyed capacity.
  const editDriverButton=flottaPage.locator('#driverTable button[onclick^="editDriver"]').first();
  await editDriverButton.click();
  await flottaPage.locator('#driverModal.active #driverCapacity').fill('70');
  await flottaPage.locator('#driverModal.active #driverForm button[type="submit"]').click();
  let currentDriver;
  for(let attempt=0;attempt<40;attempt++){
    currentDriver=await serverRead('flottaDrivers/DA0001');
    if(currentDriver.kapacitas===70)break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(currentDriver.kapacitas,70,
    'POSTSEAL: original Fleet driver form must actually change keyed capacity 80→70');
  await depotPage.locator('#shell [data-view="sharedFleet"]').click();
  await depotPage.waitForFunction(()=>
    document.getElementById('content')?.textContent?.includes('Élő, szerverről igazolt keyed Flotta-törzs.')&&
    document.getElementById('content')?.textContent?.includes('70'),
    null,{timeout:25000});
  console.log('PASS [B+E]: original driver capacity 80→70 reaches ACTUAL Depot shared Fleet UI automatically');

  // An existing future booking stores its original 80, but next-day planning
  // must recalculate against today's LIVE driver master (70), without
  // mutating the previously committed Firestore booking.
  await depotPage.locator('#shell [data-view="planning"]').click();
  // The prior booking UI selected TOMORROW. Forecast always looks one day
  // ahead of the current date picker, so restore the original base day.
  await depotPage.locator('#datePick').fill(today);
  await depotPage.locator('#datePick').dispatchEvent('change');
  await depotPage.waitForFunction(()=>{
    const panel=document.getElementById('nextDayForecast');
    return [...(panel?.querySelectorAll('.kpi')||[])].some(k=>
      k.querySelector('.name')?.textContent?.trim()==='Tervezett kapacitás'&&
      k.querySelector('.number')?.textContent?.trim()==='70');
  },null,{timeout:20000});
  assert.equal((await serverRead('bookings/'+tomorrow+'__ABC123')).capacity,80);
  console.log('PASS [B+E]: CURRENT next-day planning counts original booked 80 as live keyed 70 without rewriting history');

  // The original Fleet's real quick status SELECT is a production user event.
  // A service vehicle must DISAPPEAR from Depot booking options immediately.
  await flottaPage.locator('#vehicleTable select[onchange^="quickStatusChange"]').first()
    .selectOption('szerviz');
  let vehicleDuringService;
  for(let attempt=0;attempt<40;attempt++){
    vehicleDuringService=await serverRead('flottaVehicles/ABC123');
    if(vehicleDuringService.status==='szerviz')break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(vehicleDuringService.status,'szerviz');
  await depotPage.locator('#shell [data-view="planning"]').click();
  await depotPage.waitForFunction(()=>{
    const sel=document.querySelector('#content form[data-form="booking"] select[name="vehicleId"]');
    return !!sel && ![...sel.options].some(o=>o.value==='ABC123');
  },null,{timeout:25000});
  console.log('PASS [B+E]: service car is NOT bookable from original Depot UI');

  await flottaPage.locator('#vehicleTable select[onchange^="quickStatusChange"]').first()
    .selectOption('aktiv');
  let restored;
  for(let attempt=0;attempt<40;attempt++){
    restored=await serverRead('flottaVehicles/ABC123');
    if(restored.status==='aktiv')break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(restored.status,'aktiv');
  // The previously used day ALREADY has an 80-parcel confirmed booking;
  // its car must remain reserved even after being restored from service.
  // Check the restored vehicle on a genuinely unoccupied future day.
  const laterDay=new Date(Date.parse(today+'T12:00:00Z')+2*86400000)
    .toISOString().slice(0,10);
  await depotPage.locator('#datePick').fill(laterDay);
  await depotPage.locator('#datePick').dispatchEvent('change');
  try {
    await depotPage.waitForFunction(()=>{
      const sel=document.querySelector('#content form[data-form="booking"] select[name="vehicleId"]');
      return !!sel && [...sel.options].some(o=>o.value==='ABC123');
    },null,{timeout:25000});
  } catch (error) {
    const diagnostic=await depotPage.evaluate(()=>({
      path:location.pathname,
      live:document.getElementById('liveIndicator')?.textContent,
      content:document.getElementById('content')?.textContent?.slice(0,650),
      vehicleOptions:[...document.querySelectorAll('#content form[data-form="booking"] select[name="vehicleId"] option')]
        .map(x=>({value:x.value,text:x.textContent})),
      shellHidden:document.getElementById('shell')?.hidden
    }));
    console.error('POSTSEAL RESTORE DEPOT DIAGNOSTIC',
      JSON.stringify({keyedVehicleStatus:restored?.status,diagnostic,errors}));
    throw error;
  }
  console.log('PASS [B+E]: restored vehicle becomes available in Depot booking list without reload');

  // Use a distinct future day; earlier 80-capacity booking is immutable.
  // This tests a NEW booking with 70, never rewrites a historical 80 snapshot.
  const secondBooking=depotPage.locator('#content form[data-form="booking"]');
  await secondBooking.locator('select[name="driverId"]').selectOption('DA0001');
  await secondBooking.locator('select[name="vehicleId"]').selectOption('ABC123');
  await secondBooking.locator('input[name="district"]').fill('IX');
  await secondBooking.locator('select[name="status"]').selectOption('planned');
  await secondBooking.locator('button[type="submit"]').click();
  await depotPage.waitForFunction(()=>
    document.getElementById('content')?.textContent?.includes('Napi foglalások · 1'),
    null,{timeout:25000});
  const newBooking=await serverRead('bookings/'+laterDay+'__ABC123');
  assert.equal(newBooking.capacity,70,
    'POSTSEAL new Depot booking must use fresh server-keyed 70, not archived 80');
  assert.equal((await serverRead('bookings/'+tomorrow+'__ABC123')).capacity,80,
    'Existing earlier booking historical record must preserve original snapshot');
  console.log('PASS [B+E]: ACTUAL Depot booking transaction stores 70 after Fleet 80→70, earlier 80 snapshot intact');

  // A disconnected Depot may not present stale sealed masters as bookable.
  await ctxDepot.setOffline(true);
  await depotPage.waitForFunction(()=>{
    const badge=document.getElementById('liveIndicator');
    const select=document.querySelector('#content form[data-form="booking"] select[name="vehicleId"]');
    return badge?.textContent?.includes('zárolva')&&
      (!select||![...select.options].some(o=>o.value==='ABC123'));
  },null,{timeout:20000});
  console.log('PASS [B+E]: offline Depot blocks previously live keyed car');
  await ctxDepot.setOffline(false);

  // Server-side revoked user must not regain operational access on reload.
  // This is a synthetic privileged admin-only fixture update, not a UI bypass.
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'users',result.localId),
      {name:'SYNTHETIC REVOKED',active:false,role:'admin'});
  });
  await depotPage.reload({waitUntil:'domcontentloaded'});
  await depotPage.locator('#denied').waitFor({state:'visible',timeout:30000});
  console.log('PASS [B+E]: revoked user cannot access original Depot on reload');



  await flottaPage.locator('#flottaLogout').click();
  await flottaPage.waitForFunction(()=>
    document.body.classList.contains('flotta-locked'),
    null,{timeout:15000});
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}