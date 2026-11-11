/**
 * #133 authenticated direct-SDK BOOKING RED TEAM against the exact current
 * FULL restrictive Firestore Rules (not an alternative Rules fixture).
 * The original Grok proof used lone setDoc(bookings), which is ALWAYS
 * rejected because an ATOMIC driverClaims write is mandatory. That is not
 * evidence the underlying forged index would be denied.
 *
 * Test shape: first demonstrate positive ALLOW for a legal atomic booking,
 * then attempt identically-shaped malicious FOUR-document transactions.
 * A privileged LOCAL EMULATOR fixture simulates a corrupt approved source;
 * never mistake it for an authorized real migration.
 *
 * Run ONLY under firebase emulators:exec --only firestore
 * --config firebase.staging-emulator.json --project demo-imile-restricted-v1
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,Timestamp} from 'firebase/firestore';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='a'.repeat(64),date='2099-03-03';
const host=process.env.FIRESTORE_EMULATOR_HOST;
const ref=(db,collection,id)=>doc(db,collection,id);
const bookingId=date+'__ABC123';
const claimId=date+'__DA0001';
const driver=(code='DA0001',capacity=80)=>({
  id:'synthetic-'+code,daCode:code,name:'SYNTHETIC',status:'aktiv',
  kapacitas:capacity,history:[{kind:'verified-synthetic'}]
});
const vehicle=(plate='ABC-123',status='aktiv')=>({
  id:'synthetic-'+plate,rendszam:plate,status,history:[{kind:'verified-synthetic'}]
});
const source=({drivers=[driver()],vehicles=[vehicle()]}={})=>({
  revision:1,sealed:true,migrationSourceSha256:sha,
  drivers,vehicles,fuelCards:[],contacts:[]
});
const data=({driverIndex=0,vehicleIndex=0,capacity=80}={})=>({
  date,vehicleId:'ABC123',driverId:'DA0001',district:'IX',
  status:'planned',capacity,driverIndex,vehicleIndex
});
const newBooking=(db,opts={})=>{
  // This ATOMIC booking + reverse driver claim is the current fixed
  // original Depot transaction, AFTER privileged identity claim import. A lone booking setDoc cannot prove authorization.
  const batch=writeBatch(db);
  batch.set(ref(db,'bookings',bookingId),data(opts));
  batch.set(ref(db,'driverClaims',claimId),{
    date,driverId:'DA0001',bookingId
  });
  // #133 FIX: source-index claims are now PRIVILEGED and immutable. They
  // are seeded above, and the original Depot no longer writes them.
  // The booking + date-scoped reverse claim remain atomic.
  return batch.commit();
};
const findings=[];
async function mustDeny(label,fn){
  try{
    await fn();
    findings.push(label);
    console.error('P0 ACCEPTED HOSTILE AUTHENTICATED SDK: '+label);
  }catch(err){
    if(err.code!=='permission-denied')
      throw Error('Invalid negative test: '+label+' unexpected '+String(err),{cause:err});
    console.log('PASS DENY [E+SDK]: '+label);
  }
}
async function main(){
  if(host!=='127.0.0.1:8787' && host!=='localhost:8787')
    throw Error('REFUSE NONLOCAL FIRESTORE; emulator is mandatory');
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw Error('REFUSE CLOUD CREDENTIALS');
  const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
  const env=await initializeTestEnvironment({
    projectId,firestore:{host:'127.0.0.1',port:8787,
      rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  const client=env.authenticatedContext(uid,{email}).firestore();
  async function seed(snapshot=source(),{driverIndex=0,vehicleIndex=0,keyedCapacity=80,keyedVehicleStatus='aktiv'}={}){
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(ref(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
      await setDoc(ref(db,'flottaMigrationApproval','current'),{
        status:'approved',approvedUid:uid,sourceSha256:sha,
        approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
      });
      await setDoc(ref(db,'flottaSharedState','current'),snapshot);
      await setDoc(ref(db,'flottaDrivers','DA0001'),{
        id:'synthetic-driver-master',daCode:'DA0001',
        status:'aktiv',kapacitas:keyedCapacity,revision:1,history:[{kind:'verified-synthetic'}]
      });
      await setDoc(ref(db,'flottaVehicles','ABC123'),{
        id:'synthetic-vehicle-master',rendszam:'ABC-123',
        status:keyedVehicleStatus,revision:1,history:[{kind:'verified-synthetic'}]
      });
      await setDoc(ref(db,'flottaDriverClaims','DA0001'),{sourceIndex:driverIndex,revision:1});
      await setDoc(ref(db,'flottaVehicleClaims','ABC123'),{sourceIndex:vehicleIndex,revision:1});
    });
  }
  try{
    // A legal two-document write must ALLOW; otherwise negative tests
    // are trivial, not security proof. No UI or reduced mocked Rules.
    await seed();
    await newBooking(client);
    const saved=await getDoc(ref(client,'bookings',bookingId));
    const reverse=await getDoc(ref(client,'driverClaims',claimId));
    assert.equal(saved.exists(),true);
    assert.equal(reverse.exists(),true);
    assert.equal(saved.data().capacity,80);
    assert.equal(reverse.data().bookingId,bookingId);
    console.log('PASS ALLOW [E+SDK]: valid sealed Fleet with PRIVILEGED identity claims supports atomic booking');

    await seed();
    // Control: the OLD Grok setDoc-only strategy always fails because
    // driverClaims is absent. Its denial is not accepted as attack evidence.
    await mustDeny('non-atomic lone booking is trivially denied',
      ()=>setDoc(ref(client,'bookings',bookingId),data()));

    // Attacker-controlled duplicate source is seeded with privilege ONLY to
    // test whether authenticated SDK can forge the trusted index claim.
    const duplicateDrivers=source({
      drivers:[driver('DA0001',80),driver('da0001',500)],
      vehicles:[vehicle()]
    });
    await seed(duplicateDrivers);
    // A malicious authorized SDK update of the source-identity claim might
    // be accepted, even AFTER seal. This must not be quietly ignored.
    await mustDeny('postseal SDK changes immutable driver identity claim 0→1 on duplicate DA',
      ()=>updateDoc(ref(client,'flottaDriverClaims','DA0001'),{
        sourceIndex:1,revision:1
      }));
    // Deliberately use the attacker's claimed index if their write succeeded:
    // compare legitimate matching booking shape vs the source normalizer.
    await mustDeny('forged second duplicate DA index books current canonical capacity 80',
      ()=>newBooking(client,{driverIndex:1,vehicleIndex:0,capacity:80}));

    await seed(source({
      drivers:[driver()],
      vehicles:[vehicle('ABC-123','szerviz'),vehicle('abc 123','aktiv')]
    }));
    await mustDeny('postseal SDK changes immutable vehicle identity claim 0→1 on duplicate plate',
      ()=>updateDoc(ref(client,'flottaVehicleClaims','ABC123'),{
        sourceIndex:1,revision:1
      }));
    await mustDeny('forged second normalized plate index bypasses archived service-car conflict',
      ()=>newBooking(client,{driverIndex:0,vehicleIndex:1,capacity:80}));

    // Same legal, complete atomic booking shape as the positive control,
    // so only the live keyed capacity invariant may reject this.
    await seed();
    await mustDeny('forged client booking capacity 999 despite keyed master 80',
      ()=>newBooking(client,{driverIndex:0,vehicleIndex:0,capacity:999}));

    // Independent importer-invariant probe: even a first-index claim can
    // select an ID in a deliberately contaminated privileged source. This
    // check is a RELEASE GATE on importer attestation, not a promise that
    // unbounded source-array uniqueness is computable within Firestore Rules.
    await seed(duplicateDrivers);
    await mustDeny('privileged poisoned normalized-duplicate source still authorizes index-zero booking',
      ()=>newBooking(client,{driverIndex:0,vehicleIndex:0,capacity:80}));

    if(findings.length)
      throw Error('P0 SOURCE/BOOKING RELEASE NO-GO: '+findings.length+
        ' hostile authenticated writes accepted under actual full Rules: '+findings.join('; '));
    console.log('PASS: all genuinely transactional #133 index and claim attacks DENY with positive booking ALLOW');
  }finally{
    await env.cleanup();
  }
}
main().catch(err=>{console.error('P0 ORIGINAL FORGED-INDEX ACCEPTANCE FAILED:',err);process.exitCode=1;});
