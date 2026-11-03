/**
 * Real headless Chromium QA, two INDEPENDENT browser contexts.
 * One uses Firebase compat (original Fleet SDK family), the other modular
 * (Depot SDK family) against LOCAL Auth + Firestore emulators ONLY.
 *
 * Synthetic account, synthetic Fleet documents. No actual product URL or
 * real Firebase service is accessed. This proves SDK interoperability,
 * NOT full original Fleet/Depot UI E2E or production readiness.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc} from 'firebase/firestore';

const project='demo-imile-qa';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='Synthetic'+randomBytes(18).toString('hex')+'#';
const host='127.0.0.1',port=8125;
const documentUrl=new URL('./v1-browser-compat-test.html',import.meta.url);
const html=await readFile(documentUrl);
const rulesRaw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
if(!rulesRaw.includes('REPLACE_WITH_REAL_SHARED_UID'))
  throw Error('V1 release UID placeholder disappeared: NO REAL ACCOUNT ALLOWED');

async function createLocalEmulatorUser(){
  const url='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
  const response=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})});
  const data=await response.json();
  if(!response.ok||!data.localId)
    throw Error('Could not seed LOCAL Auth emulator: '+String(data.error?.message||response.status));
  return data.localId;
}
const wait=async(page,fn,description)=>{
  try{await page.waitForFunction(fn,null,{timeout:45000});}
  catch(error){
    const status=await page.locator('#state').textContent().catch(()=>'<not available>');
    throw Error(description+' failed, UI status='+status,{cause:error});
  }
};
let env,browser,server;
try{
  const uid=await createLocalEmulatorUser();
  env=await initializeTestEnvironment({projectId:project,
    firestore:{host,port:8787,rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}});
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(db,'flottaSharedState','current'),{
      revision:1,vehicles:[],drivers:[],fuelCards:[],contacts:[]
    });
  });

  server=createServer((req,res)=>{
    const url=new URL(req.url,'http://'+host+':'+port);
    if(url.pathname!=='/v1-browser-compat-test.html'){
      res.writeHead(404);res.end('Not found');return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store','X-Robots-Tag':'noindex'});
    res.end(html);
  });
  server.listen(port,host);
  await once(server,'listening');

  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctxCompat=await browser.newContext({acceptDownloads:false});
  const ctxModular=await browser.newContext({acceptDownloads:false});
  const compat=await ctxCompat.newPage();
  const modular=await ctxModular.newPage();
  const pageErrors=[];
  for(const [mode,page]of [['compat',compat],['modular',modular]]){
    page.on('pageerror',error=>pageErrors.push(mode+': '+error.message));
    await page.goto('http://'+host+':'+port+'/v1-browser-compat-test.html?mode='+mode,
      {waitUntil:'domcontentloaded'});
    await wait(page,()=>
      document.getElementById('state')?.textContent==='login-needed',
      mode+' SDK initialization');
    await page.locator('#password').fill(password);
    await page.locator('#login').click();
    await wait(page,()=>
      document.getElementById('state')?.textContent==='connected-server',
      mode+' Auth + confirmed server listener');
    assert.equal(await page.locator('#auth').textContent(),'authenticated');
    assert.equal(await page.locator('#revision').textContent(),'1');
  }
  console.log('PASS [B+E]: two independent real Chromium contexts signed into LOCAL Auth, compat + modular');
  assert.equal(pageErrors.length,0,pageErrors.join('\n'));

  // Browser A transaction produces a server-confirmed event in browser B.
  await compat.locator('#save').click();
  await wait(modular,()=>document.getElementById('revision')?.textContent==='2',
    'cross-SDK server-confirmed onSnapshot');
  assert.equal(await compat.locator('#revision').textContent(),'2');
  console.log('PASS [B+E]: compat write propagated to modular browser without reload');

  // Both edit nearly simultaneously; the SDK transaction must retry conflicts.
  await Promise.all([compat.locator('#save').click(),modular.locator('#save').click()]);
  await Promise.all([compat,modular].map(page=>wait(page,()=>
    document.getElementById('revision')?.textContent==='4',
    'concurrent transaction resolution')));
  const db=env.authenticatedContext(uid,{email}).firestore();
  const confirmed=await getDoc(doc(db,'flottaSharedState','current'));
  assert.equal(confirmed.data().revision,4);
  console.log('PASS [B+E]: parallel writes converged at revision 4; no lost update');

  // Offline must never give a false positive that a write was confirmed.
  await ctxModular.setOffline(true);
  await modular.locator('#save').click();
  await wait(modular,()=>document.getElementById('state')?.textContent==='blocked-offline',
    'offline refusal');
  assert.equal(await compat.locator('#revision').textContent(),'4');
  await ctxModular.setOffline(false);
  console.log('PASS [B+E]: offline client refuses to report successful write');

  assert.deepEqual(pageErrors,[]);
  console.log('PASS real browser synthetic V1 cross-SDK Auth/Firestore interoperability; NOT live cloud E2E');
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}
