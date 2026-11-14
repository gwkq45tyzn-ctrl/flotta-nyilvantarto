/**
 * Two Chromium sessions save and read an OFD performance snapshot through
 * the real report page and original restricted Rules. Local emulators only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {ofd} from '../reports/report-core.mjs';
import {writeReportXlsx} from '../reports/xlsx-lite.mjs';

const host='127.0.0.1',port=8137,projectId='demo-imile-qa';
const origin='http://'+host+':'+port;
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(16).toString('hex')+'#';
const root=new URL('../../../',import.meta.url);
const rulesRaw=await readFile(new URL('depokapacitas/firestore-v1-restricted.rules',root),'utf8');
const header=['OFD Date','DA','DA Code','Vendor','Station','OFD','Delivered'];
const row=(delivered,day='2026-11-14')=>[day,'Synthetic Courier','DA9001','SYN VENDOR','DS-A',10,delivered];
function workbook(delivered,day){
  const matrix=[header,row(delivered,day)];
  const report=ofd(matrix);
  assert.equal(report.status,'ready',JSON.stringify(report.issues));
  return Buffer.from(writeReportXlsx(matrix,report));
}
const first=workbook(8);
const changed=workbook(9);
const hostile=(()=>{const matrix=[header,['2026-11-14','Synthetic Courier','DA9001','SYN VENDOR','DS-A',4,9]];
  const report=ofd(matrix);assert.equal(report.status,'blocked');return null;})();
assert.equal(hostile,null);

const bridgeRaw=await readFile(new URL('features/firestore-bridge.js',root),'utf8');
const localBridge=bridgeRaw.replace(/const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/,
  "const FIREBASE_CONFIG = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-fleet'};"
).replace('db = initializedDb;','db = initializedDb;\n      auth.useEmulator(\'http://127.0.0.1:9099\');\n      db.useEmulator(\'127.0.0.1\',8787);');
const reportRaw=await readFile(new URL('staging/imile-management/reports/report-app.mjs',root),'utf8');
const localReport=reportRaw
  .replace("import {getAuth,onAuthStateChanged}","import {getAuth,onAuthStateChanged,connectAuthEmulator}")
  .replace("import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,\n orderBy,limit,runTransaction,serverTimestamp}",
    "import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,\n orderBy,limit,runTransaction,serverTimestamp,connectFirestoreEmulator}")
  .replace("if(firebaseConfig.projectId!=='imile-management-staging')","if(firebaseConfig.projectId!=='demo-imile-qa')")
  .replace('db=getFirestore(app);',"db=getFirestore(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8787);");
const localConfig="export const firebaseConfig = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-reports'};";

let env,server,browser,uid;
const blocked=[];
try{
  const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const account=await signup.json();
  assert.equal(signup.ok,true,JSON.stringify(account));
  uid=account.localId;
  env=await initializeTestEnvironment({projectId,firestore:{host,port:8787,
    rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}});
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'users',uid),{name:'SYNTHETIC OFD ADMIN',active:true,role:'admin'});
  });
  const allowed=/^\/(?:features|depokapacitas|staging\/imile-management)\/[A-Za-z0-9/_-]+\.(?:js|mjs|css|html)$/;
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,origin).pathname;
      if(pathname!=='/index.html'&&!allowed.test(pathname)){res.writeHead(404);res.end('no');return;}
      let source;
      if(pathname==='/features/firestore-bridge.js')source=localBridge;
      else if(pathname==='/depokapacitas/firebase-config.js')source=localConfig;
      else if(pathname==='/staging/imile-management/reports/report-app.mjs')source=localReport;
      else source=await readFile(new URL('.'+pathname,root),'utf8');
      const type=pathname.endsWith('.html')?'text/html':pathname.endsWith('.css')?'text/css':'text/javascript';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});
      res.end(source);
    }catch{res.writeHead(500);res.end('asset');}
  });
  server.listen(port,host);await once(server,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const contextA=await browser.newContext();
  const contextB=await browser.newContext();
  for(const ctx of [contextA,contextB]){
    await ctx.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(!['127.0.0.1','localhost','www.gstatic.com','cdnjs.cloudflare.com'].includes(url.hostname)){
        blocked.push(url.origin);return route.abort();
      }
      return route.continue();
    });
  }
  async function openReports(page){
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('#flottaUsername').fill('imilemanagement');
    await page.locator('#flottaPassword').fill(password);
    await page.locator('#flottaLoginSubmit').click();
    await page.locator('#flottaUnifiedLinks a[href="./staging/imile-management/reports/index.html"]').click();
    await page.locator('#controls').waitFor({timeout:30000});
    await page.locator('#saveOptions').waitFor({timeout:15000});
  }
  async function prepare(page,buffer,name){
    await page.locator('#kind').selectOption('ofd');
    await page.locator('#file').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await page.locator('#prepare').click();
    await page.locator('#save').waitFor();
    await page.waitForFunction(()=>document.querySelector('#save')&&!document.querySelector('#save').disabled,{timeout:15000});
  }
  const pageA=await contextA.newPage();
  const pageB=await contextB.newPage();
  pageA.on('pageerror',error=>blocked.push('pageA:'+error.message));
  pageB.on('pageerror',error=>blocked.push('pageB:'+error.message));
  await openReports(pageA);
  await openReports(pageB);
  await prepare(pageA,first,'ofd-provisional.xlsx');
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/jóváhagyást/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:10000});
  let stored;
  await env.withSecurityRulesDisabled(async ctx=>{
    stored=await getDoc(doc(ctx.firestore(),'performanceDays','2026-11-14__DS-A'));
  });
  assert.equal(stored.exists(),false,'unchecked approval must not write');
  console.log('PASS DENY [B]: OFD save without approval checkbox writes nothing');

  await pageA.locator('#approve').check();
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/Sikeres mentés/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:20000});
  await pageB.locator('#refreshStats').click();
  await pageB.waitForFunction(()=>(document.querySelector('#courierStats')?.textContent||'').includes('DA9001'),{timeout:15000});
  const seen=await pageB.locator('#courierStats').innerText();
  assert.match(seen,/DA9001/);
  assert.match(seen,/10/);
  assert.match(seen,/8/);
  console.log('PASS [B+E]: browser A saved provisional OFD; browser B read DA9001 10/8 from the server');

  await prepare(pageA,changed,'ofd-changed.xlsx');
  await pageA.locator('#approve').check();
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/már van riport/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:20000});
  console.log('PASS DENY [B]: changed OFD without replace approval does not overwrite');

  await pageA.locator('#replaceApproved').check();
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/Sikeres mentés/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:20000});
  await env.withSecurityRulesDisabled(async ctx=>{
    stored=await getDoc(doc(ctx.firestore(),'performanceDays','2026-11-14__DS-A'));
  });
  assert.equal(stored.data().version,2);
  assert.equal(stored.data().totalDelivered,9);
  assert.equal(stored.data().status,'provisional');
  console.log('PASS [E]: replace writes version 2 and delivered 9');

  await pageA.locator('#reportState').selectOption('final');
  await pageA.locator('#approve').check();
  await pageA.locator('#replaceApproved').check();
  await pageA.locator('#confirmFinal').check();
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/Sikeres mentés/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:20000});
  await prepare(pageA,first,'ofd-downgrade.xlsx');
  await pageA.locator('#reportState').selectOption('provisional');
  await pageA.locator('#approve').check();
  await pageA.locator('#replaceApproved').check();
  await pageA.locator('#save').click();
  await pageA.waitForFunction(()=>/nem minősíthető vissza/.test(document.querySelector('#saveNote')?.textContent||''),{timeout:20000});
  await env.withSecurityRulesDisabled(async ctx=>{
    stored=await getDoc(doc(ctx.firestore(),'performanceDays','2026-11-14__DS-A'));
  });
  assert.equal(stored.data().status,'final');
  assert.equal(stored.data().totalDelivered,9);
  console.log('PASS DENY [B+E]: final OFD cannot be downgraded to provisional');

  await env.withSecurityRulesDisabled(async ctx=>{
    await updateDoc(doc(ctx.firestore(),'users',uid),{role:'viewer'});
  });
  await pageB.reload({waitUntil:'domcontentloaded'});
  await pageB.locator('#controls').waitFor({timeout:20000});
  assert.equal(await pageB.locator('#saveOptions').isHidden(),true);
  const viewer=env.authenticatedContext(uid,{email}).firestore();
  await assertFails(setDoc(doc(viewer,'performanceDays','2026-11-15__DS-A'),{
    key:'2026-11-15__DS-A',date:'2026-11-15',station:'DS-A',status:'provisional',
    rows:[{daCode:'DA9001',daName:'Synthetic Courier',vendor:'SYN VENDOR',ofd:1,delivered:1}],
    totalOFD:1,totalDelivered:1,courierCount:1,contentHash:'a'.repeat(64),
    sourceName:'forged.xlsx',version:1,lastAuditId:'a'.repeat(20),
    createdBy:uid,updatedBy:uid
  }));
  console.log('PASS DENY [E+SDK]: viewer cannot create an OFD snapshot');
  assert.equal(blocked.filter(x=>x.startsWith('http')).length,0,blocked.join(','));
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}
