/**
 * Real Chromium file:// offline File API + download QA.
 * Runs in the same pinned free Chromium installation as Fleet+Depot E2E.
 * Only SYNTHETIC data; every external HTTP request is treated as a failure.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from '../staging/imile-management/fleet/node_modules/playwright/index.mjs';
import {prepareReviewedCourierCapacities} from './v1-capacity-remediation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const source=()=>({
  drivers:[
    {id:'driver-1',daCode:'DA0001',status:'aktiv',
      name:'LOCAL_PRIVATE_NAME_CANARY',phone:'LOCAL_PRIVATE_PHONE_CANARY',
      history:[{note:'RICH_HISTORY_CANARY',nested:{retain:['x',1,true]}}]},
    {id:'driver-2',daCode:'DA0002',status:'aktív',kapacitas:80,
      history:[{kind:'capacity',details:{old:80}}]},
    {id:'driver-3',daCode:'DA0003',status:'inaktiv',kapacitas:12},
    {id:'driver-4',daCode:'DA0004',status:'ismeretlen',history:[]}
  ],
  vehicles:[{id:'car-1',rendszam:'ABC-123',status:'aktiv',
    history:[{km:12000,extra:{keep:true}}]}],
  fuelCards:[{id:'fuel-1',secret:'LOCAL_PRIVATE_FUEL_CANARY',history:[{n:3}]}],
  contacts:[{id:'contact-1',secret:'LOCAL_PRIVATE_CONTACT_CANARY',history:[]}],
  otherRoot:{future:{mustPersist:true}}
});
const original=JSON.stringify(source());
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();
const network=[];
page.on('request',request=>{
  if(/^https?:/i.test(request.url()))network.push(request.url());
});
const load=async data=>{
  const text=typeof data==='string'?data:JSON.stringify(data);
  await page.locator('#sourceFile').setInputFiles({
    name:'only-on-this-device.json',mimeType:'application/json',buffer:Buffer.from(text)
  });
  await page.waitForFunction(()=>{
    const message=document.querySelector('#message').textContent;
    return !message.includes('ellenőrzése…');
  });
};
try{
  await page.goto(pathToFileURL(resolve('tools/v1-owner-capacity-review.html')).href);
  assert.match(await page.title(),/offline futárkapacitás/i);
  assert.equal(await page.locator('#reviewPanel').isHidden(),true);
  await load(source());
  assert.equal(await page.locator('#reviewPanel').isVisible(),true);
  assert.match(await page.locator('#numbers').innerText(),/4/);
  assert.match(await page.locator('#otherRows').innerText(),/Bizonytalan státuszú futárok: 1/);
  assert.equal(await page.locator('tbody tr').count(),2,
    'only active couriers may receive capacity decisions');
  assert.equal(await page.locator('#exportButton').isDisabled(),true,
    'no automatic 70-capacity export');
  const one=page.getByRole('spinbutton',{name:'DA0001 jóváhagyott kapacitása'});
  const two=page.getByRole('spinbutton',{name:'DA0002 jóváhagyott kapacitása'});
  assert.equal(await one.inputValue(),'');
  assert.equal(await two.inputValue(),'80');
  await one.fill('70');
  await page.getByRole('checkbox',{name:'DA0001 ellenőriztem'}).check();
  assert.equal(await page.locator('#exportButton').isDisabled(),true,
    'an existing valid capacity ALSO requires owner checkbox');
  await two.fill('70');
  await page.getByRole('checkbox',{name:'DA0002 ellenőriztem'}).check();
  assert.equal(await page.locator('#exportButton').isEnabled(),true);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#exportButton').click();
  const exported=await downloadPromise;
  assert.equal(exported.suggestedFilename(),'imile-flotta-kapacitas-ellenorzott.json');
  const candidate=JSON.parse(readFileSync(await exported.path(),'utf8'));
  const expected=prepareReviewedCourierCapacities(source(),[
    {daCode:'DA0001',kapacitas:70,reviewed:true},
    {daCode:'DA0002',kapacitas:70,reviewed:true}
  ]);
  assert.equal(expected.ok,true,expected.reason);
  assert.deepEqual(candidate,expected.candidate);
  assert.equal(candidate.drivers[0].kapacitas,70);
  assert.equal(candidate.drivers[1].kapacitas,70);
  assert.equal(candidate.drivers[2].kapacitas,12);
  assert.equal(candidate.drivers[3].kapacitas,undefined);
  assert.equal(candidate.drivers[0].history[0].note,'RICH_HISTORY_CANARY');
  assert.equal(candidate.contacts[0].secret,'LOCAL_PRIVATE_CONTACT_CANARY');
  assert.equal(JSON.stringify(source()),original,'original must never be mutated');
  assert.equal(await page.locator('#verificationPanel').isVisible(),true);
  assert.equal(await page.locator('#summaryButton').isDisabled(),true,
    'a generated candidate is NOT yet proof of the saved file');
  const altered=structuredClone(candidate);
  altered.contacts[0].history.push({kind:'MALICIOUS_POST_DOWNLOAD_CHANGE'});
  await page.locator('#savedFile').setInputFiles({
    name:'modified-after-export.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(altered))
  });
  await page.waitForFunction(()=>document.querySelector('#verifyStatus')
    .textContent.includes('ELUTASÍTVA'));
  assert.equal(await page.locator('#summaryButton').isDisabled(),true,
    'tampered rich history cannot unlock the digest summary');
  await page.locator('#savedFile').setInputFiles(await exported.path());
  await page.waitForFunction(()=>!document.querySelector('#summaryButton').disabled);
  assert.match(await page.locator('#verifyStatus').textContent(),/SIKERES/);
  const summaryPromise=page.waitForEvent('download');
  await page.locator('#summaryButton').click();
  const summaryDownload=await summaryPromise;
  const summaryText=readFileSync(await summaryDownload.path(),'utf8');
  const summary=JSON.parse(summaryText);
  assert.equal(summary.authorizedForImport,false);
  assert.equal(summary.productionIamVerified,false);
  assert.equal(summary.newIndependentBackupRequired,true);
  assert.equal(summary.migrationOwnedReadDocuments,11);
  assert.equal(summary.migrationAtomicReadLimit,120);
  assert.equal(summary.migrationWithinAtomicReadBound,true);
  assert.equal(summary.savedCandidateRoundtripVerified,true);
  assert.equal(summary.originalLocalSha256,sha256(source()));
  assert.equal(summary.candidateLocalSha256,sha256(candidate));
  for(const secret of ['LOCAL_PRIVATE_NAME_CANARY','LOCAL_PRIVATE_PHONE_CANARY',
    'LOCAL_PRIVATE_FUEL_CANARY','LOCAL_PRIVATE_CONTACT_CANARY',
    'DA0001','ABC-123']){
    assert.equal(summaryText.includes(secret),false,'redacted summary cannot reveal '+secret);
  }
  assert.deepEqual(network,[],'File API review must never issue a network request');
  console.log('PASS [REAL CHROMIUM]: offline rich four-array export, explicit per-DA review, saved-file SHA-256 re-read PASS, tampered rich history DENY, redacted summary, zero HTTP');
  await one.fill('71');
  assert.equal(await page.locator('#summaryButton').isDisabled(),true,
    'changing a reviewed capacity invalidates the previous saved-file proof');
  assert.equal(await page.locator('#verificationPanel').isHidden(),true);
  assert.equal(await page.locator('#exportButton').isEnabled(),true);

  // ANONYMIZED shape-only rehearsal based on the privately observed
  // 12-driver / 14-car source dimensions. No real names, plates, DA records,
  // phone numbers, source SHA or production JSON are ever in GitHub or CI.
  // Six active drivers have no capacity, three are inactive and three have
  // unreviewed statuses. Capacity 70 remains a SUGGESTION, not an auto-fill.
  const twelveFourteen={
    drivers:Array.from({length:12},(_,i)=>({
      id:'synthetic-courier-'+i,
      daCode:'DA'+String(i+1).padStart(4,'0'),
      status:i<6?'aktiv':i<9?'inaktiv':'ismeretlen',
      history:[{note:'SYNTHETIC_RICH_DRIVER_'+i,
        nested:{preserve:['2026',i]}}]
    })),
    vehicles:Array.from({length:14},(_,i)=>({
      id:'synthetic-vehicle-'+i,
      rendszam:'QA-'+String(i+100).padStart(4,'0'),
      status:'aktiv',
      km:12000+i,
      history:[{event:'synthetic-service',nested:{index:i}}]
    })),
    fuelCards:Array.from({length:14},(_,i)=>({id:'synthetic-card-'+i,
      history:[{rich:{index:i}}]})),
    contacts:Array.from({length:5},(_,i)=>({id:'synthetic-contact-'+i,
      futureFields:{nested:{index:i}}})),
    futureRoot:{keep:{nested:'SYNTHETIC_RICH_ROOT_CANARY'}}
  };
  await load(twelveFourteen);
  assert.equal(await page.locator('#reviewPanel').isVisible(),true);
  assert.equal(await page.locator('tbody tr').count(),6,
    'only six active drivers must require owner capacity decisions');
  assert.match(await page.locator('#otherRows').innerText(),/Bizonytalan státuszú futárok: 3/);
  assert.match(await page.locator('#numbers').innerText(),/56\/120/,
    '26 keyed pairs generate exactly 56 locally owned read documents');
  assert.equal(await page.locator('#exportButton').isDisabled(),true,
    'six active capacity gaps must never receive implicit 70 from the UI');
  const explicit=[];
  for(let i=1;i<=6;i++){
    const code='DA'+String(i).padStart(4,'0');
    const spin=page.getByRole('spinbutton',{name:code+' jóváhagyott kapacitása'});
    assert.equal(await spin.inputValue(),'',
      'missing capacity must be empty, not prefilled with suggested 70');
    await spin.fill('70');
    await page.getByRole('checkbox',{name:code+' ellenőriztem'}).check();
    explicit.push({daCode:code,kapacitas:70,reviewed:true});
    if(i<6)assert.equal(await page.locator('#exportButton').isDisabled(),true,
      'each of six active couriers must be reviewed separately');
  }
  assert.equal(await page.locator('#exportButton').isEnabled(),true);
  const shapeDownload=page.waitForEvent('download');
  await page.locator('#exportButton').click();
  const shapeFile=await shapeDownload;
  const shapeCandidate=JSON.parse(readFileSync(await shapeFile.path(),'utf8'));
  const reviewed=prepareReviewedCourierCapacities(twelveFourteen,explicit);
  assert.equal(reviewed.ok,true,reviewed.reason);
  assert.deepEqual(shapeCandidate,reviewed.candidate,
    'exact full rich four arrays plus unknown root metadata must survive');
  assert.equal(shapeCandidate.drivers.filter(d=>d.status==='ismeretlen').length,3,
    'unknown statuses must remain unknown, not quietly activated');
  assert.equal(shapeCandidate.drivers.filter(d=>d.status==='aktiv'&&d.kapacitas===70).length,6);
  assert.equal(shapeCandidate.vehicles.length,14);
  assert.deepEqual(shapeCandidate.futureRoot,twelveFourteen.futureRoot);
  await page.locator('#savedFile').setInputFiles(await shapeFile.path());
  await page.waitForFunction(()=>!document.querySelector('#summaryButton').disabled);
  const shapeSummaryDownload=page.waitForEvent('download');
  await page.locator('#summaryButton').click();
  const shapeSummary=JSON.parse(readFileSync(await (await shapeSummaryDownload).path(),'utf8'));
  assert.equal(shapeSummary.migrationOwnedReadDocuments,56);
  assert.equal(shapeSummary.migrationWithinAtomicReadBound,true);
  assert.equal(shapeSummary.authorizedForImport,false);
  assert.equal(shapeSummary.newIndependentBackupRequired,true);
  assert.deepEqual(network,[],'Realistic shape-only review must remain completely offline');
  console.log('PASS [REAL CHROMIUM]: 12/14 anonymized Fleet shape, six explicit 70 reviews, three unknown kept, full rich roundtrip and 56/120 local bound, zero HTTP');

  // Owner UI must accept precisely 30 driver rows, but NOT the 31st.
  const thirty=source();
  for(let i=4;i<30;i++)thirty.drivers.push({
    id:'driver-extra-'+i,daCode:'DA'+String(i+1).padStart(4,'0'),
    status:'inaktiv'
  });
  await load(thirty);
  assert.equal(await page.locator('#reviewPanel').isVisible(),true,
    '30-driver source must be a permitted private review candidate');
  assert.equal(await page.locator('tbody tr').count(),2);
  assert.equal(await page.locator('#exportButton').isDisabled(),true,
    'each active capacity still requires explicit review');
  console.log('PASS ALLOW [REAL CHROMIUM]: 30-driver source renders local reviews with no default authorization');

  const oversized=structuredClone(thirty);
  for(let i=1;i<27;i++)oversized.vehicles.push({
    id:'over-limit-vehicle-'+i,
    rendszam:'TST-'+String(i).padStart(4,'0'),
    status:'aktiv',history:[]
  });
  await load(oversized);
  assert.equal(await page.locator('#reviewPanel').isVisible(),true,
    'the private source must remain reviewable despite denied importer admission');
  assert.match(await page.locator('#message').innerText(),/120 dokumentumos/);
  assert.match(await page.locator('#otherRows').innerText(),/122 dokumentumot/);
  assert.match(await page.locator('#numbers').innerText(),/122\/120/);
  assert.equal(await page.locator('#exportButton').isDisabled(),true);
  console.log('PASS DENY [REAL CHROMIUM]: 30 drivers + 27 cars = 122 owned docs; local review allowed, privileged import unequivocally blocked');

  const badCases=[
    ['duplicate normalized DA',()=>{const x=source();x.drivers[1].daCode=' da0001 ';return x;}],
    ['duplicate normalized plate',()=>{const x=source();x.vehicles.push({id:'car2',rendszam:'abc 123',status:'aktiv'});return x;}],
    ['sealed source',()=>({...source(),sealed:true})],
    ['privileged fields',()=>({...source(),migrationSourceSha256:'a'.repeat(64)})],
    ['no active vehicle',()=>{const x=source();x.vehicles[0].status='inaktiv';return x;}],
    ['invalid history',()=>{const x=source();x.fuelCards[0].history='altered';return x;}],
    ['too many drivers',()=>{
      const x=source();
      for(let i=4;i<31;i++)x.drivers.push({
        id:'driver-'+i,daCode:'DA'+String(i+1).padStart(4,'0'),status:'inaktiv'
      });
      return x;
    }],
    ['invalid JSON',()=>'{ "drivers": [ '],
    ['sourceIndex inherited from raw',()=>{const x=source();x.drivers[0].sourceIndex=0;return x;}]
  ];
  for(const [label,make] of badCases){
    await load(make());
    assert.equal(await page.locator('#reviewPanel').isHidden(),true,
      label+' must not render review');
    assert.equal(await page.locator('#exportButton').isDisabled(),true,
      label+' must not allow export');
    assert.equal(await page.locator('#summaryButton').isDisabled(),true,
      label+' must invalidate previous summary');
    assert.match(await page.locator('#message').innerText(),/elutasítva/i);
  }
  assert.deepEqual(network,[],'hostile inputs must not cause network calls');
  console.log('PASS DENY [REAL CHROMIUM]: duplicate DA/plate, sealed/migrated, no active car, 30+ drivers, invalid history/JSON, reserved field; zero HTTP');
}finally{
  await browser.close();
}
