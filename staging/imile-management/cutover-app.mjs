import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer,collection,getDocsFromServer} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../depokapacitas/firebase-config.js';
import {assessFleetCutover} from './core-cutover-preflight.mjs';

const $=id=>document.getElementById(id);
const allowed=Object.freeze([
 'legacyServerVersionConfirmed','legacyPendingLocalChangesResolved',
 'legacyFullBackupVerified','stagingRestoreTestPassed',
 'dedicatedUsersApproved','durableHostingReady','businessDataMigrationApproved'
]);
const labels={
 legacyServerVersionConfirmed:'Régi központi verzió egyeztetése',
 legacyPendingLocalChangesResolved:'Helyi mentések és ütközések',
 legacyFullBackupVerified:'Régi teljes adatmentés',
 stagingRestoreTestPassed:'Új adatbázis visszaállítható mentése',
 dedicatedUsersApproved:'Személyhez kötött hozzáférések',
 durableHostingReady:'Tartós webcím és üzemeltetés',
 businessDataMigrationApproved:'Adatgazdai adatátvételi jóváhagyás'
};
const descriptions={
 approval_or_backup_missing:h=>labels[h.gate]||'Jóváhagyási feltétel',
 legacy_source_quality:h=>'Régi export – adatminőségi akadályok: '+h.count+' ('+
  'ismeretlen futárstátusz: '+h.unknownDriverStatuses+
  ', ismeretlen járműstátusz: '+h.unknownVehicleStatuses+')',
 staging_master_integrity:h=>'Staging törzsadatok érvénytelen/duplikált azonosítói: '+h.count+' eltérés',
 master_data_conflict:h=>'Valódi törzsadat-ütközés a stagingben: '+h.count+' rekord',
 other_master_blockers:h=>'További, külön ellenőrzendő törzsadat-akadályok: '+h.count+' eltérés',
 unmigrated_master_records:h=>'Át nem vett törzsadatok: '+h.vehicles+' jármű, '+h.drivers+' futár',
 legacy_detail_not_migrated:h=>'Régi részletes adatok ('+h.category+'): '+h.count
};
let currentUid=null,lastReport=null,runSequence=0;
const status=(msg,error=false)=>{$('status').textContent=msg;$('status').className=error?'error':'';};
function hide(){
 ++runSequence;currentUid=null;lastReport=null;$('work').hidden=true;
 $('output').hidden=true;$('download').disabled=true;$('legacyFile').value='';
 for(const input of document.querySelectorAll('input[data-gate]'))input.checked=false;
}
function proof(){
 const out={};
 for(const name of allowed){
  const field=document.querySelector('input[data-gate="'+name+'"]');
  if(!field)throw Error('Hiányzó jóváhagyási kapu: '+name);
  out[name]=field.checked===true;
 }
 return out;
}
function present(report){
 lastReport=report;$('output').hidden=false;
 $('decision').textContent=report.readiness==='blocked'?
  'Átállás blokkolva. A feltüntetett elemek nélkül nem szabad valós rekordokat importálni.':
  'Felülvizsgálatra kész, de nem élesítési engedély.';
 $('decision').className=report.readiness==='blocked'?'error':'';
 $('stats').replaceChildren();
 const stats=[
  ['Régi járművek',report.counts.legacyVehicles],
  ['Régi futárok',report.counts.legacyDrivers],
  ['Tankolókártyák',report.counts.legacyFuelCards],
  ['Kapcsolatok',report.counts.legacyContacts],
  ['Korábbi események',report.counts.legacyHistoryEvents],
  ['Aktív régi autókiadások',report.counts.legacyActiveVehicleAssignments],
  ['Új járműként szükséges',report.counts.newVehicles],
  ['Új futárként szükséges',report.counts.newDrivers],
  ['Törzsadat-ütközések',report.counts.conflictingDrivers+report.counts.conflictingVehicles]
 ];
 for(const [label,value] of stats){
  const card=document.createElement('div');card.className='kpi';
  const num=document.createElement('b');num.textContent=String(value);
  const name=document.createElement('span');name.textContent=label;
  card.append(num,name);$('stats').append(card);
 }
 $('holds').replaceChildren();
 for(const hold of report.holds){
  const item=document.createElement('li');
  item.textContent=(descriptions[hold.reason]||(()=>'Nem azonosított átállási feltétel'))(hold);
  $('holds').append(item);
 }
 if(!report.holds.length){const item=document.createElement('li');
  item.textContent='A leltárban nincs nyitott eltérés. Az üzemi átállást ettől még külön engedélyezni kell.';
  $('holds').append(item);
 }
 $('download').disabled=false;
}
if(firebaseConfig.projectId!=='imile-management-staging'){
 status('Ez az ellenőrző kizárólag a staging Firebase-projekthez használható.',true);
}else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
 onAuthStateChanged(auth,async user=>{
  hide();if(!user){status('Az iMile Management rendszerválasztón jelentkezz be.');return;}
  const uid=user.uid,sequence=runSequence;
  try{
   const snap=await getDocFromServer(doc(db,'users',uid));
   if(sequence!==runSequence)return;
   const role=snap.exists()?snap.data():null;
   if(role?.active!==true||role.role!=='admin'){
    status('Ehhez a csak olvasó átállási ellenőrzéshez aktív admin jogosultság szükséges.',true);
    return;
   }
   currentUid=uid;$('work').hidden=false;
   status('Aktív staging admin. A régi adatokat nem töltjük fel.');
  }catch{if(sequence===runSequence)status('A hozzáférés nem ellenőrizhető. Nincs adatfeldolgozás.',true);}
 });
 $('run').onclick=async()=>{
  if(!auth.currentUser||auth.currentUser.uid!==currentUid)return;
  const file=$('legacyFile').files?.[0];
  if(!file){status('Válassz egy teljes régi Flotta JSON-mentést.',true);return;}
  if(file.size>15*1024*1024){status('A fájl meghaladja a 15 MB-os korlátot.',true);return;}
  const sequence=++runSequence,uid=currentUid;
  $('run').disabled=true;$('download').disabled=true;$('output').hidden=true;lastReport=null;
  try{
   status('Teljes törzsállomány ellenőrzése, kizárólag olvasással…');
   const [drivers,vehicles,profile]=await Promise.all([
    getDocsFromServer(collection(db,'drivers')),
    getDocsFromServer(collection(db,'vehicles')),
    getDocFromServer(doc(db,'users',uid))
   ]);
   if(sequence!==runSequence||auth.currentUser?.uid!==uid||
    !profile.exists()||profile.data()?.role!=='admin'||profile.data()?.active!==true)
    throw Error('A munkamenet vagy a hozzáférés megváltozott.');
   const remote={drivers:drivers.docs.map(x=>({id:x.id,...x.data()})),
    vehicles:vehicles.docs.map(x=>({id:x.id,...x.data()}))};
   if(remote.drivers.length>20000||remote.vehicles.length>10000)
    throw Error('A staging törzsadat túl nagy ehhez a helyi vizsgálathoz.');
   const legacy=JSON.parse(await file.text());
   if(sequence!==runSequence||auth.currentUser?.uid!==uid)
    throw Error('A munkamenet megváltozott.');
   const report=assessFleetCutover({legacy,staging:remote,proof:proof()});
   present(report);status('Ellenőrzés elkészült. A régi JSON kizárólag memóriában volt.');
  }catch(error){
   status('Az ellenőrzés nem sikerült: '+String(error?.message||'ismeretlen hiba'),true);
  }finally{if(sequence===runSequence)$('run').disabled=false;}
 };
 $('download').onclick=()=>{
  if(!lastReport||auth.currentUser?.uid!==currentUid)return;
  const payload=JSON.stringify(lastReport,null,2);
  const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.download='imile_core_atallas_nevtelen_ellenorzes.json';a.href=url;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
}
