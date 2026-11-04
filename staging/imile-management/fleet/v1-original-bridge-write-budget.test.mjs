/**
 * [T] Execute the ACTUAL original Fleet Firebase bridge in a browser-like VM.
 * No Firebase SDK, cloud project, Auth session, network, user data or deployment.
 *
 * Witness: the current pushTransactional() writes EVERY strict driver and
 * vehicle mirror on EVERY Fleet edit, including contact-only edits. It has no
 * tombstone/deletion path for removed masters and no transaction write budget.
 * Passing these tests documents a release blocker; it is NOT a production GO.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const SOURCE_SHA='b'.repeat(64);
const UID='synthetic-imile-bridge-qa-000001';
const EMAIL='imilemanagement@imile-management-staging.firebaseapp.com';
const bridge=await readFile(
  new URL('../../../features/firestore-bridge.js',import.meta.url),'utf8'
);

function masterRows(driverCount,vehicleCount){
  return {
    drivers:Array.from({length:driverCount},(_,i)=>({
      id:'driver-'+i,daCode:'DA'+String(i).padStart(5,'0'),
      name:'SYNTHETIC DRIVER '+i,agency:'TEST',
      status:'aktiv',kapacitas:15,history:[{event:'private test'}]
    })),
    vehicles:Array.from({length:vehicleCount},(_,i)=>({
      id:'vehicle-'+i,rendszam:'CAR'+String(i).padStart(5,'0'),
      gyartmany:'Ford',modell:'Transit',status:'aktiv',
      history:[{event:'synthetic inspection'}]
    })),
    fuelCards:[{id:'synthetic-card',history:[{amount:2}]}],
    contacts:[{id:'synthetic-contact',name:'Synthetic only'}]
  };
}

async function captureActualBridgeSave(serverRows,draftRows){
  const writes=[],deletes=[],statusMessages=[];
  const serverFleet={
    ...structuredClone(serverRows),revision:1,migrationSourceSha256:SOURCE_SHA
  };
  const approval={
    status:'approved',approvedUid:UID,sourceSha256:SOURCE_SHA
  };
  const auth={
    currentUser:null,
    async signInWithEmailAndPassword(email){
      assert.equal(email,EMAIL);
      this.currentUser={uid:UID,email:EMAIL};
      return {user:this.currentUser};
    },
    async signOut(){this.currentUser=null;},
    onAuthStateChanged(){return ()=>{};}
  };
  function fakeDoc(path){
    const data=path==='flottaSharedState/current'?serverFleet:
      path==='flottaMigrationApproval/current'?approval:
      path==='users/'+UID?{role:'admin',active:true}:null;
    return {
      path,
      async get(){return {exists:data!==null,data:()=>data};},
      onSnapshot(_options,callback){
        assert.equal(path,'flottaSharedState/current');
        callback({exists:true,data:()=>serverFleet,
          metadata:{fromCache:false,hasPendingWrites:false}});
        return ()=>{};
      }
    };
  }
  const db={
    settings(){},
    doc:fakeDoc,
    async runTransaction(callback){
      const tx={
        async get(ref){
          assert.equal(ref.path,'flottaSharedState/current');
          return {exists:true,data:()=>serverFleet};
        },
        set(ref,data){writes.push({path:ref.path,data});},
        delete(ref){deletes.push(ref.path);}
      };
      return callback(tx);
    }
  };
  const firebase={
    apps:[],
    initializeApp(config){
      const app={options:config};
      this.apps.push(app);
      return app;
    },
    auth:()=>auth,
    firestore:()=>db
  };
  firebase.firestore.FieldValue={serverTimestamp:()=>({testServerTime:true})};
  const storage=()=>({
    _data:new Map(),
    getItem(key){return this._data.get(key)??null;},
    setItem(key,value){this._data.set(key,String(value));},
    removeItem(key){this._data.delete(key);}
  });
  const elements=new Map();
  function el(id){
    if(!elements.has(id))elements.set(id,{
      value:id==='flottaUsername'?'imilemanagement':
        id==='flottaPassword'?'test-password':'',
      disabled:false,textContent:'',style:{}
    });
    return elements.get(id);
  }
  const ctx={
    console:{log(){},warn(){},error(...args){statusMessages.push(String(args[0]));}},
    Promise,Date,JSON,Blob,URL,setTimeout,clearTimeout,
    document:{readyState:'complete',getElementById:el,
      addEventListener(){},createElement(){throw Error('Unexpected SDK download');}},
    firebase,localStorage:storage(),sessionStorage:storage(),
    fleetSimpleLogin(){},fleetGateSession(){return {user:'synthetic'};},
    fleetGateDisplay(){},save(){},snapshot(){return structuredClone(draftRows);},
    applySnapshot(){},load(){},
    pushRemote(){throw Error('Legacy sync must not run');},
    pullRemote(){throw Error('Legacy sync must not run');}
  };
  ctx.window=ctx; // browser globals and window properties are the same object
  vm.runInNewContext(bridge,ctx,{
    filename:'features/firestore-bridge.js',timeout:1000
  });
  await ctx.fleetSimpleLogin({preventDefault(){}});
  assert.equal(el('flottaLoginMessage').textContent,'',
    'Fake auth/profile/approval must permit the local save path');
  ctx.save();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(writes[0]?.path,'flottaSharedState/current',
    'The real bridge must attempt a Fleet server transaction');
  return {writes,deletes,statusMessages};
}

test('[T] original bridge re-writes unchanged strict masters on contact-only save',async()=>{
  const before=masterRows(3,2);
  const changed=structuredClone(before);
  changed.contacts[0].name='Contact-only change';
  const {writes}=await captureActualBridgeSave(before,changed);
  assert.equal(writes.length,6,'one rich Fleet + every one of 5 unchanged mirrors');
  assert.deepEqual(writes.slice(1).map(x=>x.path),[
    ...before.drivers.map(d=>'drivers/'+d.daCode),
    ...before.vehicles.map(v=>'vehicles/'+v.rendszam)
  ]);
  console.log('PASS [T] NO-GO witness: unrelated edit rewrites every strict master');
});

test('[T] original bridge produces >500 writes for 250 drivers + 250 cars',async()=>{
  const before=masterRows(250,250);
  const changed=structuredClone(before);
  changed.contacts[0].name='Only change';
  const {writes}=await captureActualBridgeSave(before,changed);
  assert.equal(writes.length,501);
  assert.ok(writes.length>500,'current transaction exceeds documented Firestore ceiling');
  console.log('PASS [T] NO-GO witness: 501 attempted writes without size/budget guard');
});

test('[T] original bridge cannot clear a removed master projection',async()=>{
  const before=masterRows(2,1);
  const changed=structuredClone(before);
  const removed=changed.drivers.pop().daCode;
  const {writes,deletes}=await captureActualBridgeSave(before,changed);
  assert.equal(writes.length,3);
  assert.deepEqual(deletes,[]);
  assert.ok(!writes.some(x=>x.path==='drivers/'+removed));
  console.log('PASS [T] NO-GO witness: removed driver projection has no delete path');
});
