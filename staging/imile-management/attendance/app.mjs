import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,onSnapshot,query,where,runTransaction,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {getStorage,ref as storageRef,uploadBytes,getBlob} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {PHOTO_KEYS,PHOTO_LABELS,PLATE,planCheckIn,planCheckOut,planReview,bulkReviewEligible,fleetSummary} from './core.mjs';
import {planCourierDay,planCapacity} from './roster.mjs';
import {uploadOrVerifyImmutable} from './photo-upload.mjs';
import {buildFleetOverview} from './fleet-overview.mjs';
import {auditCourierAccess} from './access-audit.mjs';
import {attendanceDailyReport,attendanceReportCsv} from './daily-report.mjs';
import {assessSources} from '../../../depokapacitas/source-health.mjs';
const $=id=>document.getElementById(id);
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
let user=null,access=null,isStaff=false,staffRole='',unsubs=[],data={vehicles:[],locks:[],driverLocks:[],sessions:[],drivers:[],accesses:[],plans:[],courierClaim:null},busy=false,sourceMeta={},lastWaitingSignature='';
const COURIER_SOURCES=['vehicles','locks','courierClaim','sessions'];
const STAFF_SOURCES=['vehicles','locks','driverLocks','sessions','drivers','accesses','plans'];
const canReviewVehicles=()=>isStaff&&['admin','editor'].includes(staffRole);
const sourceHealth=required=>assessSources(sourceMeta,{required,online:navigator.onLine});
const sourcesTrusted=required=>sourceHealth(required).trusted;
const tomorrow=()=>{const today=new Date(day()+'T12:00:00Z');today.setUTCDate(today.getUTCDate()+1);return today.toISOString().slice(0,10);};
let rosterDate='',dailyReportDate='';
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
function setBusy(value){busy=value;for(const id of ['checkinButton','checkoutButton','bulkReview'])$(id).disabled=value;}
function allPhotoFiles(form){
 return PHOTO_KEYS.map(key=>{
  const file=form.elements.namedItem(key)?.files?.[0];
  if(!file||!file.type.startsWith('image/')||file.size>8*1024*1024)
   throw Error(PHOTO_LABELS[key]+': csak fénykép, legfeljebb 8 MB.');
  return {key,file};
 });
}
async function uploadPhotos(files,sessionId,stage){
 const paths={};
 let reused=0;
 for(const {key,file} of files){
  // Re-encode every image as JPEG to normalize browser-camera MIME and strip EXIF metadata.
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Fotó tömörítése sikertelen.')),'image/jpeg',0.8));
  const path='attendance/'+user.uid+'/'+sessionId+'/'+stage+'/'+key+'.jpg';
  const result=await uploadOrVerifyImmutable({
   path,blob,
   upload:(p,image)=>uploadBytes(storageRef(storage,p),image,{contentType:'image/jpeg'}),
   readOriginal:p=>getBlob(storageRef(storage,p))
  });
  if(result.reused)reused++;
  paths[key]=result.path;
 }
 if(reused)toast(reused+' korábbi, azonos tartalmú fénykép megőrizve. Nem írtuk felül az eredeti képeket.');
 return paths;
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
 const report=planCapacity({date,vehicles:data.vehicles,locks:data.locks,driverLocks:data.driverLocks,plans:data.plans,accesses:data.accesses});
 if(!report.ready){$('rosterStats').textContent='Nem ellenőrizhető a terv: '+report.reason;return;}
 const kpis=[['Üzemképes autók',report.operationalCars],['Aktív Attendance nélkül',report.physicallyReady],
  ['Tervezett futárok',report.plannedCouriers],['Megerősített futárok',report.confirmedCouriers],
  ['Hiányzó megerősített futárok',report.missingConfirmed],['Digitálisan zárolt autók',report.unverifiedCars]];
 $('rosterStats').innerHTML=kpis.map(([label,n])=>'<div class="stat"><b>'+n+'</b><span>'+esc(label)+'</span></div>').join('');
 const allowedPlans=data.plans.filter(x=>x.date===date&&allowed.has(x.driverId));
 $('rosterList').innerHTML=allowedPlans.length?allowedPlans.map(x=>{
  const d=data.drivers.find(y=>y.id===x.driverId);
  return '<div class="vehicle"><strong>'+esc(d?.name||x.driverId)+'</strong><div class="meta">'+esc(x.driverId)+' · '+esc(({planned:'Tervezett',confirmed:'Megerősített',cancelled:'Nem jön'})[x.status]||'Ismeretlen')+'</div></div>';
 }).join(''):'<p class="empty">Még nincs futár-előrejelzés erre a napra.</p>';
 $('rosterForm').querySelectorAll('input,select,button').forEach(el=>{if(el.id!=='rosterDate')el.disabled=!['admin','editor'].includes(staffRole);});
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
 const canReview=canReviewVehicles();
 const sessions=data.sessions,active=sessions.filter(x=>x.status==='active'),waiting=sessions.filter(x=>x.status==='awaiting_review'),locked=data.locks.filter(x=>x.state!=='reviewed');
 // Any newly checked-out/removed vehicle invalidates the earlier bulk
 // confirmation; the manager must physically check the UPDATED list.
 const signature=waiting.map(x=>[x.id,x.plate,x.uid,x.endKm,x.damageNote].join(':')).sort().join('|');
 if(lastWaitingSignature!==signature){resetBulkApproval();lastWaitingSignature=signature;}
 const daily=attendanceDailyReport({date:dailyReportDate||day(),sessions:data.sessions});
 $('dailyDate').max=day();
 if(!dailyReportDate) $('dailyDate').value=day();
 if(!daily.ready){
  $('dailyReport').textContent='A napi riport nem számítható: '+daily.reason;
 }else{
  const overview='<div class="stats">'+[
   ['Ma indult',daily.checkins],['Ma kicsekkolt',daily.checkouts],
   ['Bejelentett km',daily.reportedKm],['Visszaigazolt km',daily.reviewedKm],
   ['Visszaadásra vár (összes)',daily.awaitingReviewNow],
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
  $('dailyReport').innerHTML=overview+'<div class="stack">'+drivers+'</div>'+problems;
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
 (canReview?'<div class="checks"><label><input type="checkbox" data-check="car"> Autó megvan</label><label><input type="checkbox" data-check="key"> Kulcs megvan</label><label><input type="checkbox" data-check="clean"> Tiszta</label></div>'+
 (s.damageNote?'<label class="tick"><input type="checkbox" data-check="damage"> Sérülést külön ellenőriztem</label>':'')+
 '<button class="primary" type="button" data-review="'+esc(s.id)+'">Autó visszavétele</button>':
 '<p class="hint">Csak jogosult depóvezető vagy szerkesztő rögzítheti a visszavételt.</p>')+
 '</article>').join(''):'<p class="empty">Nincs ellenőrzésre váró autó.</p>';
 show('bulkPanel',canReview&&waiting.length>0);
 renderRoster();
}
function render(){if(!user)return;if(isStaff)renderStaff();else if(access)renderCourier();}
async function checkin(e){
 e.preventDefault();if(busy)return;setBusy(true);
 try{
  if(!navigator.onLine)throw Error('Internetkapcsolat nélkül nem lehet autót átvenni.');
  await ensureAttendanceSources(COURIER_SOURCES);
  const form=e.target,plate=PLATE(form.elements.plate.value),km=Number(form.elements.km.value);
  if(!form.elements.condition.checked)throw Error('Ellenőrizd a járművet.');
  const files=allPhotoFiles(form);
  const sessionId='s_'+crypto.randomUUID().replace(/-/g,'');
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
    inPhotos:paths,outPhotos:{},damageNote:'',startedAt:serverTimestamp(),endedAt:null,reviewedAt:null,reviewedBy:''});
   tx.set(lRef,{plate,uid:user.uid,driverId:plan.driverId,sessionId,state:'active'});
   tx.set(cRef,{plate,sessionId,state:'active'});
   tx.set(dRef,{driverId:plan.driverId,plate,uid:user.uid,sessionId,state:'active'});
  });
  toast('Becsekkolás sikeres. A jármű használatba került.');form.reset();
 }catch(error){toast('Becsekkolás sikertelen: '+error.message,true);}finally{setBusy(false);}
}
async function checkout(e){
 e.preventDefault();if(busy)return;setBusy(true);
 try{
  if(!navigator.onLine)throw Error('Internetkapcsolat nélkül nem lehet kijelentkezni.');
  await ensureAttendanceSources(COURIER_SOURCES);
  const form=e.target,claim=ownClaim(),session=activeSession();
  if(!claim||!session)throw Error('Nincs aktív autóhasználat.');
  if(!form.elements.keyDropped.checked)throw Error('Előbb tedd a kulcsot a ládába.');
  const km=Number(form.elements.km.value),damageNote=String(form.elements.damageNote.value||'');
  const files=allPhotoFiles(form);
  const paths=await uploadPhotos(files,session.id,'out');
  const sRef=doc(db,'vehicleSessions',session.id),lRef=doc(db,'vehicleLocks',session.plate),cRef=doc(db,'courierLocks',user.uid),dRef=doc(db,'driverLocks',session.driverId);
  await runTransaction(db,async tx=>{
   const [live,lock,current,driverLock]=await Promise.all([tx.get(sRef),tx.get(lRef),tx.get(cRef),tx.get(dRef)]);
   if(!live.exists()||!lock.exists()||!current.exists()||!driverLock.exists()
    ||lock.data().sessionId!==session.id||current.data().sessionId!==session.id
    ||driverLock.data().sessionId!==session.id||driverLock.data().uid!==user.uid)
    throw Error('A kiadás időközben megváltozott.');
   const result=planCheckOut({uid:user.uid,session:{id:live.id,...live.data()},mileage:km,photos:paths,damageNote});
   if(!result.ok)throw Error(result.reason);
   tx.update(sRef,{status:'awaiting_review',endKm:km,outPhotos:paths,damageNote,endedAt:serverTimestamp()});
   tx.update(lRef,{state:'awaiting_review'});tx.update(cRef,{state:'awaiting_review'});tx.update(dRef,{state:'awaiting_review'});
  });
  toast('Kicsekkolás sikeres. Az autó a reggeli ellenőrzésig zárolva marad.');form.reset();
 }catch(error){toast('Kicsekkolás sikertelen: '+error.message,true);}finally{setBusy(false);}
}
async function reviewOne(sessionId,{car,key,clean,damage}){
 if(!canReviewVehicles())throw Error('Csak jogosult belső munkatárs igazolhatja a visszavételt.');
 await ensureAttendanceSources(STAFF_SOURCES);
 const sRef=doc(db,'vehicleSessions',sessionId);
 await runTransaction(db,async tx=>{
  const s=await tx.get(sRef);
  if(!s.exists())throw Error('A járműátadás már nem található.');
  const item={id:s.id,...s.data()},lRef=doc(db,'vehicleLocks',item.plate),cRef=doc(db,'courierLocks',item.uid),dRef=doc(db,'driverLocks',item.driverId);
  const [l,c,d]=await Promise.all([tx.get(lRef),tx.get(cRef),tx.get(dRef)]);
  if(!l.exists()||!c.exists()||!d.exists()
   ||l.data().sessionId!==sessionId||c.data().sessionId!==sessionId||d.data().sessionId!==sessionId
   ||d.data().uid!==item.uid)
   throw Error('Az autó foglalási állapota megváltozott.');
  const decision=planReview({session:item,carPresent:car,keyPresent:key,clean,damageReviewed:damage});
  if(!decision.ok)throw Error(decision.reason);
  tx.update(sRef,{status:'reviewed',reviewedAt:serverTimestamp(),reviewedBy:user.uid});
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
  for(const key of PHOTO_KEYS){
   const cell=document.createElement('div');cell.className='photo';
   const name=document.createElement('strong');name.textContent=(stage==='in'?'Átvétel: ':'Visszaadás: ')+PHOTO_LABELS[key];
   const p=document.createElement('p');p.textContent='Betöltés…';
   cell.append(name,p);root.append(cell);
   try{
    const blob=await getBlob(storageRef(storage,paths[key]));
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
 try{await reviewOne(id,{car:true,key:true,clean:true,damage:has('damage')});toast('Visszavétel sikeresen rögzítve.');}
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
 clearSubscriptions();user=u;access=null;isStaff=false;staffRole='';lastWaitingSignature='';resetBulkApproval();
 show('loginPanel',!u);show('loadingPanel',!!u);show('courierPanel',false);show('adminPanel',false);show('deniedPanel',false);show('logout',!!u);show('refreshAttendanceData',!!u);
 if(!u)return;
 try{
  const [staff,courier]=await Promise.all([getDocFromServer(doc(db,'users',u.uid)),getDocFromServer(doc(db,'courierAccess',u.uid))]);
  if(staff.exists()&&staff.data().active===true&&['admin','editor','viewer'].includes(staff.data().role)){
   isStaff=true;staffRole=staff.data().role;show('adminPanel',true);startStaff();
  }else if(courier.exists()&&courier.data().active===true&&typeof courier.data().driverId==='string'){
   access={uid:u.uid,...courier.data()};show('courierPanel',true);startCourier();
  }else show('deniedPanel',true);
 }catch(err){show('deniedPanel',true);toast('Nem sikerült a jogosultságot ellenőrizni: '+err.message,true);}
 finally{show('loadingPanel',false);}
});
