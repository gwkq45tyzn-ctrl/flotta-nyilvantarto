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
test('12 drivers and 14 cars: six explicit owner 70 reviews, full rich arrays and unknown keys unchanged',()=>{
  const src=sample(),r=assessPrivateCapacityTransition(input(src));
  assert.equal(r.locallyProvenOnlyReviewedCapacitiesChanged,true,r.reasons.join(','));
  assert.equal(r.readbackStable,true);
  assert.equal(r.originalFileMatchesReadback,true);
  assert.equal(r.fullRichCandidateMatchesExpected,true);
  assert.equal(r.allActiveDriversIndividuallyReviewed,true);
  assert.equal(r.candidateOperationalReadiness,true);
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
  assert.equal(p.status,0,p.stderr);
  assert.equal(JSON.parse(p.stdout).locallyProvenOnlyReviewedCapacitiesChanged,true);
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
