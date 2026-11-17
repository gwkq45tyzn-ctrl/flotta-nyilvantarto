import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assessPrivateCapacityTransition}
  from './v1-private-capacity-transition.mjs';
import {prepareReviewedCourierCapacities}
  from './v1-capacity-remediation.mjs';

const sample=()=>({
  drivers:Array.from({length:12},(_,i)=>({
    id:'synthetic-owner-driver-'+i,
    daCode:'DA'+String(i+1).padStart(4,'0'),
    status:i<6?'aktiv':i<9?'inaktiv':'ismeretlen',
    name:'PRIVATE_DRIVER_CANARY',phone:'PRIVATE_PHONE_CANARY',
    history:[{nested:{driver:i,unknown:['PRIVATE_DRIVER_HISTORY_CANARY',i]}}]
  })),
  vehicles:Array.from({length:14},(_,i)=>({
    id:'synthetic-owner-vehicle-'+i,rendszam:'TST-'+String(100+i),
    status:'aktiv',km:40000+i,kovetkezoSzervizKm:45000+i,
    history:[{rich:{service:{id:'PRIVATE_SERVICE_CANARY',i}}}]
  })),
  fuelCards:Array.from({length:14},(_,i)=>({
    id:'synthetic-fuel-'+i,secret:'PRIVATE_CARD_CANARY',history:[{i}]
  })),
  contacts:Array.from({length:5},(_,i)=>({
    id:'synthetic-contact-'+i,name:'PRIVATE_CONTACT_CANARY',
    unknown:{deep:{i}}
  })),
  futureMeta:{nested:{persist:'PRIVATE_ROOT_CANARY'}}
});
const decisions=()=>Array.from({length:6},(_,i)=>({
  daCode:'DA'+String(i+1).padStart(4,'0'),
  kapacitas:70,reviewed:true
}));
const row=s=>JSON.stringify([88,'2026-11-17T10:00:00.000Z',JSON.stringify(s)]);
function input(src=sample(),reviews=decisions()){
  const r=row(src);
  return {firstText:r,secondText:r,originalText:JSON.stringify(src),
    candidateText:JSON.stringify(prepareReviewedCourierCapacities(src,reviews).candidate),
    decisionsText:JSON.stringify(reviews)};
}
function redacted(output){
  for(const s of ['PRIVATE_DRIVER_CANARY','PRIVATE_PHONE_CANARY',
    'PRIVATE_DRIVER_HISTORY_CANARY','PRIVATE_CARD_CANARY',
    'PRIVATE_CONTACT_CANARY','PRIVATE_ROOT_CANARY',
    'PRIVATE_SERVICE_CANARY','DA0001','TST-100','PRIVATE_PATH_CANARY'])
    assert.equal(output.includes(s),false,'private value leaked');
}
const cli=resolve('tools/v1-private-capacity-transition.mjs');
function runCLI(inputs){
  const dir=mkdtempSync(join(tmpdir(),'imile-private-owner-transition-'));
  const filemap={};
  try{
    for(const [key,flag] of Object.entries({
      firstText:'first',secondText:'second',
      originalText:'original',candidateText:'candidate',decisionsText:'decisions'
    })){
      const path=join(dir,flag+'-PRIVATE_PATH_CANARY.txt');
      filemap[key]=path;
      writeFileSync(path,inputs[key],{mode:0o600});
    }
    const before=Object.fromEntries(Object.entries(filemap).map(([k,v])=>
      [k,readFileSync(v,'utf8')]));
    const p=spawnSync(process.execPath,[cli,
      '--first',filemap.firstText,'--second',filemap.secondText,
      '--original',filemap.originalText,'--candidate',filemap.candidateText,
      '--decisions',filemap.decisionsText,'--json'
    ],{cwd:resolve('.'),timeout:20000,encoding:'utf8'});
    for(const [key,path] of Object.entries(filemap))
      assert.equal(readFileSync(path,'utf8'),before[key],'private file never modified');
    redacted(p.stdout+p.stderr);
    return p;
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('capacity-only preview preserves full rich fields but three uncertain statuses BLOCK readiness',()=>{
  const src=sample(),r=assessPrivateCapacityTransition(input(src));
  assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false,r.reasons.join(','));
  assert.equal(r.readbackStable,true);
  assert.equal(r.originalFileMatchesReadback,true);
  assert.equal(r.fullRichCandidateMatchesExpected,true);
  assert.equal(r.allActiveDriversIndividuallyReviewed,true);
  assert.equal(r.candidateOperationalReadiness,false);
  assert.equal(r.counts.drivers,12);
  assert.equal(r.counts.vehicles,14);
  assert.equal(r.counts.activeReviewed,6);
  assert.equal(r.counts.capacitiesActuallyChanged,6);
  assert.equal(r.counts.activeMissingBefore,6);
  assert.equal(r.counts.ownedReadDocuments,56);
  assert.ok(r.statusReviewWarnings.includes('DRIVER_STATUS_NEEDS_OWNER_REVIEW'));
  assert.equal(r.actualLiveSourceAuthorityVerified,false);
  assert.equal(r.independentlyRestorableBackupVerified,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionReleaseAuthorized,false);
  assert.equal(src.drivers[0].kapacitas,undefined,'original untouched');
  redacted(JSON.stringify(r));
  const p=runCLI(input(src));
  assert.equal(p.status,2,p.stderr);
  assert.equal(JSON.parse(p.stdout).locallyProvenOnlyReviewedCapacitiesChanged,false);
});
test('unreviewed active driver is DENIED even if its old capacity was valid',()=>{
  const src=sample(),review=decisions();
  src.drivers[0].kapacitas=80;
  const inpt=input(src,review);
  inpt.decisionsText=JSON.stringify(review.slice(1));
  const r=assessPrivateCapacityTransition(inpt);
  assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
  assert.ok(r.reasons.includes('MISSING_OR_INVALID_INDIVIDUAL_ACTIVE_DRIVER_REVIEW'));
  assert.equal(r.authorizedForImport,false);
});
test('missing decision, implicit 70 and owner trying to change inactive driver all DENIED',()=>{
  const original=input();
  for(const decision of [
    decisions().slice(0,5),
    decisions().map((d,i)=>i===1?{...d,reviewed:false}:d),
    decisions().map((d,i)=>i===1?{...d,kapacitas:0}:d),
    decisions().map((d,i)=>i===1?{...d,daCode:'DA0009'}:d),
    decisions().map((d,i)=>i===1?{...d,daCode:'DA0001'}:d)
  ]){
    const r=assessPrivateCapacityTransition({...original,decisionsText:JSON.stringify(decision)});
    assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
    assert.ok(r.reasons.includes('MISSING_OR_INVALID_INDIVIDUAL_ACTIVE_DRIVER_REVIEW'));
  }
});
test('unexpected rich nested mutation, contact tamper, plate drift and hidden driver capacity drift DENIED',()=>{
  const original=input(),candidate=JSON.parse(original.candidateText);
  const mutations=[
    v=>{v.drivers[0].history[0].nested.unknown[0]='ALTERED';},
    v=>{v.contacts[0].unknown.deep.i=99;},
    v=>{v.fuelCards[0].history.push({new:true});},
    v=>{v.futureMeta.nested.persist='ALTERED';},
    v=>{v.vehicles[0].km=999999;},
    v=>{v.drivers[6].kapacitas=70;},
    v=>{v.drivers[1].kapacitas=80;},
    v=>{v.vehicles[0].rendszam='TST-999';}
  ];
  for(const change of mutations){
    const v=structuredClone(candidate);change(v);
    const r=assessPrivateCapacityTransition({...original,candidateText:JSON.stringify(v)});
    assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
    assert.ok(r.reasons.includes('UNREVIEWED_RICH_FIELD_CHANGE_OR_CAPACITY_DRIFT'));
    redacted(JSON.stringify(r));
  }
});
test('source revision/time/drift and original saved source mismatch fail closed before candidate review',()=>{
  const original=input();
  for(const change of [
    v=>{v.secondText=JSON.stringify([89,'2026-11-17T10:00:00.000Z',original.originalText]);},
    v=>{v.secondText=JSON.stringify([88,'2026-11-17T10:01:00.000Z',original.originalText]);},
    v=>{v.secondText=JSON.stringify([88,'2026-11-17T10:00:00.000Z',JSON.stringify({
      ...JSON.parse(original.originalText),futureMeta:{nested:{persist:'ALTERED'}}
    })]);},
    v=>{v.originalText=JSON.stringify(JSON.parse(original.originalText),null,2);}
  ]){
    const v={...original};change(v);
    const r=assessPrivateCapacityTransition(v);
    assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
    assert.ok(r.reasons.includes('ORIGINAL_READBACK_OR_SAVED_BYTES_DENIED'));
  }
});
test('malformed candidate/review data and wrong number of active decisions never become production GO',()=>{
  const original=input();
  for(const [k,bad] of [
    ['candidateText','{"drivers":'],
    ['decisionsText','{"capacity":70}'],
    ['decisionsText','[{"daCode":"DA0001","reviewed":true,"kapacitas":70}]']
  ]){
    const r=assessPrivateCapacityTransition({...original,[k]:bad});
    assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
    assert.equal(r.authorizedForImport,false);
    redacted(JSON.stringify(r));
  }
});
test('fully separate owner private files read-only CLI rejects tampered rich candidate',()=>{
  const source=input();
  const cand=JSON.parse(source.candidateText);
  cand.drivers[0].history[0].nested.driver=99;
  source.candidateText=JSON.stringify(cand);
  const p=runCLI(source);
  assert.equal(p.status,2,p.stderr);
  assert.ok(JSON.parse(p.stdout).reasons.includes('UNREVIEWED_RICH_FIELD_CHANGE_OR_CAPACITY_DRIFT'));
});
test('owner CLI refuses unrecognized/duplicate flags and never accepts cloud/deploy operation',()=>{
  const p=spawnSync(process.execPath,[cli,
    '--first','/PRIVATE_PATH_CANARY','--second','/private/a',
    '--original','/private/b','--candidate','/private/c',
    '--deploy','/private/d','--json'
  ],{cwd:resolve('.'),timeout:10000,encoding:'utf8'});
  assert.equal(p.status,1);
  assert.deepEqual(JSON.parse(p.stdout).reasons,['INVALID_ARGUMENTS']);
  redacted(p.stdout+p.stderr);
});

import {prepareReviewedCourierOperations} from './v1-capacity-remediation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';
function operationsInput(){
  const src=sample(),plan={sourceSha256:sha256(src),capacities:decisions(),
    statuses:src.drivers.slice(9).map((d,i)=>({id:d.id,daCode:d.daCode,
      status:i===0?'aktiv':'inaktiv',reviewed:true}))};
  plan.capacities.push({daCode:src.drivers[9].daCode,kapacitas:43,reviewed:true});
  const prepared=prepareReviewedCourierOperations(src,plan);
  assert.equal(prepared.ok,true,prepared.reason);
  const capture=row(src);
  return {src,plan,candidate:prepared.candidate,inputs:{
    firstText:capture,secondText:capture,originalText:JSON.stringify(src),
    candidateText:JSON.stringify(prepared.candidate),decisionsText:JSON.stringify(plan)}};
}
test('complete digest-bound status/capacity decisions preserve every other field; private CLI PASS without authority',()=>{
  const {src,candidate,inputs}=operationsInput(),before=JSON.stringify(src);
  const r=assessPrivateCapacityTransition(inputs);
  assert.equal(r.locallyProvenOnlyReviewedOperationsChanged,true,JSON.stringify(r));
  assert.equal(r.locallyProvenReviewedTransition,true);
  assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
  assert.equal(r.candidateOperationalReadiness,true);
  assert.equal(r.allUncertainStatusesIndividuallyReviewed,true);
  assert.equal(r.reviewedDecisionsAuthenticated,false);
  assert.equal(r.authorizedForImport,false);
  for(const key of ['vehicles','fuelCards','contacts','futureMeta'])assert.deepEqual(candidate[key],src[key]);
  candidate.drivers.forEach((d,i)=>{
    const a=structuredClone(d),b=structuredClone(src.drivers[i]);
    delete a.kapacitas;delete b.kapacitas;
    if(i>=9){delete a.status;delete b.status;}
    assert.deepEqual(a,b);
  });
  assert.equal(JSON.stringify(src),before);
  const cli=runCLI(inputs);assert.equal(cli.status,0,cli.stderr);redacted(cli.stdout+cli.stderr);
});
test('review plans deny stale whole-source pins, missing/duplicate/unreviewed status or resulting active capacity',()=>{
  for(const mutate of [
    p=>p.sourceSha256='a'.repeat(64),p=>p.statuses.pop(),
    p=>p.statuses[1]=structuredClone(p.statuses[0]),
    p=>p.statuses[0].reviewed=false,p=>p.statuses[0].status='ismeretlen',
    p=>p.statuses[0].daCode='DA9999',p=>p.statuses[0].id='foreign',
    p=>p.capacities.pop(),p=>p.capacities[6].kapacitas=null,
    p=>p.capacities[6].kapacitas='70',p=>p.capacities[6].reviewed=false,
    p=>p.capacities.push(structuredClone(p.capacities[0])),
    p=>p.authorizedForImport=true
  ]){
    const {inputs,plan}=operationsInput();mutate(plan);inputs.decisionsText=JSON.stringify(plan);
    const r=assessPrivateCapacityTransition(inputs);
    assert.equal(r.locallyProvenReviewedTransition,false,JSON.stringify(r));
    assert.equal(r.authorizedForImport,false);redacted(JSON.stringify(r));
  }
});
test('unreviewed rich history change and source drift cannot hide behind owner status decisions',()=>{
  const {inputs,candidate}=operationsInput();
  candidate.fuelCards[0].history.push({nested:'PRIVATE_TAMPER_CANARY'});
  inputs.candidateText=JSON.stringify(candidate);
  const r=assessPrivateCapacityTransition(inputs);
  assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,false);
  assert.equal(r.fullRichCandidateMatchesExpected,false);
  const fresh=operationsInput();fresh.src.contacts[0].unknown.deep.i=999;
  fresh.inputs.originalText=JSON.stringify(fresh.src);
  fresh.inputs.firstText=row(fresh.src);fresh.inputs.secondText=row(fresh.src);
  assert.ok(assessPrivateCapacityTransition(fresh.inputs).reasons.includes('REVIEW_SOURCE_CHANGED_OR_PLAN_INVALID'));
});
