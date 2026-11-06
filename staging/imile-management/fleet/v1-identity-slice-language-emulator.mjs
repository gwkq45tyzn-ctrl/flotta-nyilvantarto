/**
 * Synthetic, isolated Firestore Rules capability probe for a bounded,
 * counter-backed identity transition (Claude P2s proposal, independently
 * constructed). NOT deployed, NOT the actual production/restricted Rules.
 *
 * Tests whether Rules list RANGE operators, map.diff(), and indexed proof
 * really compile, and whether they deny direct-SDK counter/index forgery.
 * Success DOES NOT prove a trustworthy initial counter bootstrap, legacy
 * writers, the simultaneous vehicle/driver gate, or global safety of #114.
 */
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

const projectId = 'demo-imile-identity-slice-capabilities';
const rules = String.raw`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /identitySliceProbes/{probeId} {
      function goodOwner() {
        return request.auth != null && request.auth.uid == 'synthetic-editor';
      }
      function sameOtherRows(oldList, newList, idx) {
        return idx is int
          && idx >= 0 && idx < oldList.size()
          && oldList.size() == newList.size()
          // Firestore emulator treats empty [0:0] or [n:n] as an out-of-range
          // error. Explicitly short-circuit BOTH boundary cases.
          && (idx == 0 || oldList[0:idx] == newList[0:idx])
          && (idx == oldList.size() - 1 ||
              oldList[idx + 1:oldList.size()] == newList[idx + 1:newList.size()]);
      }
      function countTransition(oldCnt, newCnt, oldRaw, newRaw) {
        let oldKey = oldRaw.upper();
        let newKey = newRaw.upper();
        return oldRaw.matches('^[A-Za-z0-9_-]{4,40}$')
          && newRaw.matches('^[A-Za-z0-9_-]{4,40}$')
          && (
            (oldKey == newKey && oldCnt.get(oldKey, 0) == 1 && oldCnt == newCnt)
            || (oldKey != newKey
              && oldCnt.get(oldKey, 0) == 1
              && oldCnt.get(newKey, 0) == 0
              && newCnt.get(oldKey, 0) == oldCnt.get(oldKey, 0) - 1
              && newCnt.get(newKey, 0) == 1
              && newCnt.diff(oldCnt).affectedKeys().hasOnly([oldKey, newKey]))
          );
      }
      function boundedDriverEdit() {
        let before = resource.data;
        let after = request.resource.data;
        let idx = after.lastChange.driverIndex;
        let oldList = before.drivers;
        let newList = after.drivers;
        return before.drivers is list && after.drivers is list
          && before.identity.daCnt is map && after.identity.daCnt is map
          && after.identity.keys().hasOnly(['daCnt'])
          && after.revision is int && before.revision is int
          && after.revision == before.revision + 1
          && after.diff(before).affectedKeys().hasOnly(['drivers', 'identity', 'lastChange', 'revision'])
          && sameOtherRows(oldList, newList, idx)
          && countTransition(before.identity.daCnt, after.identity.daCnt,
                             oldList[idx].daCode, newList[idx].daCode);
      }
      allow get: if goodOwner();
      // Creation is intentionally server-seeded to model a trusted bootstrap.
      allow create, delete: if false;
      allow update: if goodOwner() && boundedDriverEdit();
    }
  }
}`;
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8787, rules }
});
const editor = env.authenticatedContext('synthetic-editor').firestore();
const intruder = env.authenticatedContext('synthetic-intruder').firestore();
const target = doc(editor, 'identitySliceProbes', 'synthetic');
const base = () => ({
  drivers: [
    { daCode: 'DA-0001', name: 'SYNTHETIC FIRST', history: [{note:'original'}] },
    { daCode: 'DA0002', name: 'SYNTHETIC SECOND', history: [{note:'untouched'}] }
  ],
  vehicles: [{ rendszam: 'TEST0001', history: [] }],
  fuelCards: [{id:'SYNTHETIC'}],
  contacts: [{id:'SYNTHETIC'}],
  revision: 1,
  identity: { daCnt: {'DA-0001':1, DA0002:1} },
  lastChange: {driverIndex:0}
});
const clone = x => structuredClone(x);
async function seed(value=base()) {
  await env.withSecurityRulesDisabled(ctx =>
    setDoc(doc(ctx.firestore(), 'identitySliceProbes', 'synthetic'), value));
}
async function allowed(name, next) {
  await updateDoc(target, {...next,revision:next.revision ?? 2});
  console.log('PASS ALLOW [E+SDK] ' + name);
}
async function denied(name, next, db=editor) {
  try {
    await updateDoc(doc(db, 'identitySliceProbes', 'synthetic'),
                    {...next,revision:next.revision ?? 2});
  } catch(err) {
    if(err.code === 'permission-denied') {
      console.log('PASS DENY [E+SDK] ' + name);
      return;
    }
    throw Error('UNEXPECTED error on '+name+': '+err.message, {cause:err});
  }
  throw Error('UNEXPECTED DIRECT SDK AUTHORIZATION '+name);
}
try {
  // Valid non-identity change: preserving the rest of the array must work.
  await seed();
  let x=base(); x.drivers[0].name='EDITED SYNTHETIC FIRST';
  await allowed('rich single-row edit without identity change',
                {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  assert.equal((await getDoc(target)).data().drivers[0].history[0].note,'original');

  // Business DA "-" and "_" are both valid and MUST remain distinct.
  await seed();
  x=base();
  x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':0,DA0002:1,DA_0003:1};
  await allowed('legitimate hyphenated DA rename to underscore-preserving new key',
                {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  assert.equal((await getDoc(target)).data().identity.daCnt.DA_0003,1);

  // Boundary positive control: the last row can be edited without changing DA.
  await seed();
  x=base(); x.drivers[1].name='LEGITIMATE LAST ROW EDIT';
  await allowed('legitimate final-index edit preserves identity',
                {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:1}});
  assert.equal((await getDoc(target)).data().drivers[0].name,'SYNTHETIC FIRST');

  // Same normalized identity with different ASCII case must not change counts.
  await seed();
  x=base(); x.drivers[0].daCode='da-0001';
  await allowed('ASCII case-only identity edit preserves count',
                {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});

  // Counter data must be exact, and index/revision claims must be typed.
  await seed();
  x=base(); x.drivers[0].name='LEGITIMATE BUT WITH FORGED METADATA';
  await denied('extra identity counter namespace injected',
               {drivers:x.drivers,identity:{...x.identity,vehicleCnt:{}},
                lastChange:{driverIndex:0}});
  await denied('string index cannot select a row',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:'0'}});
  await denied('revision jump cannot bypass stale writer protection',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0},revision:99});

  // A direct SDK writer may NOT rename a different DA into an existing key.
  await seed();
  x=base();x.drivers[1].daCode='da-0001';
  x.identity.daCnt={'DA-0001':2,DA0002:0};
  await denied('case-normalized collision with first DA',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:1}});

  // A counter map supplied by the same browser is NOT trusted blindly.
  await seed();
  x=base();x.drivers[0].daCode='DA_0003';
  await denied('forged unchanged count map on changed DA',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  x=base();x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':0,DA0002:999,DA_0003:1};
  await denied('forge unrelated DA count',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});

  // A known duplicate-count legacy seed must park BOTH rows.
  // This does not establish trusted initial counters or global uniqueness.
  const legacy=base();
  legacy.drivers[1].daCode='da-0001';
  legacy.identity.daCnt={'DA-0001':2};
  await seed(legacy);
  x=clone(legacy); x.drivers[0].name='FIRST DUPLICATE';
  await denied('legacy duplicate first row cannot edit',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  x=clone(legacy); x.drivers[1].name='SECOND DUPLICATE';
  await denied('legacy duplicate second row cannot edit',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:1}});
  x=clone(legacy); x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':1,DA_0003:1};
  await denied('legacy duplicate cannot launder first identity by rename',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  await seed();

  // CRITICAL COUNTER-BOOTSTRAP COUNTEREXAMPLE: if a privileged seed or
  // legacy writer publishes a FALSE count of 1 for TWO normalized-equal rows,
  // this bounded Rules protocol ALLOWS either row to be edited. This is an
  // intentionally expected exploit, NOT a passing production security gate.
  // It proves that Rules cannot recover global truth from an untrusted map.
  const poisoned=base();
  poisoned.drivers[1].daCode='da-0001';
  poisoned.identity.daCnt={'DA-0001':1};
  await seed(poisoned);
  x=clone(poisoned); x.drivers[0].name='POISONED FIRST DUPLICATE EDIT';
  await allowed('EXPECTED UNSAFE: poisoned counter permits first duplicate',
    {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  x=clone(x); x.drivers[1].name='POISONED SECOND DUPLICATE EDIT';
  await allowed('EXPECTED UNSAFE: poisoned counter permits second duplicate',
    {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:1},revision:3});
  assert.equal((await getDoc(target)).data().drivers[0].daCode,'DA-0001');
  assert.equal((await getDoc(target)).data().drivers[1].daCode,'da-0001');
  console.log('P0 COUNTEREXAMPLE [E+SDK]: both duplicate rows editable when seeded count lies; production NO-GO');
  await seed();

  // The claimed index must actually be the only modified array element.
  await seed();
  x=base();x.drivers[1].name='OTHER ROW CHANGED';
  await denied('forged first index while editing second row',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  x=base();
  x.drivers[0].name='FIRST CHANGED';
  x.drivers[1].name='SECOND CHANGED';
  await denied('multi-row change hidden behind one index',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});

  // A trusted source sidecar cannot be silently overwritten by the browser
  // while claiming a valid single-row identity edit.
  await seed();
  x=base();x.drivers[0].name='LEGITIMATE';
  await denied('unrelated rich vehicle sidecar modification',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0},
                 vehicles:[{rendszam:'FORGED',history:[]}]});
  await denied('unauthorized UID cannot edit',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}},intruder);

  // Reject direct SDK attempts to change cardinality, bypass row proof,
  // or turn a counted identity into an uncounted one. These are isolated
  // Rules capability checks, not proof of trusted bootstrap.
  await seed();
  x=base(); x.drivers.push({daCode:'DA0003',name:'INSERTED',history:[]});
  x.identity.daCnt.DA0003=1;
  await denied('direct SDK appended driver cannot bypass one-row proof',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:2}});
  await seed();
  x=base(); x.drivers.pop();
  x.identity.daCnt.DA0002=0;
  await denied('direct SDK driver deletion cannot bypass one-row proof',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  await seed();
  x=base(); x.drivers[0].name='EDIT WITH UNCOUNTED IDENTITY';
  x.identity.daCnt['DA-0001']=0;
  await denied('same DA edit cannot silently zero its identity counter',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  await seed();
  x=base(); x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':0,DA0002:1,DA_0003:1,EXTRA:1};
  await denied('DA rename cannot introduce an unrelated positive identity',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  await seed();
  x=base(); x.drivers[0].name='EDIT WITH VEHICLE STATUS SPOOF';
  await denied('direct SDK vehicle service status mutation is not a driver edit',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0},
                vehicles:[{rendszam:'TEST0001',status:'service',history:[]}]});

  // Rich driver history remains editable for a legitimate single-row change,
  // but a direct SDK writer cannot use that edit to smuggle a separate
  // top-level capacity or fuel-card change into the same request.
  await seed();
  x=base(); x.drivers[0].history.push({note:'synthetic history append'});
  await allowed('legitimate same-driver history append preserves other rows',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  assert.equal((await getDoc(target)).data().drivers[0].history.length,2);
  await seed();
  x=base(); x.drivers[0].history.push({note:'attempted mixed mutation'});
  await denied('driver history edit cannot smuggle capacity sidecar',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0},
                capacity:{DA0002:999}});
  await denied('driver history edit cannot smuggle fuelCards mutation',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0},
                fuelCards:[{id:'FORGED'}]});
  await seed();
  x=base(); x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':0,DA0002:1,DA_0003:1};
  await denied('identity rename cannot smuggle arbitrary lastChange field',
               {drivers:x.drivers,identity:x.identity,
                lastChange:{driverIndex:0,vehicleIndex:0}});

  // Unicode case-folding cannot create a second ASCII business identity.
  await seed();
  x=base();x.drivers[0].daCode='DA\u0131001';
  x.identity.daCnt={'DA-0001':0,DA0002:1,DAI001:1};
  await denied('non-ASCII dotless-i business DA',
               {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});

  // Stale update after a successful identity change must fail rather than
  // clobbering the next writer's current counters.
  await seed();
  x=base();x.drivers[0].daCode='DA_0003';
  x.identity.daCnt={'DA-0001':0,DA0002:1,DA_0003:1};
  await allowed('sequential rename establishes new count',
                {drivers:x.drivers,identity:x.identity,lastChange:{driverIndex:0}});
  const stale=base();stale.drivers[0].daCode='DA_0004';
  stale.identity.daCnt={'DA-0001':0,DA0002:1,DA_0004:1};
  await denied('stale previous identity writer cannot reset counters',
               {drivers:stale.drivers,identity:stale.identity,lastChange:{driverIndex:0}});

  // Large synthetic rich sidecar (no customer data). This probes Rules
  // evaluation in a document approaching, but not exceeding, 1 MiB.
  const heavy=base();
  heavy.vehicles[0].history=[{note:'S'.repeat(800000)}];
  await seed(heavy);
  const heavyNext=clone(heavy);
  heavyNext.drivers[0].name='CHANGED WITHOUT TOUCHING 800KB HISTORY';
  await allowed('bounded single-row edit on synthetic ~800KiB document',
                {drivers:heavyNext.drivers,identity:heavyNext.identity,
                 lastChange:{driverIndex:0}});
  assert.equal((await getDoc(target)).data().vehicles[0].history[0].note.length,800000);

  // S1-S4-inspired stress: unlike a large *unrelated* vehicle sidecar,
  // this actually forces list-range equality over ~120 rich DRIVER records
  // with a 740KB nested history in a record outside the changed index.
  // First and final index edits probe both range-boundary branches.
  const richDrivers=base();
  richDrivers.drivers=Array.from({length:120},(_,i)=>({
    daCode:'DA'+String(10000+i),
    name:'SYNTHETIC DRIVER '+i,
    history:[{event:'original',at:i}]
  }));
  richDrivers.drivers[80].history[0].note='H'.repeat(740000);
  richDrivers.identity.daCnt=Object.fromEntries(
    richDrivers.drivers.map(d=>[d.daCode,1]));
  richDrivers.lastChange={driverIndex:0};
  await seed(richDrivers);
  const first=clone(richDrivers);
  first.drivers[0].name='EDITED FIRST WITH LARGE SUFFIX';
  await allowed('large 120-driver suffix range proof with 740KB history',
    {drivers:first.drivers,identity:first.identity,lastChange:{driverIndex:0}});
  const last=clone(first);
  last.drivers[119].name='EDITED LAST WITH LARGE PREFIX';
  await allowed('large 120-driver prefix range proof with 740KB history',
    {drivers:last.drivers,identity:last.identity,lastChange:{driverIndex:119},
     revision:3});
  const finalDoc=(await getDoc(target)).data();
  assert.equal(finalDoc.drivers[80].history[0].note.length,740000);
  assert.equal(finalDoc.drivers[119].name,'EDITED LAST WITH LARGE PREFIX');
  console.log('S1-S4 BOUNDED PASS: 120 driver rows, 740KB nested history, '+
              'prefix and suffix Rules range checks on local emulator');
  console.log('CAPABILITY PASS: Firestore Rules range proof + count-map diff compile, '+
              'enforce one row and preserve large rich sidecars on local emulator');
  console.log('NOT PROVEN: global Fleet identity under legacy writers, trusted bootstrap, '+
              'driver+vehicle combined Rules, original HTML edit lifecycle or #133 fixes');
} finally {
  await env.cleanup();
}
