/**
 * Headless, read-only browser smoke for the OFFLINE / NO-GO original Fleet+Depot
 * bundle. Run AFTER build-v1-core.mjs. Never uses live Firebase/auth, Sheets,
 * Apps Script, remote JS, or a production URL. This is a UI-shell smoke only;
 * it is NOT a signed-in, cross-device or production acceptance test.
 *
 * Node 24 + preinstalled Chromium/Google Chrome; no new dependencies.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {join,resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dirname,'../..');
const artifact=join(root,'candidate-imile-v1-core');
const gateFile=join(artifact,'V1_QA_ONLY_NO_RELEASE.json');
assert.ok(existsSync(gateFile),'Build the offline artifact first: node staging/imile-management/build-v1-core.mjs');
const gate=JSON.parse(readFileSync(gateFile,'utf8'));
assert.equal(gate.status,'BLOCKED','Browser smoke must not test a deployable artifact');
assert.equal(gate.ownerReleaseApproved,false);

function chromeBinary(){
  for(const candidate of [
    process.env.CHROME_BIN, 'google-chrome','google-chrome-stable',
    'chromium','chromium-browser'
  ].filter(Boolean)){
    const probe=spawnSync(candidate,['--version'],{encoding:'utf8',timeout:4000});
    if(probe.status===0)return candidate;
  }
  throw Error('Headless Chromium missing; CI must provide a browser (never silently skip this test)');
}
const browser=chromeBinary();
const requested=new Set(),missing=new Set();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8'};
const server=createServer((req,res)=>{
  let route;
  try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}
  catch{res.writeHead(400).end();return;}
  if(route==='/favicon.ico'){res.writeHead(204).end();return;}
  let path=resolve(artifact,'.'+route);
  if(path!==artifact&&!path.startsWith(artifact+sep)){
    res.writeHead(403).end();return;
  }
  if(existsSync(path)&&statSync(path).isDirectory())path=join(path,'index.html');
  requested.add(route);
  // No remote script, Firebase call, cookies or live account login is allowed.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; "+
    "style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; "+
    "form-action 'none'; frame-src 'none'");
  res.setHeader('Cache-Control','no-store');
  if(!existsSync(path)||!statSync(path).isFile()){
    missing.add(route);
    res.writeHead(404).end('Not bundled: '+route);
    return;
  }
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});
  res.end(readFileSync(path));
});

function runChrome(url,profile){
  return new Promise((done,reject)=>{
    const args=[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--disable-extensions','--disable-background-networking','--no-first-run',
      '--no-default-browser-check','--hide-scrollbars','--virtual-time-budget=2200',
      '--dump-dom','--user-data-dir='+profile,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',url
    ];
    const child=spawn(browser,args,{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',finished=false;
    const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Chromium smoke timeout: '+url));},25000);
    function finish(err){
      if(finished)return;finished=true;clearTimeout(timeout);
      err?reject(err):done({stdout,stderr});
    }
    child.stdout.on('data',data=>{stdout+=data.toString();if(stdout.length>2_500_000)child.kill('SIGKILL');});
    child.stderr.on('data',data=>{stderr+=data.toString().slice(0,2048);});
    child.on('error',finish);
    child.on('close',code=>{
      if(code!==0)return finish(Error('Chromium exited '+code+': '+stderr.slice(-2000)));
      finish();
    });
  });
}

await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const port=server.address().port;
const profile=mkdtempSync(join(tmpdir(),'imile-core-browser-'));
try{
  const pages=[
    ['/index.html',/id="flottaLoginScreen"/,/Flotta Nyilvántartó/],
    ['/depokapacitas/index.html',/id="setup"/,/DepóKapacitás/],
    ['/staging/imile-management/index.html',/id="fleetLink"/,/id="depoLink"/],
    ['/depokapacitas/parcel-preview.html',/<html/i,/Csomag/i]
  ];
  for(const [route,marker,label] of pages){
    const {stdout}=await runChrome('http://127.0.0.1:'+port+route,profile);
    assert.match(stdout,marker,'Missing browser DOM marker: '+route);
    assert.match(stdout,label,'Missing browser page content: '+route);
    if(route.includes('staging/imile-management/index.html')){
      assert.doesNotMatch(stdout,/href="\.\/reports\/index\.html"/,
        'Deferred reporting link visible in bundled hub');
      assert.match(stdout,/href="\.\.\/\.\.\/index\.html" id="fleetLink"/,
        'Hub must navigate to the original Fleet, not the prototype');
    }
    console.log('PASS Chromium offline UI-shell: '+route);
  }
  assert.deepEqual([...missing],[],'Bundle requested missing local HTTP assets: '+[...missing].join(', '));
  assert.ok(requested.has('/features/firestore-bridge.js'),
    'Chromium did not load the original Fleet shared bridge');
  assert.ok(requested.has('/depokapacitas/style.css'),
    'Chromium did not load the packaged Depot stylesheet');
  console.log('PASS original Fleet + Depot browser shell; no external service requests (CSP); NO-GO remains');
}finally{
  await new Promise(resolve=>server.close(resolve));
  rmSync(profile,{recursive:true,force:true});
}
