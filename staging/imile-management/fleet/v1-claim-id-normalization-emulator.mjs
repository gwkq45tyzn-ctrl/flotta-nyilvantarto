/**
 * RED-TEAM ACCEPTANCE: official DA codes preserve '-' and '_' characters.
 * This probes the actual modified restricted V1 Rules, NOT a toy Rules file.
 * It is intentionally RED until valid hyphenated DA claims can be created
 * using their true normalized business key (and bad stripped-key claims DENY).
 * All records are synthetic; local Firestore emulator only.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,Timestamp} from 'firebase/firestore';

const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const digest='d'.repeat(64);
const raw=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(raw,/REPLACE_WITH_REAL_SHARED_UID/);
const rules=raw.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid);
const env=await initializeTestEnvironment({
  projectId:'demo-imile-restricted-v1',
  firestore:{host:'127.0.0.1',port:8787,rules}
});
const db=env.authenticatedContext(uid,{email}).firestore();
const fleet=db=>doc(db,'flottaSharedState','current');
const claim=(kind,id)=>doc(db,kind,id);
const logs=[];
async function testAllow(label,action){
  try{await action();console.log('PASS ALLOW [E+SDK]: '+label);}
  catch(e){
    if(e.code!=='permission-denied')throw e;
    const msg='P1 FAIL [E+SDK]: legal claim DENIED '+label;
    logs.push(msg);console.error(msg);
  }
}
async function testDeny(label,action){
  try{
    await action();
    const msg='P1 FAIL [E+SDK]: forbidden claim ALLOWED '+label;
    logs.push(msg);console.error(msg);
  }catch(e){
    if(e.code!=='permission-denied')throw e;
    console.log('PASS DENY [E+SDK]: '+label);
  }
}
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,'users',uid),{name:'SYNTHETIC ADMIN',active:true,role:'admin'});
    await setDoc(doc(admin,'flottaMigrationApproval','current'),{
      status:'approved',approvedUid:uid,sourceSha256:digest,
      approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))
    });
    await setDoc(fleet(admin),{
      revision:1,migrationSourceSha256:digest,
      vehicles:[{rendszam:'ABC-123',normalizedPlate:'ABC123',status:'aktiv'}],
      drivers:[
        {daCode:'DA0001',status:'aktiv',kapacitas:50},
        {daCode:'DA-0002',status:'aktiv',kapacitas:70},
        {daCode:'DA_0003',status:'aktiv',kapacitas:80}
      ],
      fuelCards:[],contacts:[]
    });
  });
  await testAllow('unpunctuated DA0001 claim',()=>setDoc(
    claim('flottaDriverClaims','DA0001'),{sourceIndex:0,revision:1}));
  await testAllow('normalized plate ABC123 claim',()=>setDoc(
    claim('flottaVehicleClaims','ABC123'),{sourceIndex:0,revision:1}));

  // Business DA normalization must be upper-case ONLY. These two valid IDs
  // are different from DA0002 and DA0003 respectively. PR #135 established
  // real original canonical booking support for such IDs.
  await testAllow('DA-0002 keeps hyphen as actual claim document ID',()=>setDoc(
    claim('flottaDriverClaims','DA-0002'),{sourceIndex:1,revision:1}));
  await testAllow('DA_0003 keeps underscore as actual claim document ID',()=>setDoc(
    claim('flottaDriverClaims','DA_0003'),{sourceIndex:2,revision:1}));

  // A claim for DA0002 must not be permitted to refer to row DA-0002.
  // This would mismatch the real booking's ID and could mask an identity
  // collision or silently block legitimate bookings.
  await testDeny('stripped DA0002 claim forged for distinct DA-0002 row',()=>setDoc(
    claim('flottaDriverClaims','DA0002'),{sourceIndex:1,revision:1}));

  assert.equal(logs.length,0,
    'P1 RELEASE BLOCKER: Rules normalization differs from #135 DA business identity: '+logs.join('; '));
  console.log('CLAIM IDENTITY ACCEPTANCE PASS on real restricted Firestore Rules');
} finally {await env.cleanup();}
