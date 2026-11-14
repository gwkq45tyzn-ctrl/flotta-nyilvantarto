/**
 * #184 real signed-in SDK proof on the ORIGINAL restricted Rules.
 * A privileged emulator seed (security rules disabled, the local stand-in
 * for an Admin SDK write) plants the archive. The client booking then uses
 * the ordinary authenticated SDK. The original probe file is not edited.
 *
 * Positive: unique 12/14 archive ALLOW, including a non-zero index and a
 * hyphenated DA. Negative: case-folded driver duplicates already inside the
 * sealed archive DENY at index zero, including a non-adjacent row and the
 * last slot of the 20-row window, and a padded alias such as "  da0001  ".
 * A 21-row unique archive DENY because the window cannot prove it.
 * A unique 20-driver fleet still books. Twenty-five does not fit.
 * Plate separator-folding is outside this budget: one claim document cannot
 * see the second array row.
 * Run only under firebase emulators:exec --only firestore.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,writeBatch,Timestamp} from 'firebase/firestore';

const projectId='demo-imile-restricted-v1';
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const sha='b'.repeat(64);
const host=process.env.FIRESTORE_EMULATOR_HOST;
const normDriver=code=>String(code).trim().toUpperCase();
const normPlate=plate=>String(plate).replace(/[ -]/g,'').toUpperCase();
const driver=(code,capacity=80)=>({
  id:'synthetic-'+normDriver(code),daCode:code,name:'SYNTHETIC',status:'aktiv',
  kapacitas:capacity,history:[{kind:'verified-synthetic'}]
});
const vehicle=(plate,status='aktiv')=>({
  id:'synthetic-'+normPlate(plate),rendszam:plate,status,
  history:[{kind:'verified-synthetic'}]
});
const fleet=(nDrivers,nVehicles)=>({
  drivers:Array.from({length:nDrivers},(_,i)=>driver('DA'+String(i+1).padStart(4,'0'))),
  vehicles:Array.from({length:nVehicles},(_,i)=>vehicle('ABC-'+String(i+1).padStart(3,'0')))
});

const findings=[];
async function mustDeny(label,fn){
  try{
    await fn();
    findings.push(label);
    console.error('P0 ACCEPTED HOSTILE AUTHENTICATED SDK: '+label);
  }catch(err){
    if(err.code!=='permission-denied')
      throw Error('Invalid negative test: '+label+' unexpected '+String(err),{cause:err});
    if(String(err.message||err).includes('maximum of 1000'))
      throw Error('Invalid negative test: '+label+' hit the expression cap instead of a logical deny');
    console.log('PASS DENY [E+SDK]: '+label);
  }
}

async function main(){
  if(host!=='127.0.0.1:8787' && host!=='localhost:8787')
    throw Error('REFUSE NONLOCAL FIRESTORE; emulator is mandatory');
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw Error('REFUSE CLOUD CREDENTIALS');
  const probe=await readFile(new URL('./v1-forged-booking-index-probes.mjs',import.meta.url),'utf8');
  assert.match(probe,/privileged poisoned normalized-duplicate source still authorizes index-zero booking/);
  const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
  assert.match(raw,/function driversNotDup/);
  assert.match(raw,/function bookingCreateAllowed/);
  const env=await initializeTestEnvironment({
    projectId,firestore:{host:'127.0.0.1',port:8787,
      rules:raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  const client=env.authenticatedContext(uid,{email}).firestore();
  async function seed(drivers,vehicles,{driverSlots,vehicleSlots}){
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(doc(db,'users',uid),{active:true,role:'admin',name:'SYNTHETIC'});
      await setDoc(doc(db,'flottaMigrationApproval','current'),{
        status:'approved',approvedUid:uid,sourceSha256:sha,
        approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
      });
      await setDoc(doc(db,'flottaSharedState','current'),{
        revision:1,sealed:true,migrationSourceSha256:sha,
        drivers,vehicles,fuelCards:[],contacts:[]
      });
      for(const slot of driverSlots){
        await setDoc(doc(db,'flottaDrivers',slot.id),{
          id:'synthetic-driver-master',daCode:slot.daCode,status:'aktiv',
          kapacitas:slot.capacity,sourceIndex:slot.sourceIndex,revision:1,
          history:[{kind:'verified-synthetic'}]
        });
        await setDoc(doc(db,'flottaDriverClaims',slot.id),{sourceIndex:slot.sourceIndex,revision:1});
      }
      for(const slot of vehicleSlots){
        await setDoc(doc(db,'flottaVehicles',slot.id),{
          id:'synthetic-vehicle-master',rendszam:slot.rendszam,status:'aktiv',
          sourceIndex:slot.sourceIndex,revision:1,history:[{kind:'verified-synthetic'}]
        });
        await setDoc(doc(db,'flottaVehicleClaims',slot.id),{sourceIndex:slot.sourceIndex,revision:1});
      }
    });
  }
  function book(day,driverId,vehicleId,driverIndex,vehicleIndex,capacity){
    const bookingId=day+'__'+vehicleId;
    const batch=writeBatch(client);
    batch.set(doc(client,'bookings',bookingId),{
      date:day,vehicleId,driverId,district:'IX',status:'planned',
      capacity,driverIndex,vehicleIndex
    });
    batch.set(doc(client,'driverClaims',day+'__'+driverId),{date:day,driverId,bookingId});
    return batch.commit();
  }
  function slotsFor(drivers,vehicles){
    const seenD=new Set();
    const driverSlots=[];
    drivers.forEach((row,sourceIndex)=>{
      const id=normDriver(row.daCode);
      if(!/^[A-Z0-9_-]{4,40}$/.test(id) || seenD.has(id)) return;
      seenD.add(id);
      driverSlots.push({id,daCode:id,capacity:80,sourceIndex});
    });
    const seenV=new Set();
    const vehicleSlots=[];
    vehicles.forEach((row,sourceIndex)=>{
      const id=normPlate(row.rendszam);
      if(!/^[A-Z0-9]{4,12}$/.test(id) || seenV.has(id)) return;
      seenV.add(id);
      vehicleSlots.push({id,rendszam:row.rendszam,sourceIndex});
    });
    return {driverSlots,vehicleSlots};
  }
  try{
    const rich=fleet(12,14);
    await seed(rich.drivers,rich.vehicles,slotsFor(rich.drivers,rich.vehicles));
    await book('2099-03-03','DA0001','ABC001',0,0,80);
    assert.equal((await getDoc(doc(client,'bookings','2099-03-03__ABC001'))).data().capacity,80);
    console.log('PASS ALLOW [E+SDK]: unique 12-driver 14-vehicle sealed archive books index zero');
    await book('2099-03-04','DA0006','ABC004',5,3,80);
    assert.equal((await getDoc(doc(client,'bookings','2099-03-04__ABC004'))).data().driverIndex,5);
    console.log('PASS ALLOW [E+SDK]: unique archive also books a non-zero driver and vehicle index');

    const hyphenDrivers=[driver('DA0001'),driver('DA-0002',70)];
    const hyphenVehicles=[vehicle('ABC-123')];
    await seed(hyphenDrivers,hyphenVehicles,{
      driverSlots:[
        {id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0},
        {id:'DA-0002',daCode:'DA-0002',capacity:70,sourceIndex:1}
      ],
      vehicleSlots:[{id:'ABC123',rendszam:'ABC-123',sourceIndex:0}]
    });
    await book('2099-03-05','DA-0002','ABC123',1,0,70);
    assert.equal((await getDoc(doc(client,'bookings','2099-03-05__ABC123'))).data().driverId,'DA-0002');
    console.log('PASS ALLOW [E+SDK]: hyphenated DA remains bookable when it is the only normalized match');

    // Another privileged-source P0: a forged keyed master may point to an
    // existing index that belongs to a DIFFERENT DA in the original array.
    // The selected ID appears nowhere in the source, so scanning only for
    // duplicate DAs would wrongly authorize the booking.
    const absent=fleet(2,1);
    await seed(absent.drivers,absent.vehicles,{
      driverSlots:[{id:'DA9999',daCode:'DA9999',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await mustDeny('privileged forged keyed DA9999 is absent from original sourceIndex zero',
      ()=>book('2099-03-13','DA9999','ABC001',0,0,80));

    const far=fleet(12,1);
    far.drivers[11]=driver('da0001',500);
    await seed(far.drivers,far.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await mustDeny('privileged poison at driver index 11 still denies index-zero booking',
      ()=>book('2099-03-06','DA0001','ABC001',0,0,80));

    const padded=fleet(12,1);
    padded.drivers[11]=driver('  da0001  ',500);
    await seed(padded.drivers,padded.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await mustDeny('privileged padded whitespace duplicate DA denies index-zero booking',
      ()=>book('2099-03-15','DA0001','ABC001',0,0,80));

    const edge=fleet(20,1);
    edge.drivers[19]=driver('da0001',500);
    await seed(edge.drivers,edge.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await mustDeny('duplicate in the last slot of the 20-row window denies index-zero booking',
      ()=>book('2099-03-09','DA0001','ABC001',0,0,80));

    const forgedVehicle=fleet(1,2);
    forgedVehicle.vehicles[0]=vehicle('ABC-123');
    await seed(forgedVehicle.drivers,forgedVehicle.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'XYZ999',rendszam:'XYZ-999',sourceIndex:0}]
    });
    await mustDeny('privileged forged vehicle index 0 belongs to a different plate',
      ()=>book('2099-03-14','DA0001','XYZ999',0,0,80));

    const full=fleet(20,1);
    await seed(full.drivers,full.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await book('2099-03-12','DA0001','ABC001',0,0,80);
    assert.equal((await getDoc(doc(client,'bookings','2099-03-12__ABC001'))).exists(),true);
    console.log('PASS ALLOW [E+SDK]: unique 20-driver archive at the proof-window limit still books');

    const over=fleet(21,1);
    await seed(over.drivers,over.vehicles,{
      driverSlots:[{id:'DA0001',daCode:'DA0001',capacity:80,sourceIndex:0}],
      vehicleSlots:[{id:'ABC001',rendszam:'ABC-001',sourceIndex:0}]
    });
    await mustDeny('unique archive longer than the 20-row proof window fails closed',
      ()=>book('2099-03-10','DA0001','ABC001',0,0,80));

    const clean=fleet(1,1);
    await seed(clean.drivers,clean.vehicles,slotsFor(clean.drivers,clean.vehicles));
    await book('2099-03-11','DA0001','ABC001',0,0,80);
    assert.equal((await getDoc(doc(client,'bookings','2099-03-11__ABC001'))).exists(),true);
    console.log('PASS ALLOW [E+SDK]: clean one-row archive still books after the poisoned denials');

    if(findings.length)
      throw Error('P0 WINDOW NO-GO: '+findings.join('; '));
    console.log('PASS: privileged poisoned normalized duplicates DENY and valid bookings ALLOW');
  }finally{
    await env.cleanup();
  }
}
main().catch(err=>{console.error('P0 POISONED DUPLICATE WINDOW FAILED:',err);process.exitCode=1;});
