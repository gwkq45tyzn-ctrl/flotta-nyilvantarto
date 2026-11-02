import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,onSnapshot,query,where,runTransaction,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {getStorage,ref as storageRef,uploadBytes,getBlob,getMetadata} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {PHOTO_KEYS,PHOTO_LABELS,PLATE,planCheckIn,planCheckOut,planReview,bulkReviewEligible,fleetSummary} from './core.mjs';
import {planCourierDay,planCapacity} from './roster.mjs';
import {uploadOrVerifyImmutable,sha256Blob as sha256} from './photo-upload.mjs';
import {buildFleetOverview} from './fleet-overview.mjs';
import {auditCourierAccess} from './access-audit.mjs';
import {attendanceDailyReport,attendanceReportCsv,attendanceConditionCsv} from './daily-report.mjs';
import {assessSources} from '../../../depokapacitas/source-health.mjs';
import {encodeJpeg,validPhotoFile} from './photo-codec.mjs';
import {photoProofMatches,readVerifiedPhoto} from './photo-proof.mjs';
import {initialVehicleDetails} from '../fleet/operations-data.mjs';
import {requestPhotoPermit,clearPermitRequest} from './photo-permit.mjs';
const $=id=>document.getElementById(id);
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
const permitCall=httpsCallable(getFunctions(app,'europe-west3'),'attendancePhotoPermit');
let user=null,access=null,isStaff=false,staffRole='',unsubs=[],data={vehicles:[],locks:[],driverLocks:[],sessions:[],drivers:[],accesses:[],plans:[],courierClaim:null},busy=false,sourceMeta={},lastWaitingSignature='';
const COURIER_SOURCES=['vehicles','locks','courierClaim','sessions'];
const STAFF_SOURCES=['vehicles','locks','driverLocks','sessions','drivers','accesses','plans'];
const canReviewVehicles=()=>isStaff&&['admin','editor'].includes(staffRole);
const sourceHealth=required=>assessSources(sourceMeta,{required,online:navigator.onLine});
const sourcesTrusted=required=>sourceHealth(required).trusted;
const tomorrow=()=>{const today=new Date(day()+'T12:00:00Z');today.setUTCDate(today.getUTCDate()+1);return today.toISOString().slice(0,10);};
let rosterDate='',dailyReportDate='';
let authGeneration=0,pendingCheckIn=null;
const photoCache=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(id,value)=>{$(id).hidden=!value};
const toast=(msg,error=false)=>{const n=$('notice');n.textContent=msg;n.classList.toggle('error',error);n.hidden=false;};
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function photoInputs(root,stage){
 $(root).innerHTML=PHOTO_KEYS.map(key=>'<div class="photo"><label>'+esc(PHOTO_LABELS[key])+'<input type="file" name="'+key+'" accept="image/*" capture="environment" required></label><span>Kötelező fotó</span></div>').join('');
 // Mobile browsers may use camera or file picker. Never persist photos on device.
}
photoInputs('inPhotos','in');photoInputs('outPhotos','out');
function subscribe(path,onData,sourceName){
 const unsubscribe=onSnapshot(path,{includeMetadataChanges:true},snapshot=>{
  const meta=snapshot.metadata,prior=sourceMeta[sourceName]||{};
  sourceMeta[sourceName]={
   loaded:true,fromCache:meta.fromCache,pending:meta.hasPendingWrites,error:false,
   serverAt:!meta.fromCache&&!meta.hasPendingWrites?Date.now():prior.serverAt
  };
  onData(snapshot);render();
 },error=>{
  sourceMeta[sourceName]={...(sourceMeta[sourceName]||{}),loaded:false,error:true};
  toast('Nincs hiteles adatkapcsolat: '+error.message,true);render();
 });
 unsubs.push(unsubscribe);
}
function clearSubscriptions(){unsubs.forEach(fn=>fn());unsubs=[];sourceMeta={};data={vehicles:[],locks:[],driverLocks:[],sessions:[],drivers:[],accesses:[],plans:[],courierClaim:null};}
function setBusy(value){busy=value;for(const id of ['checkinForm','checkoutForm'])
 $(id).querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=value);
 $('bulkReview').disabled=value||!canReviewVehicles();if(user&&isStaff)renderStaff();}
function allPhotoFiles(form){
 return PHOTO_KEYS.map(key=>{
  const file=form.elements.namedItem(key)?.files?.[0];
  if(!validPhotoFile(file))
   throw Error(PHOTO_LABELS[key]+': JPEG, PNG, WebP vagy HEIC fénykép szükséges, legfeljebb 8 MB.');
  return {key,file};
 });
}
async function uploadPhotos(files,sessionId,stage){
 const paths={},actor=user?.uid;
 if(!actor)throw Error('A bejelentkezés megszűnt.');
 for(const {key,file} of files){
  const path='attendance/'+actor+'/'+sessionId+'/'+stage+'/'+key+'.jpg';
  const fingerprint=await sha256(file),prior=photoCache.get(path);
  if(prior&&prior.fingerprint!==fingerprint)throw Error('A megkezdett feltöltést az eredeti fotókkal folytasd. A mentett kép nem írható felül.');
  const blob=prior?.blob||await encodeJpeg(file);photoCache.set(path,{fingerprint,blob});
  if(user?.uid!==actor)throw Error('A bejelentkezés megváltozott.');
  await uploadOrVerifyImmutable({path,blob,
   readOriginal:p=>getBlob(storageRef(storage,p)),
   upload:(p,b)=>uploadBytes(storageRef(storage,p),b,{contentType:'image/jpeg'})});
  if(user?.uid!==actor)throw Error('A bejelentkezés megváltozott.');
  paths[key]=path;
 }
 await waitForPhotoProof({uid:actor,sessionId,stage,paths});
 return paths;
}
async function waitForPhotoProof(expected){
 toast('A 7 fotó feltöltve. Szerveres fénykép-ellenőrzés…');
 return new Promise((resolve,reject)=>{
  let stop=()=>{};const finish=error=>{clearTimeout(timer);stop();error?reject(error):resolve();};
  const timer=setTimeout(()=>finish(Error('A szerveres fotóigazolás még nem érkezett meg. Próbáld újra; a feltöltött képeket újra felhasználjuk.')),25000);
  stop=onSnapshot(doc(db,'photoReceipts',expected.uid,'sessions',expected.sessionId,'stages',expected.stage),
   {includeMetadataChanges:true},s=>{
    if(user?.uid!==expected.uid)return finish(Error('A bejelentkezés megváltozott.'));
    if(!s.metadata.fromCache&&!s.metadata.hasPendingWrites&&s.exists()&&photoProofMatches(s.data(),expected))finish();
   },error=>finish(Error('A fotóigazolás nem ellenőrizhető: '+error.message)));
 });
}
const ownClaim=()=>data.courierClaim;
const activeSession=()=>data.sessions.find(s=>s.id===ownClaim()?.sessionId);
function startCourier(){
 subscribe(collection(db,'vehicles'),s=>data.vehicles=s.docs.map(d=>({id:d.id,...d.data()})),'vehicles');
 subscribe(collection(db,'vehicleLocks'),s=>data.locks=s.docs.map(d=>({id:d.id,...d.data()})),'locks');
 subscribe(doc(db,'courierLocks',user.uid),s=>data.courierClaim=s.exists()?{id:s.id,...s.data()}:null,'courierClaim');
 subscribe(query(collection(db,'vehicleSessions'),where('uid','==',user.uid)),s=>data.sessions=s.docs.map(d=>({id:d.id,...d.data()})),'sessions');
}
function startStaff(){
 subscribe(collection(db,'vehicles'),s=>data.vehicles=s.docs.map(d=>({id:d.id,...d.data()})),'vehicles');
 subscribe(collection(db,'vehicleLocks'),s=>data.locks=s.docs.map(d=>({id:d.id,...d.data()})),'locks');
 subscribe(collection(db,'driverLocks'),s=>data.driverLocks=s.docs.map(d=>({id:d.id,...d.data()})),'driverLocks');
 subscribe(collection(db,'vehicleSessions'),s=>data.sessions=s.docs.map(d=>({id:d.id,...d.data()})),'sessions');
 subscribe(collection(db,'drivers'),s=>data.drivers=s.docs.map(d=>({id:d.id,...d.data()})),'drivers');
 subscribe(collection(db,'courierAccess'),s=>data.accesses=s.docs.map(d=>({id:d.id,...d.data()})),'accesses');
 subscribe(collection(db,'courierDayPlans'),s=>data.plans=s.docs.map(d=>({id:d.id,...d.data()})),'plans');
}

/**
 * A long courier shift can leave unchanged snapshots older than 15 minutes.
 * Explicit server reads renew the source evidence WITHOUT guessing online
 * freshness, and WITHOUT using Google Sheets or mutating any records.
 * The subsequent Firestore transaction always revalidates car/session locks.
 */
async function refreshAttendanceSources(){
 if(!user||!navigator.onLine)throw Error('Az adatok frissítéséhez internetkapcsolat szükséges.');
 const principal=user.uid,principalIsStaff=isStaff;
 const courierSessions=query(collection(db,'vehicleSessions'),where('uid','==',user.uid));
 const targets=isStaff?[
  ['vehicles',collection(db,'vehicles'),s=>data.vehicles=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['locks',collection(db,'vehicleLocks'),s=>data.locks=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['driverLocks',collection(db,'driverLocks'),s=>data.driverLocks=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['sessions',collection(db,'vehicleSessions'),s=>data.sessions=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['drivers',collection(db,'drivers'),s=>data.drivers=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['accesses',collection(db,'courierAccess'),s=>data.accesses=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['plans',collection(db,'courierDayPlans'),s=>data.plans=s.docs.map(d=>({id:d.id,...d.data()}))]
 ]:[
  ['vehicles',collection(db,'vehicles'),s=>data.vehicles=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['locks',collection(db,'vehicleLocks'),s=>data.locks=s.docs.map(d=>({id:d.id,...d.data()}))],
  ['courierClaim',doc(db,'courierLocks',user.uid),s=>data.courierClaim=s.exists()?{id:s.id,...s.data()}:null],
  ['sessions',courierSessions,s=>data.sessions=s.docs.map(d=>({id:d.id,...d.data()}))]
 ];
 const snapshots=await Promise.all(targets.map(async ([,reference])=>
  reference.type==='document'?getDocFromServer(reference):getDocsFromServer(reference)));
 if(!navigator.onLine)throw Error('A frissítés közben megszakadt az internetkapcsolat.');
 if(!user||user.uid!==principal||isStaff!==principalIsStaff)throw Error('A belépett felhasználó időközben megváltozott.');
 // All server reads must succeed before committing any UI state or trust.
 const receivedAt=Date.now();
 if(isStaff)resetBulkApproval();
 for(let i=0;i<targets.length;i++){
  const [name,,onData]=targets[i];
  onData(snapshots[i]);
  sourceMeta[name]={loaded:true,fromCache:false,pending:false,error:false,serverAt:receivedAt};
 }
 render();
 const required=isStaff?STAFF_SOURCES:COURIER_SOURCES;
 if(!sourcesTrusted(required))throw Error('Az újraolvasott adatok még nem hitelesek.');
}
async function ensureAttendanceSources(required){
 if(sourcesTrusted(required))return;
 await refreshAttendanceSources();
 if(!sourcesTrusted(required))throw Error('A szerveres adatok ellenőrzése sikertelen.');
}
function renderCourier(){
 if(!sourcesTrusted(COURIER_SOURCES)){
  show('checkinSection',false);show('checkoutSection',false);show('waitingSection',false);
  $('courierStatus').textContent='A szerveres autóadatok ellenőrzésére várunk. '+sourceHealth(COURIER_SOURCES).message;
  return;
 }
 $('courierName').textContent='Futár · '+access.driverId;
 const claim=ownClaim(),session=activeSession();
 show('checkinSection',!claim);show('checkoutSection',!!claim&&session?.status==='active');
 show('waitingSection',!!claim&&session?.status!=='active');
 $('courierStatus').textContent=!claim?'Válaszd ki a ténylegesen átvett szabad céges autót.':session?'Rendszám: '+session.plate+' · '+(session.status==='active'?'Használatban':'Visszaadás ellenőrzésre vár'):'A járműadatra várunk, frissítsd a kapcsolatot.';
 if(claim&&session)$('currentCar').textContent=session.plate+' · kezdő km: '+session.startKm;
 const select=$('plateSelect'),old=select.value;
 const locked=new Set(data.locks.map(x=>x.plate));
 const available=data.vehicles.filter(x=>x.status==='Elérhető'&&!locked.has(PLATE(x.plate||x.id)));
 select.innerHTML='<option value="">Válassz autót…</option>'+available.map(x=>'<option value="'+esc(PLATE(x.plate||x.id))+'">'+esc(x.plate||x.id)+'</option>').join('');
 if(available.some(x=>PLATE(x.plate||x.id)===old))select.value=old;
}
function displayTime(v){try{return v?.toDate?.().toLocaleString('hu-HU')||'—';}catch{return '—';}}
function adminSession(s){
 const driver=data.drivers.find(d=>d.id===s.driverId);
 return '<strong>'+esc(s.plate)+'</strong><div class="meta">'+esc(driver?.name||s.driverId)+' · DA: '+esc(s.driverId)+' · átvétel: '+esc(displayTime(s.startedAt))+'</div><button type="button" data-photo-session="'+esc(s.id)+'">Átvételi / visszaadási fotók</button>';
}

function renderRoster(){
 const date=rosterDate||tomorrow();rosterDate=date;
 $('rosterDate').value=date;
 const driverSelect=$('rosterDriver'),previous=driverSelect.value;
 const allowed=new Set(data.accesses.filter(x=>x.active===true).map(x=>x.driverId));
 const drivers=data.drivers.filter(x=>x.active===true&&allowed.has(x.id));
 driverSelect.innerHTML='<option value="">Válassz futárt…</option>'+drivers.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.id)+'</option>').join('');
 if(drivers.some(x=>x.id===previous))driverSelect.value=previous;
 const report=planCapacity({date,vehicles:data.vehicles,locks:data.locks,driverLocks:data.driverLocks,plans:data.plans,accesses:data.accesses,drivers:data.drivers});
 if(!report.ready){$('rosterStats').textContent='Nem ellenőrizhető a terv: '+report.reason;return;}
 const kpis=[['Üzemképes autók',report.operationalCars],['Aktív Attendance nélkül',report.physicallyReady],
  ['Tervezett futárok',report.plannedCouriers],['Megerősített futárok',report.confirmedCouriers],
  ['Hiányzó megerősített futárok',report.missingConfirmed],['Használatban lévő autók',report.inUseCars],
  ['Visszavételre váró autók',report.awaitingReviewCars]];
 $('rosterStats').innerHTML=kpis.map(([label,n])=>'<div class="stat"><b>'+n+'</b><span>'+esc(label)+'</span></div>').join('');
 const allowedPlans=data.plans.filter(x=>x.date===date&&allowed.has(x.driverId));
 $('rosterList').innerHTML=allowedPlans.length?allowedPlans.map(x=>{
  const d=data.drivers.find(y=>y.id===x.driverId);
  return '<div class="vehicle"><strong>'+esc(d?.name||x.driverId)+'</strong><div class="meta">'+esc(x.driverId)+' · '+esc(({planned:'Tervezett',confirmed:'Megerősített',cancelled:'Nem jön'})[x.status]||'Ismeretlen')+'</div></div>';
 }).join(''):'<p class="empty">Még nincs futár-előrejelzés erre a napra.</p>';
 $('rosterForm').querySelectorAll('input,select,button').forEach(el=>el.disabled=busy||(el.id!=='rosterDate'&&!canReviewVehicles()));
}
function resetBulkApproval(){
 for(const key of ['bulkCars','bulkKeys','bulkClean'])$(key).checked=false;
}
function renderStaff(){
 if(!sourcesTrusted(STAFF_SOURCES)){
  resetBulkApproval();
  $('stats').innerHTML='<p class="hint">A reggeli autóállapotok még nem hitelesek. '+esc(sourceHealth(STAFF_SOURCES).message)+'</p>';
  $('dailyReport').textContent='A napi kilométeradatok szerveres megerősítésre várnak.';
  $('dailyDate').disabled=true;
  $('exportDailyCsv').disabled=true;
  $('exportConditionCsv').disabled=true;
  $('activeList').textContent='Szerveres ellenőrzés folyamatban.';
  $('allVehicleList').textContent='Az autólista szerveres visszaigazolásra vár.';
  $('reviewList').textContent='A visszavétel a szerveres adatkapcsolat megerősítéséig nem engedélyezett.';
  $('accessAlerts').textContent='A futárhozzáférések szerveres ellenőrzésére várunk.';
  $('rosterStats').textContent='A létszámadatok ellenőrzése folyamatban.';
  $('rosterList').textContent='';
  $('rosterForm').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  show('bulkPanel',false);
  return;
 }
 $('dailyDate').disabled=false;
 $('exportDailyCsv').disabled=false;
 $('exportConditionCsv').disabled=false;
 const canReview=canReviewVehicles();
 const sessions=data.sessions,active=sessions.filter(x=>x.status==='active'),waiting=sessions.filter(x=>x.status==='awaiting_review'),locked=data.locks.filter(x=>x.state!=='reviewed');
 // Any newly checked-out/removed vehicle invalidates the earlier bulk
 // confirmation; the manager must physically check the UPDATED list.
 const signature=waiting.map(x=>[x.id,x.plate,x.uid,x.endKm,x.damageNote,x.cleanlinessNote].join(':')).sort().join('|');
 // Snapshot user ticks before a harmless metadata/realtime re-render. A changed
 // checkout list invalidates all prior physical inspection acknowledgements.
 const sameWaitingList=lastWaitingSignature===signature;
 const checkedCards=new Map();
 if(sameWaitingList&&canReview){
  for(const card of $('reviewList').querySelectorAll('[data-session]')){
   const checked=[...card.querySelectorAll('input[data-check]:checked')]
    .map(input=>input.dataset.check);
   checkedCards.set(card.dataset.session,new Set(checked));
  }
 }
 if(!sameWaitingList){resetBulkApproval();lastWaitingSignature=signature;}
 const daily=attendanceDailyReport({date:dailyReportDate||day(),sessions:data.sessions});
 $('dailyDate').max=day();
 if(!dailyReportDate) $('dailyDate').value=day();
 if(!daily.ready){
  $('dailyReport').textContent='A napi riport nem számítható: '+daily.reason;
 }else{
  const overview='<div class="stats">'+[
   ['Becsekkolások a napon',daily.checkins],['Kicsekkolások a napon',daily.checkouts],
   ['Bejelentett km',daily.reportedKm],['Visszaigazolt km',daily.reviewedKm],
   ['Visszaadásra vár (összes)',daily.awaitingReviewNow],
   ['Jelzett sérülések',daily.damageReports],
   ['Jelzett tisztasági problémák',daily.cleanlinessReports],
   ['Adateltérések',daily.issues.length]
  ].map(([label,value])=>'<div class="stat"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('')+'</div>';
  const drivers=daily.couriers.map(row=>'<article class="vehicle"><strong>'+esc(row.driverId)
   +'</strong><div class="meta">Kicsekkolás: '+esc(row.checkouts)
   +' · Bejelentett km: '+esc(row.reportedKm)
   +' · Visszaigazolt km: '+esc(row.reviewedKm)
   +' · Autó(k): '+esc(row.plates.join(', ')||'—')+'</div></article>').join('')
   ||'<p class="empty">Ma még nincs kilométerrel lezárt cégesautó-használat.</p>';
  const problems=daily.issues.length?'<p class="hint">Ellenőrzendő események: '
   +daily.issues.map(x=>esc(x.id)+' ('+esc(x.reason)+')').join('; ')+'</p>':'';
  const conditionFlags=daily.conditionFlags.length?'<h3>Futár által jelzett járműállapotok</h3><div class="stack">'
   +daily.conditionFlags.map(x=>'<article class="vehicle"><strong>'+esc(x.plate)+' · '+esc(x.driverId)
     +'</strong><div class="meta">'
     +(x.damage?'Sérülés jelezve. ':'')
     +(x.cleanliness?'Tisztasági probléma jelezve. ':'')
     +(x.status==='reviewed'?'Reggel visszavéve.':'Visszaadás még ellenőrzésre vár.')
     +'</div></article>').join('')+'</div>':'';
  $('dailyReport').innerHTML=overview+'<div class="stack">'+drivers+'</div>'+conditionFlags+problems;
 }


 const accessReport=auditCourierAccess(data.accesses);
 const warnings=[
  ...accessReport.duplicates.map(x=>x.driverId+': '+x.activeAccounts+' aktív hozzáférés ugyanahhoz a DA-kódhoz.'),
  ...accessReport.invalid.map(x=>'Érvénytelen hozzáférés: '+x.driverId+' ('+x.uid+')')
 ];
 $('accessAlerts').innerHTML=warnings.length?warnings.map(w=>'<p class="hint">⚠ '+esc(w)+'</p>').join('')
  :'<p class="hint">Nem található duplikált aktív DA-kódos hozzáférés.</p>';
 const capacity=fleetSummary({vehicles:data.vehicles,locks:locked,confirmedDrivers:0});
 $('stats').innerHTML=[['Használatban',active.length],['Reggeli ellenőrzésre vár',waiting.length],['Aktív Attendance nélkül',capacity.physicallyReady],['Ügyintézést igényel',sessions.filter(x=>x.status==='exception').length]].map(([label,n])=>'<div class="stat"><b>'+n+'</b><span>'+esc(label)+'</span></div>').join('');
 $('activeList').innerHTML=active.length?active.map(s=>'<article class="vehicle">'+adminSession(s)+'</article>').join(''):'<p class="empty">Nincs aktív kiadás.</p>';

 const inventory=buildFleetOverview({vehicles:data.vehicles,locks:data.locks,sessions:data.sessions,driverLocks:data.driverLocks});
 $('allVehicleList').innerHTML=inventory.rows.map(x=>{
  const driver=data.drivers.find(d=>d.id===x.driverId);
  return '<article class="vehicle"><strong>'+esc(x.plate)+'</strong><div class="meta">'+esc(x.text)
   +(x.driverId?' · '+esc(driver?.name||x.driverId)+' ('+esc(x.driverId)+')':'')+'</div></article>';
 }).concat(inventory.unmatchedLocks.map(x=>'<article class="vehicle"><strong>'+esc(x.plate)
  +'</strong><div class="meta">'+esc(x.text)+' · '+esc(x.driverId)+'</div></article>')).join('')
  ||'<p class="empty">Nincs autó a közös törzsadatbázisban.</p>';

 $('reviewList').innerHTML=waiting.length?waiting.map(s=>'<article class="vehicle" data-session="'+esc(s.id)+'">'+adminSession(s)+
 '<div class="meta">Záró km: '+esc(s.endKm)+' · kijelentkezés: '+esc(displayTime(s.endedAt))+'</div>'+
 (s.damageNote?'<p class="hint">Sérülés/észrevétel: '+esc(s.damageNote)+'</p>':'')+
 (s.cleanlinessNote?'<p class="hint">Tisztasági probléma: '+esc(s.cleanlinessNote)+'</p>':'')+
 (canReview?'<div class="checks"><label><input type="checkbox" data-check="car"> Autó megvan</label><label><input type="checkbox" data-check="key"> Kulcs megvan</label><label><input type="checkbox" data-check="clean"> Tiszta</label></div>'+
 (s.damageNote?'<label class="tick"><input type="checkbox" data-check="damage"> Sérülést külön ellenőriztem</label>':'')+
 (s.cleanlinessNote?'<label class="tick"><input type="checkbox" data-check="cleanliness"> Tisztasági problémát külön ellenőriztem</label>':'')+
 '<button class="primary" type="button" data-review="'+esc(s.id)+'">Autó visszavétele</button>':
 '<p class="hint">Csak jogosult depóvezető vagy szerkesztő rögzítheti a visszavételt.</p>')+
 '</article>').join(''):'<p class="empty">Nincs ellenőrzésre váró autó.</p>';
 // Preserve only ticks for precisely the same trusted list and same session.
 // Never carry approvals through a changed status, damage/cleanliness report,
 // identity switch, loss of source trust or a physical-return completion.
 if(sameWaitingList&&canReview){
  for(const card of $('reviewList').querySelectorAll('[data-session]')){
   const checked=checkedCards.get(card.dataset.session);
   if(!checked)continue;
   for(const input of card.querySelectorAll('input[data-check]'))
    input.checked=checked.has(input.dataset.check);
  }
 }
 show('bulkPanel',canReview&&waiting.length>0);
 $('reviewList').querySelectorAll('input,button[data-review]').forEach(el=>el.disabled=busy);
 $('bulkPanel').querySelectorAll('input,button').forEach(el=>el.disabled=busy);
 renderRoster();renderQuotaAdmin();
}
let pendingQuotaOperation=null;
function renderQuotaAdmin(){
 const enabled=staffRole==='admin'&&sourcesTrusted(STAFF_SOURCES);
 show('quotaAdminPanel',staffRole==='admin');
 const select=$('quotaTarget'),prior=select.value;
 select.innerHTML='<option value="">Válassz futárt…</option>'+data.accesses.filter(a=>a.active).map(a=>
  '<option value="'+esc(a.uid||a.id)+'">'+esc(a.driverId)+' · '+esc(a.uid||a.id)+'</option>').join('');
 if([...select.options].some(o=>o.value===prior))select.value=prior;
 $('quotaAdminForm').querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=!enabled||busy);
}
const adminOperationId=()=>crypto.randomUUID().replaceAll('-','');
$('quotaAdminForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||staffRole!=='admin')return;setBusy(true);
 try{
  await ensureAttendanceSources(STAFF_SOURCES);
  const actor=user.uid,form=e.target,action=form.elements.action.value,targetUid=form.elements.targetUid.value,reason=form.elements.reason.value.trim();
  const target=data.accesses.find(a=>(a.uid||a.id)===targetUid&&a.active);
  if(!target)throw Error('Válassz aktív futárhozzáférést.');
  const payload={action,targetUid,reason,...action==='adminGrant'?{amount:Number(form.elements.amount.value)}:{sessionId:target.photoUploadPermit?.sessionId}};
  if(action!=='adminGrant'&&!payload.sessionId)throw Error('Nincs függő feltöltési engedély.');
  const fingerprint=JSON.stringify({actor,...payload});
  if(pendingQuotaOperation?.fingerprint!==fingerprint)pendingQuotaOperation={fingerprint,operationId:adminOperationId()};
  await permitCall({...payload,operationId:pendingQuotaOperation.operationId});
  if(user?.uid!==actor)throw Error('A bejelentkezés megváltozott.');
  pendingQuotaOperation=null;form.elements.reason.value='';toast('A naplózott fotófeltöltési kivétel elkészült.');
 }catch(error){toast('A kivétel nem menthető: '+error.message,true);}finally{setBusy(false);}
});
$('restartPhotoPermit').addEventListener('click',()=>{
 if(busy||!user||!confirm('Az új feltöltési munkamenet napi keretet használ. Előkészíted?'))return;
 clearPermitRequest(user.uid);pendingCheckIn=null;photoCache.clear();show('restartPhotoPermit',false);
 toast('Az új feltöltés előkészítve. A becsekkolás gombbal indíthatod.');
});
function render(){if(!user)return;if(isStaff)renderStaff();else if(access)renderCourier();}
async function checkin(e){
 e.preventDefault();if(busy)return;setBusy(true);
 try{
  if(!navigator.onLine)throw Error('Internetkapcsolat nélkül nem lehet autót átvenni.');
  await ensureAttendanceSources(COURIER_SOURCES);
  const form=e.target,plate=PLATE(form.elements.plate.value),km=Number(form.elements.km.value);
  if(!form.elements.condition.checked)throw Error('Ellenőrizd a járművet.');
  const files=allPhotoFiles(form);
  const actor=user.uid,grant=await requestPhotoPermit(permitCall,{uid:actor,stage:'in'});
  if(user?.uid!==actor)throw Error('A bejelentkezés megváltozott.');
  pendingCheckIn={sessionId:grant.sessionId};
  const sessionId=grant.sessionId;
  show('restartPhotoPermit',false);
  const proposed=Object.fromEntries(PHOTO_KEYS.map(k=>[k,'attendance/'+user.uid+'/'+sessionId+'/in/'+k+'.jpg']));
  const preflight=planCheckIn({uid:user.uid,access,vehicle:data.vehicles.find(v=>PLATE(v.plate||v.id)===plate),
   lock:data.locks.find(l=>l.plate===plate),claim:ownClaim(),sessionId,mileage:km,photos:proposed});
  if(!preflight.ok)throw Error(preflight.reason);
  const paths=await uploadPhotos(files,sessionId,'in');
  const vRef=doc(db,'vehicles',plate),lRef=doc(db,'vehicleLocks',plate),cRef=doc(db,'courierLocks',user.uid),aRef=doc(db,'courierAccess',user.uid),sRef=doc(db,'vehicleSessions',sessionId);
  await runTransaction(db,async tx=>{
   const driver=await tx.get(aRef);
   if(!driver.exists()||!driver.data().active||!driver.data().driverId)
    throw Error('Nincs érvényes futárjogosultság.');
   const dRef=doc(db,'driverLocks',driver.data().driverId);
   const [vehicle,lock,claim,driverLock,oldSession]=await Promise.all([
    tx.get(vRef),tx.get(lRef),tx.get(cRef),tx.get(dRef),tx.get(sRef)
   ]);
   const plan=planCheckIn({uid:user.uid,access:driver.exists()?{uid:user.uid,...driver.data()}:null,vehicle:vehicle.exists()?{id:plate,...vehicle.data()}:null,lock:lock.exists()?lock.data():null,claim:claim.exists()?claim.data():null,driverLock:driverLock.exists()?driverLock.data():null,sessionId,mileage:km,photos:paths});
   if(!plan.ok)throw Error(plan.reason);
   if(oldSession.exists())throw Error('Az esemény már létezik.');
   tx.set(sRef,{uid:user.uid,driverId:plan.driverId,plate,status:'active',startKm:km,endKm:null,
    inPhotos:paths,outPhotos:{},damageNote:'',cleanlinessNote:'',keyDropped:false,reviewChecks:{},startedAt:serverTimestamp(),endedAt:null,reviewedAt:null,reviewedBy:''});
   tx.set(lRef,{plate,uid:user.uid,driverId:plan.driverId,sessionId,state:'active'});
   tx.set(cRef,{plate,sessionId,state:'active'});
   tx.set(dRef,{driverId:plan.driverId,plate,uid:user.uid,sessionId,state:'active'});
  });
  toast('Becsekkolás sikeres. A jármű használatba került.');form.reset();clearPermitRequest(actor);pendingCheckIn=null;photoCache.clear();
 }catch(error){show('restartPhotoPermit',error.restartAllowed===true);toast('Becsekkolás sikertelen: '+error.message,true);}finally{setBusy(false);}
}
async function checkout(e){
 e.preventDefault();if(busy)return;setBusy(true);
 try{
  if(!navigator.onLine)throw Error('Internetkapcsolat nélkül nem lehet kijelentkezni.');
  await ensureAttendanceSources(COURIER_SOURCES);
  const form=e.target,claim=ownClaim(),session=activeSession();
  if(!claim||!session)throw Error('Nincs aktív autóhasználat.');
  if(!form.elements.keyDropped.checked)throw Error('Előbb tedd a kulcsot a ládába.');
  const km=Number(form.elements.km.value),damageNote=String(form.elements.damageNote.value||''),
   cleanlinessNote=String(form.elements.cleanlinessNote.value||'');
  const files=allPhotoFiles(form);
  const proposed=Object.fromEntries(PHOTO_KEYS.map(k=>[k,'attendance/'+user.uid+'/'+session.id+'/out/'+k+'.jpg']));
  const preflight=planCheckOut({uid:user.uid,session,mileage:km,photos:proposed,damageNote,cleanlinessNote,keyDropped:true});
  if(!preflight.ok)throw Error(preflight.reason);
  const actor=user.uid;await requestPhotoPermit(permitCall,{uid:actor,stage:'out',sessionId:session.id});
  if(user?.uid!==actor)throw Error('A bejelentkezés megváltozott.');
  const paths=await uploadPhotos(files,session.id,'out');
  const sRef=doc(db,'vehicleSessions',session.id),lRef=doc(db,'vehicleLocks',session.plate),cRef=doc(db,'courierLocks',user.uid),dRef=doc(db,'driverLocks',session.driverId);
  await runTransaction(db,async tx=>{
   const [live,lock,current,driverLock]=await Promise.all([tx.get(sRef),tx.get(lRef),tx.get(cRef),tx.get(dRef)]);
   if(!live.exists()||!lock.exists()||!current.exists()||!driverLock.exists()
    ||lock.data().sessionId!==session.id||current.data().sessionId!==session.id
    ||driverLock.data().sessionId!==session.id||driverLock.data().uid!==user.uid)
    throw Error('A kiadás időközben megváltozott.');
   const result=planCheckOut({uid:user.uid,session:{id:live.id,...live.data()},mileage:km,photos:paths,damageNote,cleanlinessNote,keyDropped:true});
   if(!result.ok)throw Error(result.reason);
   tx.update(sRef,{status:'awaiting_review',endKm:km,outPhotos:paths,damageNote,cleanlinessNote,keyDropped:true,endedAt:serverTimestamp()});
   tx.update(lRef,{state:'awaiting_review'});tx.update(cRef,{state:'awaiting_review'});tx.update(dRef,{state:'awaiting_review'});
  });
  toast('Kicsekkolás sikeres. Az autó a reggeli ellenőrzésig zárolva marad.');form.reset();photoCache.clear();
 }catch(error){toast('Kicsekkolás sikertelen: '+error.message,true);}finally{setBusy(false);}
}
async function reviewOne(sessionId,{car,key,clean,damage,cleanliness=false}){
 if(!canReviewVehicles())throw Error('Csak jogosult belső munkatárs igazolhatja a visszavételt.');
 await ensureAttendanceSources(STAFF_SOURCES);
 const sRef=doc(db,'vehicleSessions',sessionId);
 await runTransaction(db,async tx=>{
  const s=await tx.get(sRef);
  if(!s.exists())throw Error('A járműátadás már nem található.');
  const item={id:s.id,...s.data()},lRef=doc(db,'vehicleLocks',item.plate),cRef=doc(db,'courierLocks',item.uid),dRef=doc(db,'driverLocks',item.driverId);
  const detailsRef=doc(db,'fleetRecords','vehicle__'+item.plate);
  const [l,c,d,details]=await Promise.all([tx.get(lRef),tx.get(cRef),tx.get(dRef),tx.get(detailsRef)]);
  if(!l.exists()||!c.exists()||!d.exists()
   ||l.data().sessionId!==sessionId||c.data().sessionId!==sessionId||d.data().sessionId!==sessionId
   ||d.data().uid!==item.uid)
   throw Error('Az autó foglalási állapota megváltozott.');
  const decision=planReview({session:item,carPresent:car,keyPresent:key,clean,damageReviewed:damage,cleanlinessReviewed:cleanliness});
  if(!decision.ok)throw Error(decision.reason);
  const reviewChecks={carPresent:car,keyPresent:key,clean,damageReviewed:damage===true,cleanlinessReviewed:cleanliness===true};
  tx.update(sRef,{status:'reviewed',reviewChecks,reviewedAt:serverTimestamp(),reviewedBy:user.uid});
  if(details.exists())tx.update(detailsRef,{'data.mileage':Math.max(details.data().data.mileage,item.endKm),
   revision:details.data().revision+1,updatedAt:serverTimestamp(),updatedBy:user.uid});
  else tx.set(detailsRef,{kind:'vehicle',data:initialVehicleDetails(item.plate,item.endKm),revision:1,
   createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});
  tx.delete(lRef);tx.delete(cRef);tx.delete(dRef);
 });
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();setBusy(true);try{const f=new FormData(e.target);await signInWithEmailAndPassword(auth,String(f.get('email')).trim(),String(f.get('password')));}catch(err){toast('Belépés sikertelen. Ellenőrizd a hozzáférésedet.',true);}finally{setBusy(false);}});
$('logout').addEventListener('click',()=>signOut(auth));
$('refreshAttendanceData').addEventListener('click',async ()=>{
 if(!user||busy)return;
 setBusy(true);
 try{await refreshAttendanceSources();toast('A járműadatok szerverről frissítve.');}
 catch(err){toast('Nem sikerült frissíteni: '+err.message,true);}
 finally{setBusy(false);}
});
$('checkinForm').addEventListener('submit',checkin);
$('rosterForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!['admin','editor'].includes(staffRole))return;
 const f=e.target,v=Object.fromEntries(new FormData(f));
 const p=planCourierDay(v);
 if(!p.ok)return toast(p.reason,true);
 if(!data.accesses.some(x=>x.active&&x.driverId===p.driverId))return toast('A futár nem jogosult a cégesautó Attendance használatára.',true);
 setBusy(true);try{
  await setDoc(doc(db,'courierDayPlans',p.id),{date:p.date,driverId:p.driverId,status:p.status,changedAt:serverTimestamp(),changedBy:user.uid});
  toast('Napi futárterv mentve.');rosterDate=p.date;
 }catch(error){toast('Nem menthető a terv: '+error.message,true);}finally{setBusy(false);}
});
$('rosterDate').addEventListener('change',e=>{rosterDate=e.target.value;renderRoster();});
$('dailyDate').addEventListener('change',e=>{dailyReportDate=e.target.value;if(user&&isStaff)renderStaff();});
$('exportDailyCsv').addEventListener('click',()=>{
 if(!user||!isStaff||!sourcesTrusted(STAFF_SOURCES))
  return toast('A napi riport exportjához hiteles szerveres adatok szükségesek.',true);
 const report=attendanceDailyReport({date:dailyReportDate||day(),sessions:data.sessions});
 if(!report.ready)return toast('A napi riport nem exportálható: '+report.reason,true);
 const bytes=attendanceReportCsv(report);
 const url=URL.createObjectURL(new Blob([bytes],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');
 link.href=url;link.download='imile-attendance-'+report.date+'.csv';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});

$('exportConditionCsv').addEventListener('click',()=>{
 if(!user||!isStaff||!sourcesTrusted(STAFF_SOURCES))
  return toast('A járműállapot-riporthoz hiteles szerveres adatok szükségesek.',true);
 const report=attendanceDailyReport({date:dailyReportDate||day(),sessions:data.sessions});
 if(!report.ready)return toast('A járműállapot-riport nem exportálható: '+report.reason,true);
 const bytes=attendanceConditionCsv(report);
 const url=URL.createObjectURL(new Blob([bytes],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');
 link.href=url;link.download='imile-autok-allapota-'+report.date+'.csv';
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('checkoutForm').addEventListener('submit',checkout);
let shownPhotoUrls=[];
async function openPhotos(sessionId){
 const s=data.sessions.find(x=>x.id===sessionId);
 if(!isStaff||!s)return toast('Nincs jogosultság a fotók megtekintéséhez.',true);
 const dialog=$('photosDialog'),root=$('photosContent');
 shownPhotoUrls.forEach(url=>URL.revokeObjectURL(url));shownPhotoUrls=[];
 $('photosTitle').textContent=s.plate+' · '+(s.driverId||'')+' · autófotók';
 root.replaceChildren();
 dialog.showModal();
 for(const stage of ['in','out']){
  const paths=stage==='in'?s.inPhotos:s.outPhotos;
  if(!paths||!PHOTO_KEYS.every(k=>typeof paths[k]==='string'))continue;
  let proof;
  try{proof=(await getDocFromServer(doc(db,'photoReceipts',s.uid,'sessions',sessionId,'stages',stage))).data();}
  catch{const p=document.createElement('p');p.textContent='A szerveres fotóigazolás nem érhető el.';root.append(p);continue;}
  for(const key of PHOTO_KEYS){
   const cell=document.createElement('div');cell.className='photo';
   const name=document.createElement('strong');name.textContent=(stage==='in'?'Átvétel: ':'Visszaadás: ')+PHOTO_LABELS[key];
   const p=document.createElement('p');p.textContent='Betöltés…';
   cell.append(name,p);root.append(cell);
   try{
    const blob=await readVerifiedPhoto({proof,expected:{uid:s.uid,sessionId,stage,paths},key,
     metadata:p=>getMetadata(storageRef(storage,p)),download:p=>getBlob(storageRef(storage,p))});
    if(!dialog.open)break;
    const img=document.createElement('img'),url=URL.createObjectURL(blob);shownPhotoUrls.push(url);
    img.src=url;img.alt=name.textContent;
    cell.replaceChild(img,p);
   }catch(err){p.textContent='A kép nem érhető el. '+err.message;}
  }
 }
}
function closePhotos(){
 $('photosDialog').close();
 shownPhotoUrls.forEach(url=>URL.revokeObjectURL(url));shownPhotoUrls=[];
 $('photosContent').replaceChildren();
}
$('closePhotos').addEventListener('click',closePhotos);
$('photosDialog').addEventListener('close',()=>{shownPhotoUrls.forEach(url=>URL.revokeObjectURL(url));shownPhotoUrls=[];});
document.addEventListener('click',e=>{const btn=e.target.closest('[data-photo-session]');if(btn&&isStaff)openPhotos(btn.dataset.photoSession);});
$('reviewList').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-review]');if(!btn||busy)return;
 if(!canReviewVehicles())return toast('Nincs visszavételi jogosultság.',true);
 const card=btn.closest('[data-session]'),id=btn.dataset.review;
 const has=name=>card.querySelector('[data-check="'+name+'"]')?.checked===true;
 if(!has('car')||!has('key')||!has('clean'))return toast('Az autót, a kulcsot és a tisztaságot külön ellenőrizd.',true);
 setBusy(true);btn.disabled=true;
 try{await reviewOne(id,{car:true,key:true,clean:true,damage:has('damage'),cleanliness:has('cleanliness')});toast('Visszavétel sikeresen rögzítve.');}
 catch(err){toast('Visszavétel nem sikerült: '+err.message,true);}
 finally{setBusy(false);btn.disabled=false;}
});
$('bulkReview').addEventListener('click',async ()=>{
 if(busy)return;
 if(!canReviewVehicles())return toast('Nincs csoportos visszavételi jogosultság.',true);
 try{await ensureAttendanceSources(STAFF_SOURCES);}catch(err){return toast('Nincs hiteles adatkapcsolat: '+err.message,true);}
 const selected=data.sessions.filter(x=>x.status==='awaiting_review');
 const result=bulkReviewEligible({sessions:selected,physicallyChecked:$('bulkCars').checked,keysChecked:$('bulkKeys').checked});
 if(!result.ok||!$('bulkClean').checked)return toast('Összes visszavétel tiltva: '+(result.reason||'Tisztasági ellenőrzés szükséges.'),true);
 if(!confirm('Valóban fizikailag ellenőrizted mind a(z) '+selected.length+' autót és kulcsot?'))return;
 setBusy(true);let ok=0;
 try{
  for(const s of selected){await reviewOne(s.id,{car:true,key:true,clean:true,damage:false});ok++;}
  toast('Mind a(z) '+ok+' autó visszavétele kész.');$('bulkCars').checked=$('bulkKeys').checked=$('bulkClean').checked=false;
 }catch(err){toast('Részleges visszavétel: '+ok+'/'+selected.length+'. A többi autó zárolva marad. '+err.message,true);}
 finally{setBusy(false);}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)render();});
setInterval(()=>{if(user&&!document.hidden)render();},60000);
onAuthStateChanged(auth,async u=>{
 const generation=++authGeneration;pendingCheckIn=null;photoCache.clear();
 clearSubscriptions();user=u;access=null;isStaff=false;staffRole='';lastWaitingSignature='';resetBulkApproval();
 show('loginPanel',!u);show('loadingPanel',!!u);show('courierPanel',false);show('adminPanel',false);show('deniedPanel',false);show('logout',!!u);show('refreshAttendanceData',!!u);
 if(!u)return;
 try{
  const [staff,courier]=await Promise.all([getDocFromServer(doc(db,'users',u.uid)),getDocFromServer(doc(db,'courierAccess',u.uid))]);
  if(generation!==authGeneration)return;
  if(staff.exists()&&staff.data().active===true&&['admin','editor','viewer'].includes(staff.data().role)){
   isStaff=true;staffRole=staff.data().role;show('adminPanel',true);startStaff();
  }else if(courier.exists()&&courier.data().active===true&&typeof courier.data().driverId==='string'){
   access={uid:u.uid,...courier.data()};show('courierPanel',true);startCourier();
  }else show('deniedPanel',true);
 }catch(err){if(generation===authGeneration){show('deniedPanel',true);toast('Nem sikerült a jogosultságot ellenőrizni: '+err.message,true);}}
 finally{if(generation===authGeneration)show('loadingPanel',false);}
});
window.addEventListener('offline',render);window.addEventListener('online',render);
