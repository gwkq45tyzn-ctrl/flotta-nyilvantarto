/**
 * Runtime regression: legacy gate patched BEFORE inline Fleet boot and
 * server-only role verification required. No Firebase/cloud contacts.
 */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'firestore-bridge.js'),'utf8');
const SHARED='imilemanagement@imile-management-staging.firebaseapp.com';

function harness({active=true,partialSdk=false}={}){
 const store=new Map(),session=new Map();
 session.set('flotta_simple_session_v23',JSON.stringify({user:'fleetmanager',at:Date.now()}));
 const state={legacyGet:0,legacyPut:0,originalSave:0,serverReads:[],unlocked:false,sdkScripts:[]};
 const inputs={
  flottaUsername:{value:'imilemanagement'},
  flottaPassword:{value:'test-password'},
  flottaLoginMessage:{textContent:''},
  flottaLoginSubmit:{disabled:false},
  flottaSessionName:{textContent:''},
  syncStatus:{textContent:'',style:{}}
 };
 const auth={currentUser:null,
  async signInWithEmailAndPassword(email){assert.equal(email,SHARED);
   this.currentUser={email,uid:'synthetic-valid-uid'};return{user:this.currentUser};},
  async signOut(){this.currentUser=null;},
  onAuthStateChanged(){return()=>{};}
 };
 const db={
  settings(){},
  doc(){return{
   async get(opts){state.serverReads.push(opts);return{exists:true,
     data:()=>({active,role:'admin'})};},
   onSnapshot(){return()=>{};}
  }}
 };
 const fire=()=>db;fire.FieldValue={serverTimestamp:()=>null};
 const sdk={initializeApp:()=>({})};
 if(!partialSdk){sdk.auth=()=>auth;sdk.firestore=fire;}
 const localStorage={getItem:k=>store.get(k)??null,
  setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const sessionStorage={getItem:k=>session.get(k)??null,
  setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
 const ctx={
  console:{error(){}},
  document:{readyState:'loading',getElementById:k=>inputs[k]??null,
   createElement:tag=>({tagName:tag,src:'',onload:null,onerror:null}),
   head:{appendChild(script){
    state.sdkScripts.push(script.src);
    Promise.resolve().then(()=>{
     if(script.src.includes('firebase-auth-compat.js')) sdk.auth=()=>auth;
     if(script.src.includes('firebase-firestore-compat.js')) sdk.firestore=fire;
     script.onload?.();
    });
   }}
  },
  localStorage,sessionStorage,
  addEventListener(){},
  firebase:sdk,
  fleetSimpleLogin(){},fleetSimpleLogout(){},
  fleetGateSession(){return JSON.parse(sessionStorage.getItem('flotta_simple_session_v23')||'null');},
  fleetGateDisplay(){
   state.unlocked=Boolean(ctx.fleetGateSession());
   return state.unlocked;
  },
  save(){state.originalSave++},
  pushRemote(){state.legacyPut++},
  pullRemote(){state.legacyGet++},
  load(){},
  snapshot(){return{vehicles:[],drivers:[],fuelCards:[],contacts:[]}}
 };
 ctx.window=ctx;
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{filename:'firestore-bridge.js'});
 return{ctx,state,inputs,store,login:()=>ctx.fleetSimpleLogin({preventDefault(){}})};
}

test('legacy session is blocked synchronously, BEFORE DOMContentLoaded',()=>{
 const h=harness();
 assert.equal(h.ctx.fleetGateSession(),null,'Old fleetmanager session must never unlock');
 assert.equal(h.ctx.fleetGateDisplay(),false);
 h.ctx.pullRemote();h.ctx.pushRemote();
 assert.equal(h.state.legacyGet,0,'Must not call Apps Script pull');
 assert.equal(h.state.legacyPut,0,'Must not call Apps Script push');
});
test('Auth email alone is never sufficient: inactive server profile fails closed',async()=>{
 const h=harness({active:false});
 await h.login();
 assert.equal(h.state.unlocked,false);
 assert.ok(h.state.serverReads.length>=1);
 assert.equal(JSON.stringify(h.state.serverReads[0]),JSON.stringify({source:'server'}));
 assert.match(h.inputs.flottaLoginMessage.textContent,/sikertelen/i);
 assert.equal(h.ctx.fleetGateSession(),null);
 assert.equal(h.state.originalSave,0);
});
test('active SERVER profile unlocks original Fleet, but save remains pre-import disabled',async()=>{
 const h=harness({active:true});
 await h.login();
 assert.equal(h.state.unlocked,true);
 assert.deepEqual(h.state.serverReads.map(x=>x?.source),['server','server']);
 // Profile read succeeded, migration approval was NOT granted by role alone.
 assert.equal(h.ctx.fleetGateSession().user,'imilemanagement');
 h.ctx.save();
 assert.equal(h.state.originalSave,0,'Original save must not execute before migration');
 assert.equal(h.store.get('flotta_import_verified'),undefined);
 assert.equal(h.store.get('flotta_pending_v16'),undefined);
 await h.ctx.fleetSimpleLogout();
 assert.equal(h.state.unlocked,false);
 assert.equal(h.ctx.fleetGateSession(),null);
});

test('partially loaded Firebase namespace waits for both SDK modules, even with concurrent logins',async()=>{
 const h=harness({partialSdk:true});
 await Promise.all([h.login(),h.login()]);
 assert.equal(h.state.unlocked,true);
 assert.equal(h.ctx.fleetGateSession().user,'imilemanagement');
 assert.deepEqual(h.state.sdkScripts.map(s=>s.split('/').pop()),
   ['firebase-auth-compat.js','firebase-firestore-compat.js'],
   'Concurrent init must not duplicate or skip required compat modules');
 assert.equal(typeof h.ctx.firebase.firestore,'function');
 assert.ok(h.state.serverReads.length>=1,'Auth profile remains server-verified');
});
