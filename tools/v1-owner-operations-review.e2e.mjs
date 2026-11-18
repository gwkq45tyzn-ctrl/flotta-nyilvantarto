/**
 * REAL offline Chromium owner-operations UI: exactly the source-bound plan
 * accepted by the standalone local Node reviewer. SYNTHETIC rich records ONLY.
 * No HTTP, cloud storage, real owner identity or production updates.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '../staging/imile-management/fleet/node_modules/playwright/index.mjs';
import {prepareReviewedCourierOperations} from './v1-capacity-remediation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const source=()=>({
  drivers:Array.from({length:12},(_,i)=>({
    id:'synthetic-owner-driver-'+i,
    daCode:'DA'+String(i+1).padStart(4,'0'),
    status:i<6?'aktiv':i<9?'inaktiv':'ismeretlen',
    ...(i===1?{kapacitas:80}:{}),
    name:'PRIVATE_OWNER_NAME_CANARY',phone:'PRIVATE_OWNER_PHONE_CANARY',
    history:[{deep:{nested:{index:i,keep:'PRIVATE_RICH_HISTORY_CANARY'}}}]
  })),
  vehicles:Array.from({length:14},(_,i)=>({
    id:'synthetic-owner-vehicle-'+i,
    rendszam:'QA-'+String(1000+i),
    status:'aktiv',km:10000+i,
    history:[{event:'service',future:{i,keep:'PRIVATE_VEHICLE_CANARY'}}]
  })),
  fuelCards:Array.from({length:14},(_,i)=>({
    id:'synthetic-owner-card-'+i,secret:'PRIVATE_CARD_CANARY',
    history:[{deep:i}]
  })),
  contacts:Array.from({length:5},(_,i)=>({
    id:'synthetic-owner-contact-'+i,secret:'PRIVATE_CONTACT_CANARY',
    history:[{i}]
  })),
  unknownRoot:{nested:{mustRemain:'PRIVATE_ROOT_CANARY'}}
});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();
const http=[];
page.on('request',r=>{if(/^https?:/i.test(r.url()))http.push(r.url());});
async function load(value){
  const raw=typeof value==='string'?value:JSON.stringify(value);
  await page.locator('#sourceFile').setInputFiles({
    name:'SYNTHETIC_PRIVATE_OWNER_SOURCE.json',
    mimeType:'application/json',buffer:Buffer.from(raw)
  });
  await page.waitForFunction(()=>!document.querySelector('#sourceMessage')
    .textContent.includes('vizsgálata…'));
}
async function save(button){
  const pending=page.waitForEvent('download');
  await page.locator(button).click();
  return await pending;
}
try{
  await page.goto(pathToFileURL(resolve('tools/v1-owner-operations-review.html')).href);
  assert.match(await page.title(),/offline státusz és kapacitás/i);
  assert.equal(await page.locator('#prepareButton').isDisabled(),true);
  const s=source(),before=JSON.stringify(s);
  await load(s);
  assert.equal(await page.locator('#statusPanel').isVisible(),true);
  assert.equal(await page.locator('#capacityPanel').isVisible(),true);
  assert.match(await page.locator('#shape').innerText(),/56\/120/);
  assert.match(await page.locator('#shape').innerText(),/külön tulajdonosi státuszdöntés: 3/);
  assert.equal(await page.locator('#statusRows tr').count(),3);
  assert.equal(await page.locator('#capacityRows tr').count(),6);
  assert.equal(await page.locator('#prepareButton').isDisabled(),true);

  const firstStatus=page.getByRole('combobox',{name:'DA0010 jóváhagyott státusza'});
  await firstStatus.selectOption('aktiv');
  assert.equal(await page.locator('#capacityRows tr').count(),7,
    'a newly activated courier must ALSO get an explicitly reviewed capacity');
  assert.equal(await page.getByRole('checkbox',
    {name:'DA0010 státuszát ellenőriztem'}).isChecked(),false);
  await page.getByRole('checkbox',{name:'DA0010 státuszát ellenőriztem'}).check();
  await page.getByRole('combobox',{name:'DA0011 jóváhagyott státusza'})
    .selectOption('inaktiv');
  await page.getByRole('checkbox',{name:'DA0011 státuszát ellenőriztem'}).check();
  await page.getByRole('combobox',{name:'DA0012 jóváhagyott státusza'})
    .selectOption('inaktiv');
  await page.getByRole('checkbox',{name:'DA0012 státuszát ellenőriztem'}).check();
  assert.equal(await page.locator('#prepareButton').isDisabled(),true,
    'three approved statuses are not enough without all seven capacity reviews');

  const expectedCapacities=[];
  for(const [idx,code] of ['DA0001','DA0002','DA0003','DA0004',
    'DA0005','DA0006','DA0010'].entries()){
    const number=page.getByRole('spinbutton',{name:code+' jóváhagyott kapacitása'});
    if(code==='DA0002')assert.equal(await number.inputValue(),'80');
    else assert.equal(await number.inputValue(),'');
    const n=61+idx;
    await number.fill(String(n));
    await page.getByRole('checkbox',{name:code+' kapacitását ellenőriztem'}).check();
    expectedCapacities.push({daCode:code,kapacitas:n,reviewed:true});
    if(idx<6)assert.equal(await page.locator('#prepareButton').isDisabled(),true);
  }
  assert.equal(await page.locator('#prepareButton').isEnabled(),true);
  await page.locator('#prepareButton').click();
  await page.waitForFunction(()=>!document.querySelector('#filesPanel').hidden);
  assert.equal(await page.locator('#summaryDownload').isDisabled(),true);
  const savedDecision=await save('#decisionDownload');
  const savedCandidate=await save('#candidateDownload');
  assert.equal(savedDecision.suggestedFilename(),'imile-privat-tulajdonosi-dontesek.json');
  assert.equal(savedCandidate.suggestedFilename(),'imile-privat-ellenorzott-flotta.json');
  const decisions=JSON.parse(readFileSync(await savedDecision.path(),'utf8'));
  const candidate=JSON.parse(readFileSync(await savedCandidate.path(),'utf8'));
  assert.equal(decisions.sourceSha256,sha256(s));
  assert.deepEqual(decisions.statuses,[
    {id:s.drivers[9].id,daCode:'DA0010',status:'aktiv',reviewed:true},
    {id:s.drivers[10].id,daCode:'DA0011',status:'inaktiv',reviewed:true},
    {id:s.drivers[11].id,daCode:'DA0012',status:'inaktiv',reviewed:true}
  ]);
  assert.deepEqual(decisions.capacities,expectedCapacities);
  const expected=prepareReviewedCourierOperations(s,decisions);
  assert.equal(expected.ok,true,expected.reason);
  assert.equal(expected.operationallyReady,true);
  assert.deepEqual(candidate,expected.candidate,
    'browser candidate must exactly equal Node implementation preserving every rich field');
  assert.equal(JSON.stringify(s),before,'original source must not be mutated');
  assert.deepEqual(candidate.vehicles,s.vehicles);
  assert.deepEqual(candidate.fuelCards,s.fuelCards);
  assert.deepEqual(candidate.contacts,s.contacts);
  assert.deepEqual(candidate.unknownRoot,s.unknownRoot);
  assert.equal(candidate.drivers[9].status,'aktiv');
  assert.equal(candidate.drivers[9].kapacitas,67);
  assert.equal(candidate.drivers[10].status,'inaktiv');
  assert.equal(candidate.drivers[11].status,'inaktiv');

  const dpath=await savedDecision.path(),cpath=await savedCandidate.path();
  await page.locator('#decisionVerify').setInputFiles(dpath);
  await page.waitForFunction(()=>document.querySelector('#verificationMessage')
    .textContent.includes('vissza kell olvasni'));
  assert.equal(await page.locator('#summaryDownload').isDisabled(),true,
    'the decision file alone cannot establish candidate save/readback');
  const changed=structuredClone(candidate);
  changed.fuelCards[0].history[0].deep=999;
  await page.locator('#candidateVerify').setInputFiles({
    name:'tampered-candidate.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(changed))
  });
  await page.waitForFunction(()=>document.querySelector('#verificationMessage')
    .textContent.includes('elutasítva'));
  assert.equal(await page.locator('#summaryDownload').isDisabled(),true);
  await page.locator('#candidateVerify').setInputFiles(cpath);
  await page.waitForFunction(()=>!document.querySelector('#summaryDownload').disabled);
  const summaryFile=await save('#summaryDownload');
  const summaryText=readFileSync(await summaryFile.path(),'utf8');
  const summary=JSON.parse(summaryText);
  assert.equal(summary.fullRichCandidateSaveReadbackVerified,true);
  assert.equal(summary.decisionPlanSaveReadbackVerified,true);
  assert.equal(summary.reviewedUncertainStatuses,3);
  assert.equal(summary.reviewedActiveDriverCapacities,7);
  assert.equal(summary.migrationOwnedReadDocuments,56);
  assert.equal(summary.ownerIdentityAuthenticated,false);
  assert.equal(summary.productionIamVerified,false);
  assert.equal(summary.productionReleaseAuthorized,false);
  assert.equal(summary.authorizedForImport,false);
  for(const canary of ['PRIVATE_OWNER_NAME_CANARY','PRIVATE_OWNER_PHONE_CANARY',
    'PRIVATE_RICH_HISTORY_CANARY','PRIVATE_CARD_CANARY','PRIVATE_CONTACT_CANARY',
    'PRIVATE_VEHICLE_CANARY','PRIVATE_ROOT_CANARY','DA0001','QA-1000']){
    assert.equal(summaryText.includes(canary),false,'summary must not reveal '+canary);
  }
  assert.deepEqual(http,[],'no network request may carry the private owner export');
  console.log('PASS [REAL CHROMIUM]: 12/14 private owner operations, 3 statuses + 7 capacities, Node parity, 2 saved files readback, tamper DENY, zero HTTP');

  // Changing an approved status must invalidate a previously downloaded
  // candidate and *clear* its review checkbox, not silently reapprove it.
  await firstStatus.selectOption('inaktiv');
  assert.equal(await page.getByRole('checkbox',
    {name:'DA0010 státuszát ellenőriztem'}).isChecked(),false);
  assert.equal(await page.locator('#capacityRows tr').count(),6);
  assert.equal(await page.locator('#filesPanel').isHidden(),true);
  assert.equal(await page.locator('#summaryDownload').isDisabled(),true);

  const invalid=[
    ['duplicate DA',()=>{const v=source();v.drivers[2].daCode='da0001';return v;}],
    ['duplicate plate',()=>{const v=source();v.vehicles[1].rendszam='qa 1000';return v;}],
    ['pre-seal reserved sourceIndex',()=>{const v=source();v.vehicles[0].sourceIndex=0;return v;}],
    ['sealed source',()=>({...source(),sealed:true})],
    ['more than 30 drivers',()=>{
      const v=source();for(let i=12;i<=30;i++)v.drivers.push({
        id:'extra-synthetic-'+i,daCode:'EX'+String(i).padStart(4,'0'),
        status:'inaktiv'
      });return v;
    }],
    ['over 120 owned reads',()=>{
      const v=source();for(let i=14;i<60;i++)v.vehicles.push({
        id:'vehicle-extra-'+i,rendszam:'TT-'+String(i).padStart(4,'0'),status:'aktiv'
      });return v;
    }],
    ['invalid rich history',()=>{const v=source();v.contacts[0].history='bad';return v;}],
    ['invalid JSON',()=>'{ "drivers": [ ']
  ];
  for(const [label,make] of invalid){
    await load(make());
    assert.equal(await page.locator('#statusPanel').isHidden(),true,label);
    assert.equal(await page.locator('#capacityPanel').isHidden(),true,label);
    assert.equal(await page.locator('#prepareButton').isDisabled(),true,label);
    assert.equal(await page.locator('#summaryDownload').isDisabled(),true,label);
    assert.match(await page.locator('#sourceMessage').innerText(),/elutasítva/i,label);
  }
  // Lossy browser File.text() would turn the next invalid UTF-8 byte into
  // U+FFFD and falsely accept a "valid" rewritten private source. Fatal
  // TextDecoder must deny it before any review/source hash is generated.
  const invalidUtf8=Buffer.from(JSON.stringify(source()),'utf8');
  const marker=Buffer.from('PRIVATE_ROOT_CANARY','utf8');
  const at=invalidUtf8.indexOf(marker);
  assert.ok(at>0);
  invalidUtf8[at]=0xff;
  await page.locator('#sourceFile').setInputFiles({
    name:'malformed-utf8-private-source.json',mimeType:'application/json',
    buffer:invalidUtf8
  });
  await page.waitForFunction(()=>!document.querySelector('#sourceMessage')
    .textContent.includes('vizsgálata…'));
  assert.equal(await page.locator('#statusPanel').isHidden(),true,
    'lossy UTF-8 replacement must not yield a reviewed source');
  assert.equal(await page.locator('#prepareButton').isDisabled(),true);
  assert.match(await page.locator('#sourceMessage').innerText(),/elutasítva/i);
  assert.deepEqual(http,[]);
  console.log('PASS DENY [REAL CHROMIUM]: malformed UTF-8 private source bytes, no replacement-character canonical hash');
  console.log('PASS DENY [REAL CHROMIUM]: duplicate identities, inherited sourceIndex, seal, oversized migration, rich tamper and invalid JSON; zero HTTP');
}finally{
  await browser.close();
}
