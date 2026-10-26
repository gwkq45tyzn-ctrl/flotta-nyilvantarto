const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','apps-script','Index.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const fixture=()=>({vehicles:[{id:'v1',rendszam:'TEST-001',status:'aktiv',history:[]}],fuelCards:[],drivers:[],contacts:[]});
function environment(){
 const nodes=new Map(),store=new Map(),timers=new Map();let timer=0;
 const make=()=>({value:'',textContent:'',innerHTML:'',hidden:false,style:{},dataset:{},children:[],classList:{set:new Set(),add(c){this.set.add(c);},remove(c){this.set.delete(c);},contains(c){return this.set.has(c);},toggle(c,x){if(x)this.add(c);else this.remove(c);}},addEventListener(){},querySelectorAll(){return [];},appendChild(x){this.children.push(x);},replaceChildren(){this.children=[];this.innerHTML='';this.textContent='';},reset(){this.value='';},closest(){return null;},getAttribute(){return null;},hasAttribute(){return false;}});
 for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes.set(m[1],make());
 const document={body:make(),documentElement:{},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},createElement:()=>make(),createTreeWalker:()=>({nextNode:()=>false})};
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const window={alert(){},confirm:()=>true,prompt(){},localStorage:storage,sessionStorage:storage,addEventListener(){},google:{script:{run:{}}}};
 const ctx=vm.createContext({document,window,sessionStorage:storage,localStorage:storage,crypto:crypto.webcrypto,console,NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),setInterval(){},confirm:()=>true,alert(){},Uint8Array,Blob,URL});
 vm.runInContext(code.slice(0,code.lastIndexOf('    // Init')),ctx);
 return {ctx,nodes,document,store,timers,window,run:source=>vm.runInContext(source,ctx),set(name,v){ctx[name]=v;}};
}
test('complete frontend parses, all account/conflict controls exist, old URL-token transport removed',()=>{new vm.Script(code);for(const id of ['flottaPassword','oldFleetPassword','newOwnPassword','flottaConflict','flottaLogin','flottaAccounts'])assert.ok(html.includes('id="'+id+'"'));assert.ok(!code.includes('safeJsonp'));assert.ok(!code.includes('fleetUrl'));assert.ok(!html.includes('onclick="editVehicle(\'${'));assert.ok(!html.includes('configureBackend()'));});
test('stored HTML payloads remain text in every table, history, alert, selection and report',()=>{
 const e=environment(),payload='<img src=x onerror="globalThis.pwned=1"><svg onload=alert(1)>"\'&';
 const data={vehicles:[{id:'v1',rendszam:payload,gyartmany:payload,modell:payload,status:payload,currentDriver:payload,helyszin:payload,megjegyzes:payload,berbeado:payload,alvazszam:payload,muszakiLejarat:'2000-01-01',history:[{id:'h1',date:'2000-01-01',type:payload,who:payload,note:payload}]}],fuelCards:[{id:'c1',number:payload,provider:payload,vehicle:payload,note:payload,expiry:'2000-01-01'}],drivers:[{id:'d1',name:payload,phone:payload,note:payload,since:payload,licenseExpiry:'2000-01-01',history:[{id:'h2',date:'2000-01-01',type:payload,note:payload}]}],contacts:[{id:'k1',ceg:payload,nev:payload,telefon:payload}]};
 e.set('testData',data);e.run('applySnapshot(testData);');
 const calls=['showContacts()','showCardsList()','showDriversList()','filterByStat("all")','showDriverHistory("d1")','showHistory("v1")','showReports()','populateSelects()','populateVehicleSelect()'];
 for(const call of calls){e.run(call);for(const [id,node]of e.nodes){assert.ok(!/<(?:img|svg)\b/i.test(node.innerHTML),`${call}: ${id} contains active injected HTML`);}}
 assert.ok(e.nodes.get('reportsContent').innerHTML.includes('&lt;img'));
 assert.equal(e.run('vehicles[0].rendszam'),payload,'escaping must not change stored data');
});
test('Hungarian and English messages and labels switch without rewriting fleet records',()=>{const e=environment();e.set('testData',fixture());e.run('applySnapshot(testData);setLang("en")');assert.equal(e.run('t("title")'),'Fleet Manager');assert.equal(e.nodes.get('appTitle').textContent,'Fleet Manager');assert.equal(e.run('errorText("CONFLICT")').includes('Someone else'),true);e.run('setLang("hu")');assert.equal(e.nodes.get('appTitle').textContent,'Flotta Nyilvántartó');assert.equal(e.run('vehicles[0].rendszam'),'TEST-001');});
test('unavailable third-party storage does not prevent login UI initialization',()=>{const e=environment();Object.defineProperty(e.window,'sessionStorage',{get(){throw Error('Storage blocked');}});assert.equal(e.run('safeStorage("session","get","x")'),null);assert.equal(e.run('safeStorage("session","set","x","value")'),false);});
test('timeout retry reuses the exact request id and base version, preventing duplicate commits',async()=>{
 const e=environment(),requests=[];e.set('testData',fixture());e.run('applySnapshot(testData);fleetToken="token";currentFleetIdentity={username:"admin",role:"admin"};remoteVersion=3;dirty=true;');
 let n=0;e.set('transport',async(action,values)=>{requests.push(JSON.parse(JSON.stringify(values)));if(!n++)throw Error('TIMEOUT');return {ok:true,version:4};});e.run('fleetRpc=transport');await e.run('pushRemote()');assert.equal(e.run('dirty'),true);await e.run('pushRemote()');assert.deepEqual(requests[0],requests[1]);assert.equal(e.run('dirty'),false);assert.equal(e.run('remoteVersion'),4);
});
test('conflict leaves local draft intact; a failed reload cannot discard it',async()=>{
 const e=environment();e.set('testData',fixture());e.run('applySnapshot(testData);fleetToken="token";currentFleetIdentity={username:"admin",role:"admin"};remoteVersion=3;dirty=true;');
 e.set('transport',async()=>{throw Error('CONFLICT');});e.run('fleetRpc=transport');await e.run('pushRemote()');assert.equal(e.run('dirty'),true);assert.equal(e.nodes.get('flottaConflict').hidden,false);const before=e.run('JSON.stringify(snapshot())');e.set('transport',async()=>{throw Error('SERVER_ERROR');});e.run('fleetRpc=transport');await e.run('discardDraft()');assert.equal(e.run('dirty'),true);assert.equal(e.run('JSON.stringify(snapshot())'),before);assert.ok(e.store.has('flotta_unsynced_v181'));
});
test('expired session retains unsaved draft for same-user reauthentication; logout clears it and revokes token',async()=>{
 const e=environment();e.set('testData',fixture());e.run('applySnapshot(testData);fleetToken="secret-token";currentFleetIdentity={username:"admin",role:"admin"};remoteVersion=3;dirty=true;persistDraft();clearSession();');assert.ok(e.store.has('flotta_unsynced_v181'));
 e.run('currentFleetIdentity={username:"admin",role:"admin"};restoreDraft();');assert.equal(e.run('dirty'),true);assert.equal(e.run('vehicles[0].rendszam'),'TEST-001');
 const calls=[];e.set('transport',async(...args)=>{calls.push(args);return {ok:true};});e.run('fleetRpc=transport;fleetToken="secret-token";');await e.run('logoutFleet()');assert.equal(calls[0][0],'logout');assert.equal(calls[0][2],'secret-token');assert.equal(e.store.has('flotta_unsynced_v181'),false);assert.equal(e.run('vehicles.length'),0);assert.equal(e.nodes.get('historyContent').innerHTML,'');
});

test('invalid imported history is rejected before replacing the current dataset',()=>{const e=environment();e.set('testData',fixture());e.run('applySnapshot(testData)');e.set('badData',{...fixture(),vehicles:[{id:'v2',history:{bad:true}}]});assert.throws(()=>e.run('applySnapshot(badData)'),/INVALID_DATA/);assert.equal(e.run('vehicles[0].id'),'v1');});
