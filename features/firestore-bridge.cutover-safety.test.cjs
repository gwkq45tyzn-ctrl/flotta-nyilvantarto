/**
 * ORIGINAL Flotta + Firestore bridge: cutover safety tests.
 * Run: node --test features/firestore-bridge.cutover-safety.test.cjs
 * Zero network calls, mock Firebase, fake credentials and synthetic data ONLY.
 * The first two regression tests intentionally expose blockers on d04c294.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const bridgeSource = fs.readFileSync(path.join(__dirname, 'firestore-bridge.js'), 'utf8');
const originalHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SHARED_EMAIL = 'imilemanagement@imile-management-staging.firebaseapp.com';

function mockBridge({importVerified = false, failTransactions = false} = {}) {
  // Local flags are deliberately NEVER sufficient; the server mock below must also approve.
  const storage = new Map(importVerified ? [['flotta_import_verified', '1'], ['flotta_migration_token', 'verified-import']] : []);
  const sessions = new Map();
  const delayedMicrotasks = [];
  const controls = {
    flottaUsername: {value:'imilemanagement'},
    flottaPassword: {value:'test-only-password'},
    flottaLoginMessage: {textContent:''},
    flottaLoginSubmit: {disabled:false},
    syncStatus: {textContent:'',style:{}}
  };
  const mockUser = {uid:'synthetic-test-uid',email:SHARED_EMAIL};
  let originalSaves=0, remoteWrites=0, uiUnlocked=false;
  let localSnapshot = {
    vehicles:[{id:'test-car',km:100}],
    fuelCards:[],drivers:[],contacts:[]
  };
  const nativePromise = Promise;
  // Prevent a defective retry loop from hanging the test process.
  class ControllablePromise extends nativePromise {
    static resolve() { return {then(callback){ delayedMicrotasks.push(callback); }}; }
  }
  const auth={
    currentUser:null,
    async signInWithEmailAndPassword(email){
      assert.equal(email,SHARED_EMAIL);
      this.currentUser=mockUser;
      return {user:mockUser};
    },
    async signOut(){this.currentUser=null;},
    onAuthStateChanged(){return ()=>{};}
  };
  const db={
    settings(){},
    doc(name){
      return {
        async get(options){
          assert.equal(options?.source,'server','Migration authorization must never use a cache');
          if(name==='users/'+mockUser.uid)
            return {exists:true,data:()=>({active:true,role:'admin'})};
          if(name==='flottaMigrationApproval/current')
            return {exists:importVerified,data:()=>({
              status:'approved',approvedUid:mockUser.uid,sourceSha256:'a'.repeat(64)
            })};
          if(name==='flottaSharedState/current')
            return {exists:importVerified,data:()=>({...localSnapshot,revision:1})};
          throw Error('Unexpected server read: '+name);
        },
        onSnapshot(){return ()=>{};}
      };
    },
    async runTransaction(){
      remoteWrites++;
      if(failTransactions) throw new Error('REVISION_CONFLICT');
      return remoteWrites;
    }
  };
  const firestore=()=>db;
  firestore.FieldValue={serverTimestamp:()=>null};
  const localStorage={
    getItem:k=>storage.get(k)??null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  };
  const sessionStorage={
    getItem:k=>sessions.get(k)??null,
    setItem:(k,v)=>sessions.set(k,String(v)),
    removeItem:k=>sessions.delete(k)
  };
  const context={
    console:{error(){}},
    Promise:ControllablePromise,
    localStorage,sessionStorage,
    document:{readyState:'complete',getElementById:k=>controls[k]??null},
    firebase:{initializeApp:()=>({}),auth:()=>auth,firestore},
    addEventListener(){},
    fleetSimpleLogin(){},fleetSimpleLogout(){},
    fleetGateSession(){
      const entry=JSON.parse(sessionStorage.getItem('flotta_simple_session_v23')||'null');
      return entry?.user==='fleetmanager'?entry:null;
    },
    fleetGateDisplay(){
      uiUnlocked=Boolean(context.fleetGateSession());
      return uiUnlocked;
    },
    load(){},
    save(){
      originalSaves++;
      localStorage.setItem('flotta_pending_v16',JSON.stringify(localSnapshot));
    },
    snapshot(){return JSON.parse(JSON.stringify(localSnapshot));},
    applySnapshot(next){localSnapshot=next;}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(bridgeSource,context,{filename:'features/firestore-bridge.js'});
  return {
    login:()=>context.fleetSimpleLogin({preventDefault(){}}),
    save:()=>context.save(),
    auth:()=>Boolean(auth.currentUser),
    unlocked:()=>uiUnlocked,
    originalSaves:()=>originalSaves,
    remoteWrites:()=>remoteWrites,
    pending:()=>storage.has('flotta_pending_v16'),
    pendingCallbacks:()=>delayedMicrotasks.length,
    shiftCallback:()=>delayedMicrotasks.shift(),
    status:()=>controls.syncStatus.textContent
  };
}

test('pre-import Fleet must not execute original save() or create a local pending edit', async()=>{
  const h=mockBridge({importVerified:false});
  await h.login();
  assert.equal(h.auth(),true);
  assert.equal(h.unlocked(),true,'Read-only view must still open');
  h.save();
  assert.equal(h.remoteWrites(),0,'Before import there must be NO Firestore writes');
  assert.equal(h.originalSaves(),0,'Before import the original mutation/save function must be disabled');
  assert.equal(h.pending(),false,'Read-only mode must not stage a misleading local write');
});

test('legacy fleetmanager session must not start app/Apps Script sync before Firebase bridge initializes',()=>{
  const legacyBoot='if(fleetGateDisplay()){flottaHasLoaded=true;load();}';
  const bootAt=originalHtml.indexOf(legacyBoot);
  assert.notEqual(bootAt,-1,'Original inline startup changed: re-audit early legacy boot safety');
  const bridgeAt=originalHtml.indexOf('<script src="features/firestore-bridge.js"');
  assert.notEqual(bridgeAt,-1,'Firestore bridge script missing from original Fleet HTML');
  assert.ok(bootAt > bridgeAt,
    'Original inline code starts load() with a forgeable client-only legacy session before bridge executes; must fail-closed before Firebase Auth');
});

test('permanent revision conflict stops retry chain and preserves pending',async()=>{
  const h=mockBridge({importVerified:true,failTransactions:true});
  await h.login();
  h.save();
  for(let i=0;i<8;i++) await Promise.resolve();
  let attempts=0;
  while(h.pendingCallbacks()>0 && attempts<8){
    const callback=h.shiftCallback();
    callback();
    attempts++;
    for(let i=0;i<8;i++) await Promise.resolve();
  }
  assert.equal(h.remoteWrites(),4,'One initial attempt plus no more than three retries');
  assert.equal(h.pendingCallbacks(),0,'Failed transaction must not leave unbounded retry microtasks');
  assert.equal(h.pending(),true,'Conflict must retain the local backup');
  assert.match(h.status(),/Túl sok újrapróbálkozás|ütközés/i);
});
