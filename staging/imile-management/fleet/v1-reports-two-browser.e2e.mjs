/**
 * Two real Chromium Auth sessions: original Fleet navigation to Depot and
 * In-Hub/OFD, then synthetic Excel ingestion. Local emulators only.
 * Does not repeat the already proven 80→70 booking flow.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {inhub} from '../reports/report-core.mjs';
import {writeReportXlsx} from '../reports/xlsx-lite.mjs';

const host='127.0.0.1',port=8136,projectId='demo-imile-qa';
const origin='http://'+host+':'+port;
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const password='QaOnly'+randomBytes(16).toString('hex')+'#';
const root=new URL('../../../',import.meta.url);
const rulesRaw=await readFile(new URL('depokapacitas/firestore-v1-restricted.rules',root),'utf8');
assert.match(rulesRaw,/REPLACE_WITH_REAL_SHARED_UID/);
const header=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode'];
const serialFor=iso=>25569+Math.round((Date.parse(iso+'T00:00:00Z')-Date.UTC(1970,0,1))/86400000);
const seed=inhub([header,['WB-SEED','2026-11-14','Budapest','1097']]);
assert.equal(seed.status,'ready');
const workbook=(rows)=>Buffer.from(writeReportXlsx([header,...rows],seed));
const dayA=serialFor('2026-11-14'),dayB=serialFor('2026-11-15');
const good=workbook([['WB100',dayA,'Budapest','1097']]);
const duplicate=workbook([['WB100',dayA,'Budapest','1097'],['WB100',dayA,'Budapest','1097']]);
const other=workbook([['WB200',dayB,'Dunaharaszti','2330']]);

const bridgeRaw=await readFile(new URL('features/firestore-bridge.js',root),'utf8');
const localBridge=bridgeRaw.replace(/const FIREBASE_CONFIG = \{[\s\S]*?\n  \};/,
  "const FIREBASE_CONFIG = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-fleet'};"
).replace('db = initializedDb;','db = initializedDb;\n      auth.useEmulator(\'http://127.0.0.1:9099\');\n      db.useEmulator(\'127.0.0.1\',8787);');
const depotAppRaw=await readFile(new URL('depokapacitas/app.js',root),'utf8');
const depotInit='const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);';
const localDepotApp=
  "import {connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';\n"+
  "import {connectFirestoreEmulator} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';\n"+
  depotAppRaw.replace(depotInit,depotInit+
    "\n  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});"+
    "\n  connectFirestoreEmulator(db,'127.0.0.1',8787);");
const localConfig="export const firebaseConfig = {apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:local-reports'};";
const reportRaw=await readFile(new URL('staging/imile-management/reports/report-app.mjs',root),'utf8');
const localReport=reportRaw
  .replace("import {getAuth,onAuthStateChanged}","import {getAuth,onAuthStateChanged,connectAuthEmulator}")
  .replace("import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,\n orderBy,limit,runTransaction,serverTimestamp}",
    "import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,\n orderBy,limit,runTransaction,serverTimestamp,connectFirestoreEmulator}")
  .replace("if(firebaseConfig.projectId!=='imile-management-staging')",
    "if(firebaseConfig.projectId!=='demo-imile-qa')")
  .replace('db=getFirestore(app);','db=getFirestore(app);connectAuthEmulator(auth,\'http://127.0.0.1:9099\',{disableWarnings:true});connectFirestoreEmulator(db,\'127.0.0.1\',8787);');
assert.match(localReport,/connectFirestoreEmulator/);
assert.doesNotMatch(localReport,/imile-management-staging/);

let env,server,browser;
const blocked=[];
try{
  const signup=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password,returnSecureToken:true})
  });
  const account=await signup.json();
  assert.equal(signup.ok,true,JSON.stringify(account));
  env=await initializeTestEnvironment({projectId,firestore:{host,port:8787,
    rules:rulesRaw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',account.localId)}});
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'users',account.localId),{
      name:'SYNTHETIC REPORT ADMIN',active:true,role:'admin'
    });
  });
  const allowed=/^\/(?:features|depokapacitas|staging\/imile-management)\/[A-Za-z0-9/_-]+\.(?:js|mjs|css|html)$/;
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,origin).pathname;
      if(pathname!=='/index.html'&&!allowed.test(pathname)){
        res.writeHead(404);res.end('QA file not allowed');return;
      }
      let source;
      if(pathname==='/features/firestore-bridge.js')source=localBridge;
      else if(pathname==='/depokapacitas/app.js')source=localDepotApp;
      else if(pathname==='/depokapacitas/firebase-config.js')source=localConfig;
      else if(pathname==='/staging/imile-management/reports/report-app.mjs')source=localReport;
      else source=await readFile(new URL('.'+pathname,root),'utf8');
      const type=pathname.endsWith('.html')?'text/html':pathname.endsWith('.css')?'text/css':'text/javascript';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});
      res.end(source);
    }catch{
      res.writeHead(500);res.end('Local synthetic test asset error');
    }
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
  async function signIn(page){
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('#flottaUsername').fill('imilemanagement');
    await page.locator('#flottaPassword').fill(password);
    await page.locator('#flottaLoginSubmit').click();
    await page.locator('#flottaUnifiedLinks').waitFor({timeout:45000});
  }
  const pageA=await contextA.newPage();
  const pageB=await contextB.newPage();
  await signIn(pageA);
  await signIn(pageB);
  await pageA.locator('#flottaUnifiedLinks a[href="./depokapacitas/index.html"]').click();
  await pageA.waitForURL(/depokapacitas\/index\.html/,{timeout:20000});
  await pageA.locator('#datePick').waitFor({timeout:30000});
  console.log('PASS [B]: browser A opened the real Depot shell from original Fleet navigation');
  await pageA.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  await pageA.locator('#flottaUnifiedLinks').waitFor({timeout:30000});
  await pageA.locator('#flottaUnifiedLinks a[href="./staging/imile-management/reports/index.html"]').click();
  await pageA.locator('#controls').waitFor({timeout:30000});
  await pageB.goto(origin+'/staging/imile-management/reports/index.html',{waitUntil:'domcontentloaded'});
  await pageB.locator('#controls').waitFor({timeout:30000});
  assert.equal(await pageB.locator('#preview').isHidden(),true);
  async function upload(page,buffer,name){
    await page.locator('#file').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
    await page.locator('#prepare').click();
  }
  await upload(pageA,good,'synthetic-inhub.xlsx');
  await pageA.locator('#summary').waitFor({timeout:15000});
  const summaryA=await pageA.locator('#summary').innerText();
  assert.match(summaryA,/Összes csomag: 1/);
  assert.match(summaryA,/2026-11-14/);
  assert.doesNotMatch(summaryA,/2026-11-13/);
  console.log('PASS [B]: In-Hub serial date renders as 2026-11-14, one package');
  await upload(pageA,duplicate,'synthetic-duplicate.xlsx');
  await pageA.locator('#message').waitFor({timeout:15000});
  await pageA.waitForFunction(()=>document.querySelector('#message')?.textContent?.includes('duplicate_waybill'));
  assert.equal(await pageA.locator('#preview').isHidden(),true);
  assert.equal((await pageA.locator('#summary').innerText()).includes('Összes csomag: 2'),false);
  console.log('PASS [B]: duplicate waybill is blocked and the previous export is not left on screen');
  await upload(pageB,other,'synthetic-other-day.xlsx');
  await pageB.locator('#summary').waitFor({timeout:15000});
  const summaryB=await pageB.locator('#summary').innerText();
  assert.match(summaryB,/2026-11-15/);
  assert.doesNotMatch(summaryB,/2026-11-14/);
  assert.equal(blocked.length,0,'cloud host contacted: '+blocked.join(','));
  console.log('PASS [B]: second Chromium session shows only its own report date');
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(env)await env.cleanup();
}
