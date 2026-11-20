/**
 * Synthetic, TWO independent browser VM contexts sharing one fake Firestore.
 * Executes the actual Firestore bridge source (no Firebase networking or data).
 * node --test features/firestore-bridge.two-browser-synthetic.test.cjs
 */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'firestore-bridge.js'),'utf8');
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const copy=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function makeServer(initial) {
  let state=copy(initial);
  const subscribers=new Set();
  function emit(data=state, metadata={fromCache:false,hasPendingWrites:false}) {
    const event={exists:true,data:()=>copy(data),metadata};
    for(const cb of subscribers)cb(event);
  }
  return {
    get state(){return copy(state);},
    emit,
    doc(name){
      if(name==='users/synthetic-uid')
        return {get:async()=>({exists:true,data:()=>({active:true,role:'admin'})})};
      if(name!=='flottaSharedState/current')throw Error('Unexpected doc: '+name);
      return {
        onSnapshot(_opts,callback){subscribers.add(callback);return()=>subscribers.delete(callback);}
      };
    },
    async runTransaction(work) {
      let draft=null;
      const starting=copy(state);
      const tx={
        async get(){return {exists:true,data:()=>copy(starting)};},
        set(_ref,payload){draft=copy(payload);}
      };
      const result=await work(tx);
      if(!draft)throw Error('Missing transaction write');
      if(state.revision!==starting.revision)throw Error('REVISION_CONFLICT');
      state=draft;
      emit();
      return result;
    }
  };
}

function makeClient(server,{verified=true,localKm=0}={}){
  const stores=new Map(verified?[['flotta_import_verified','1']]:[]);
  const sessions=new Map();
  let fleet={
    vehicles:[{id:'v1',rendszam:'ABC123',km:localKm}],
    fuelCards:[],drivers:[],contacts:[]
  };
  const originalLocal=JSON.stringify(fleet);
  stores.set('flotta_nyilvantarto_v16',originalLocal);
  const elements={
    flottaUsername:{value:'imilemanagement'},
    flottaPassword:{value:'synthetic'},
    flottaLoginMessage:{textContent:''},
    flottaLoginSubmit:{disabled:false},
    syncStatus:{textContent:'',style:{}}
  };
  let applied=0,originalSaves=0,unlocked=false;
  const user={uid:'synthetic-uid',email};
  const auth={
    currentUser:null,
    async signInWithEmailAndPassword(address){
      assert.equal(address,email);this.currentUser=user;return {user};
    },
    async signOut(){this.currentUser=null;},
    onAuthStateChanged(){return ()=>{};}
  };
  const db={
    settings(){},
    doc:name=>server.doc(name),
    runTransaction:fn=>server.runTransaction(fn)
  };
  const firestore=()=>db;
  firestore.FieldValue={serverTimestamp:()=>null};
  const localStorage={
    getItem:k=>stores.get(k)??null,
    setItem:(k,v)=>stores.set(k,String(v)),
    removeItem:k=>stores.delete(k)
  };
  const sessionStorage={
    getItem:k=>sessions.get(k)??null,
    setItem:(k,v)=>sessions.set(k,String(v)),
    removeItem:k=>sessions.delete(k)
  };
  const context={
    console:{error(){}},
    document:{readyState:'complete',getElementById:id=>elements[id]??null},
    firebase:{initializeApp:()=>({}),auth:()=>auth,firestore},
    localStorage,sessionStorage,addEventListener(){},
    fleetSimpleLogin(){},fleetSimpleLogout(){},
    fleetGateSession(){
      const entry=JSON.parse(sessionStorage.getItem('flotta_simple_session_v23')||'null');
      return entry?.user==='fleetmanager'?entry:null;
    },
    fleetGateDisplay(){unlocked=!!context.fleetGateSession();return unlocked;},
    save(){
      originalSaves++;
      localStorage.setItem('flotta_nyilvantarto_v16',JSON.stringify(fleet));
      localStorage.setItem('flotta_pending_v16',JSON.stringify(fleet));
    },
    snapshot(){return copy(fleet);},
    applySnapshot(snap){
      applied++;
      fleet=copy(snap);
      localStorage.setItem('flotta_nyilvantarto_v16',JSON.stringify(fleet));
    },
    load(){}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'features/firestore-bridge.js'});
  return {
    login:()=>context.fleetSimpleLogin({preventDefault(){}}),
    isUnlocked:()=>unlocked,
    km:()=>fleet.vehicles[0].km,
    setKm:n=>{fleet.vehicles[0].km=n;},
    save:()=>context.save(),
    applications:()=>applied,
    originalSaves:()=>originalSaves,
    localStore:()=>stores.get('flotta_nyilvantarto_v16'),
    initialLocal:()=>originalLocal,
    pending:()=>stores.has('flotta_pending_v16'),
    status:()=>elements.syncStatus.textContent
  };
}
const fixture=()=>({
  vehicles:[{id:'v1',rendszam:'ABC123',km:10}],
  fuelCards:[],drivers:[],contacts:[],revision:1
});

test('pre-import confirmed remote never overwrites original Fleet localStorage',async()=>{
  const server=makeServer(fixture());
  const client=makeClient(server,{verified:false,localKm:999});
  const before=client.initialLocal();
  await client.login();
  assert.equal(client.isUnlocked(),true);
  server.emit();
  assert.equal(client.km(),999);
  assert.equal(client.applications(),0);
  assert.equal(client.localStore(),before,'Unverified legacy snapshot must stay byte-for-byte unchanged');
  client.save();
  assert.equal(client.originalSaves(),0,'Pre-import save must be blocked');
  assert.equal(client.pending(),false);
});

test('unconfirmed cache or pending snapshots cannot overwrite Fleet even after import',async()=>{
  const server=makeServer(fixture());
  const client=makeClient(server,{verified:true,localKm:0});
  await client.login();
  server.emit(); // confirmed: establish current revision and canonical snapshot
  assert.equal(client.km(),10);
  const applications=client.applications();
  const spoof={...fixture(),vehicles:[{id:'v1',rendszam:'ABC123',km:777}]};
  server.emit(spoof,{fromCache:true,hasPendingWrites:false});
  server.emit(spoof,{fromCache:false,hasPendingWrites:true});
  assert.equal(client.km(),10,'Unconfirmed snapshots are never authoritative');
  assert.equal(client.applications(),applications);
});

test('confirmed write in one browser appears in another without reload',async()=>{
  const server=makeServer(fixture());
  const first=makeClient(server,{verified:true,localKm:0});
  const second=makeClient(server,{verified:true,localKm:0});
  await first.login();
  await second.login();
  server.emit();
  assert.equal(first.km(),10);
  assert.equal(second.km(),10);
  first.setKm(250);
  first.save();
  await tick();
  await tick();
  assert.equal(server.state.vehicles[0].km,250,'Server must have the confirmed change');
  assert.equal(second.km(),250,'Second browser must apply the confirmed snapshot');
  assert.equal(first.pending(),false,'First browser pending backup cleared after confirmed commit');
});
