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
const forbiddenLegacy=[];
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
    const pathname=url.split('?')[0];
    forbiddenRequests.push(pathname);
    if(pathname.includes('script.google.com/macros/s/')||pathname.includes('script.googleusercontent.com'))forbiddenLegacy.push(pathname);
    route.abort();
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
  // ACTUAL original index.html + real bridge, not a mock of gateOldSync.
  // Both old function names must already be replaced before Auth SDK loads.
  // An old direct pushRemote() function has no session guard; the bridge must
  // therefore intercept even manually scheduled historical callbacks.
  assert.equal(await page.evaluate(()=>String(window.pushRemote).includes('Régi Apps Script írás letiltva')),true,
    'Legacy writer must be replaced before any Firebase login');
  assert.equal(await page.evaluate(()=>String(window.pullRemote).includes('Régi Apps Script olvasás letiltva')),true,
    'Legacy reader must be replaced before any Firebase login');
  await page.evaluate(()=>{
    window.pushRemote();window.pullRemote();
    setTimeout(()=>window.pushRemote(),25);
    setTimeout(()=>window.pullRemote(),40);
  });
  await page.waitForTimeout(180);
  assert.deepEqual(forbiddenLegacy,[],'Old reader/writer forbidden before sign-in');
  const before=await page.evaluate(()=>localStorage.getItem('flotta_nyilvantarto_v16'));
  // Invalid credential must never switch the legacy writer back on.
  await page.locator('#flottaUsername').fill('imilemanagement');
  await page.locator('#flottaPassword').fill('synthetic-invalid-password');
  await page.locator('#flottaLoginSubmit').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('flotta-locked')),true,
    'Wrong synthetic password must not unlock real original Fleet');
  await page.evaluate(()=>{window.pushRemote();window.pullRemote();});
  await page.waitForTimeout(100);
  assert.deepEqual(forbiddenLegacy,[],'Bad Auth must not call Apps Script');
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
  const after=await page.evaluate(()=>localStorage.getItem('flotta_nyilvantarto_v16'));
  assert.equal(after,before,'Pre-import legacy Fleet snapshot must remain unchanged');
  await page.evaluate(()=>window.save());
  assert.equal(await page.evaluate(()=>localStorage.getItem('flotta_pending_v16')),null,
    'Original save() must not create preimport pending data');
  assert.equal(forbiddenRequests.length,0,
    'Original Fleet must not call Apps Script/unknown host: '+forbiddenRequests.join(','));
  // Even an authenticated pre-import session must not call the old endpoint.
  await page.evaluate(()=>{
    window.pushRemote();window.pullRemote();
    setTimeout(()=>window.pushRemote(),20);
  });
  await page.waitForTimeout(150);
  assert.deepEqual(forbiddenLegacy,[],'Signed-in browser attempted legacy writer');
  // Simulate a temporary offline period in a fully loaded REAL browser page.
  await context.setOffline(true);
  await page.evaluate(()=>{window.pushRemote();window.pullRemote();});
  await page.waitForTimeout(100);
  assert.deepEqual(forbiddenLegacy,[],'Offline original Fleet called Apps Script');
  await context.setOffline(false);
  // The HTML must patch the writer again after a hard page reload while a
  // former sessionStorage login still exists and Auth is being restored.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.pushRemote==='function'&&
    String(window.pushRemote).includes('Régi Apps Script írás letiltva'),null,{timeout:15000});
  await page.evaluate(()=>{window.pushRemote();window.pullRemote();});
  await page.waitForTimeout(150);
  assert.deepEqual(forbiddenLegacy,[],'Reload restored legacy Apps Script calls');
  console.log('PASS [B+E]: REAL original Fleet + actual bridge forbids legacy read/write on forged old session, bad login, signed-in, queued callback, offline and reload');
  console.log('PASS [B+E]: REAL original Fleet pre-import is read-only, no Apps Script calls or remote overwrite');
  await page.waitForFunction(()=>!document.body.classList.contains('flotta-locked'),null,{timeout:35000});
  await page.locator('#flottaLogout').click();
  await page.waitForFunction(()=>document.body.classList.contains('flotta-locked'),
    null,{timeout:15000});
  await page.evaluate(()=>{window.pushRemote();window.pullRemote();});
  await page.waitForTimeout(100);
  assert.deepEqual(forbiddenLegacy,[],'Logout re-enabled Apps Script');
  assert.equal(errors.length,0,'Fleet page errors: '+errors.join('; '));
  console.log('PASS [B+E]: REAL Fleet UI logout re-locks with no JS page errors');
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}
