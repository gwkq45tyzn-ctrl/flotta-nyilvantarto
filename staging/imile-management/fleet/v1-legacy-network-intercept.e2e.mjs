/**
 * #186 REAL original HTML stale browser vs integrated legacy bridge.
 * Browser loads a synthetic in-memory copy ONLY, with the historic Apps Script
 * endpoint replaced by an interceptor-only FAKE URL. Every nonlocal request
 * is blocked or fulfilled locally: no live Google account, URL or write.
 *
 * This demonstrates why a browser-local sync gate cannot disable an
 * independently deployed obsolete Fleet HTML page. Deployment is UNKNOWN.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {chromium} from 'playwright';

const root=new URL('../../../',import.meta.url);
const host='127.0.0.1',port=8137;
const origin='http://'+host+':'+port;
const fakeUrl='https://script.google.com/macros/s/SYNTHETIC_QA_NO_NETWORK/exec';
const rawHtml=await readFile(new URL('index.html',root),'utf8');
const endpointAnchor=/const DEFAULT_BACKEND_URL\s*=\s*[^\n]+/;
assert.match(rawHtml,endpointAnchor);
const sandboxHtml=rawHtml.replace(endpointAnchor,
  "const DEFAULT_BACKEND_URL = '"+fakeUrl+"';");
assert.ok(sandboxHtml.includes("const DEFAULT_BACKEND_URL = '"+fakeUrl+"'"));
const bridgeTag='<script src="features/firestore-bridge.js"></script>';
assert.ok(sandboxHtml.includes(bridgeTag));
const staleHtml=sandboxHtml.replace(bridgeTag,'<!-- OLD UNBRIDGED HTML TEST ONLY -->');
const assets=new Set([
  '/features/firestore-bridge.js',
  '/features/in-use-vehicles-v23.js',
  '/features/active-driver-assignment-v25.js',
  '/features/wide-layout-v24.js',
  '/features/vehicle-groups-v27.js'
]);
let browser,server;
try{
  server=createServer(async(req,res)=>{
    try{
      const path=new URL(req.url,origin).pathname;
      let contents,type='text/javascript';
      if(path==='/stale.html'){contents=staleHtml;type='text/html';}
      else if(path==='/integrated.html'){contents=sandboxHtml;type='text/html';}
      else if(assets.has(path))
        contents=await readFile(new URL('.'+path,root),'utf8');
      else {res.writeHead(404);res.end('QA asset refused');return;}
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8',
        'Cache-Control':'no-store','X-Robots-Tag':'noindex'});
      res.end(contents);
    }catch(e){res.writeHead(500);res.end('QA server error');}
  });
  server.listen(port,host);
  await once(server,'listening');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const attempts=[];
  async function tryLegacy(path){
    const context=await browser.newContext({serviceWorkers:'block'});
    const outgoing=[];
    await context.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin===origin){await route.continue();return;}
      // The synthetic Apps Script endpoint must be intercepted here rather
      // than sent to Google. Never reveal or call original real URL.
      if(u.hostname==='script.google.com'&&u.pathname===
           '/macros/s/SYNTHETIC_QA_NO_NETWORK/exec'){
        const rec={path,method:req.method(),urlKind:'intercepted-synthetic-apps-script'};
        outgoing.push(rec);attempts.push(rec);
        await route.fulfill({status:200,contentType:'text/javascript',
          body:'/* synthetic no-op, no request went to Google */'});
        return;
      }
      // Includes Firebase CDN: no service, Auth, Sheet or Apps Script access.
      await route.abort('blockedbyclient');
    });
    const page=await context.newPage();
    try{
      await page.goto(origin+path,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof window.pushRemote==='function',
        null,{timeout:15000});
      const before=await page.evaluate(()=>String(window.pushRemote));
      if(path==='/stale.html'){
        assert.match(before,/fetch\(backendUrl/);
      }else{
        await page.waitForFunction(()=>
          String(window.pushRemote).includes('Régi Apps Script írás letiltva'),
          null,{timeout:15000});
      }
      // Intentionally ask the obsolete browser to perform its historic POST.
      // The fake URL is served only through this Playwright interceptor.
      await page.evaluate(()=>{window.pushRemote();return true;});
      await page.waitForTimeout(1100);
      const postCount=outgoing.filter(x=>x.method==='POST').length;
      if(path==='/stale.html')assert.equal(postCount,1,
        'OLD HTML still has executable Apps Script POST (intercepted fake only)');
      else assert.equal(postCount,0,
        'Integrated bridge must suppress all legacy POST attempts');
      return {pageType:path,interceptedLegacyPosts:postCount,
        forbiddenExternalCalls:0};
    }finally{
      await context.close();
    }
  }
  const unbridged=await tryLegacy('/stale.html');
  const bridged=await tryLegacy('/integrated.html');
  assert.equal(unbridged.interceptedLegacyPosts,1);
  assert.equal(bridged.interceptedLegacyPosts,0);
  assert.equal(attempts.filter(x=>x.method==='POST').length,1);
  console.log(JSON.stringify({scope:'BROWSER_ONLY_NO_LIVE_NETWORK',
    unbridged,bridged,liveScriptDeploymentVerified:false,
    productionCutoverAuthorized:false,status:'PASS_SYNTHETIC_ONLY'}));
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
