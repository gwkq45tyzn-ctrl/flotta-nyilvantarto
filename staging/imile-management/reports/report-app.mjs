import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,getIdToken,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,
 orderBy,limit} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {allowedProfile} from '../session-policy.mjs';
import {inhub,ofd} from './report-core.mjs';
import {readXlsxFirstSheet,writeReportXlsx} from './xlsx-lite.mjs';
import {planPerformanceSnapshots,buildPerformanceStatistics} from './report-statistics.mjs';
import {planInventorySnapshot,inventoryHistory} from './inventory-statistics.mjs';
import {reportApiReady,reportApiBaseUrl} from './report-api-config.mjs';

const $=id=>document.getElementById(id);
const field=(id,value)=>{$(id).textContent=String(value)};
const plain=(x)=>x==null?'—':String(x);
const pct=x=>x===null?'—':(x*100).toFixed(2).replace('.',',')+'%';
const entry=(values)=>{
 const tr=document.createElement('tr');
 for(const value of values){const td=document.createElement('td');td.textContent=plain(value);tr.append(td);}
 return tr;
};
let authorized=false,canSave=false,canRestore=false,inspectedArchive=null,revision=0,excelBuffer=null,excelName=null;
let currentReport=null,currentSourceMatrix=null,sourceName=null,db=null,user=null,stats=null;
$('inventoryDay').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function clearReport(){
 revision++;excelBuffer=null;excelName=null;currentReport=null;currentSourceMatrix=null;sourceName=null;
 $('download').disabled=true;$('save').disabled=true;$('preview').hidden=true;
 $('stats').replaceChildren();$('approve').checked=false;
}
$('file').addEventListener('change',clearReport);
$('kind').addEventListener('change',clearReport);
function preview(report){
 $('preview').hidden=false;
 field('summary',report.kind==='inhub'
  ?'Összes csomag: '+report.total+' · Területek: '+report.rows.length+' · Dátumok: '+report.dates.length
  :'OFD: '+report.totalOfd+' · DLD: '+report.totalDelivered+' · Futárok: '+report.uniqueCouriers+
   ' · Vállalkozói csoportok: '+report.vendors.length+' · Kézbesítés: '+pct(report.rate));
 $('stats').replaceChildren();
 const list=report.kind==='inhub'
  ?report.rows.map(x=>[x.area,x.counts.reduce((a,v)=>a+v,0)])
  :report.vendors.map(x=>[x.vendor+' · '+x.station,x.delivered+'/'+x.ofd+' · '+pct(x.rate)]);
 for(const values of list.slice(0,100))$('stats').append(entry(values));
}
$('form').onsubmit=async event=>{
 event.preventDefault();if(!authorized)return;clearReport();
 const rev=revision,file=$('file').files?.[0],kind=$('kind').value;
 if(!file||!/\.xlsx$/i.test(file.name)||file.size>8*1024*1024){
  field('message','Legfeljebb 8 MB-os .xlsx fájl szükséges.');return;
 }
 $('prepare').disabled=true;field('message','A fájl ellenőrzése és a helyi Excel generálása…');
 try{
  const matrix=await readXlsxFirstSheet(await file.arrayBuffer());
  if(rev!==revision||!authorized)return;
  const result=kind==='inhub'?inhub(matrix):ofd(matrix);
  if(result.status!=='ready'){
   field('message','Riport tiltva: '+result.status+' · '+(result.issues||[])
    .slice(0,6).map(x=>'sor '+x.line+': '+x.reason).join('; '));return;
  }
  const bytes=writeReportXlsx(matrix,result);
  if(rev!==revision||!authorized)return;
  excelBuffer=bytes;excelName=kind==='inhub'
   ?'iMile_InHub_Inventory_kesz.xlsx':'iMile_DA_OFD_Performance_kesz.xlsx';
  currentReport=result;currentSourceMatrix=matrix;sourceName=file.name.slice(0,200);
  $('download').disabled=false;preview(result);
  if(result.kind==='ofd'&&canSave){
   try{
    const planned=planPerformanceSnapshots(result);
    $('save').disabled= !reportApiReady || planned.some(x=>x.rows.length>300)||planned.length!==1;
    field('saveNote',!reportApiReady?'A biztonságos szerveroldali mentés még nincs bekapcsolva. Az Excel letölthető.':planned.length!==1?'Az adatsor több napot vagy depót tartalmaz. Az együttes tranzakciós mentés külön fejlesztés; az Excel letölthető.':'A napi riport ellenőrzés után szerveroldalon menthető.');
   }catch(error){field('saveNote','Adatmentés blokkolva: '+error.message);$('save').disabled=true;}
  }else if(result.kind==='inhub'&&canSave){
   try{planInventorySnapshot(result,matrix,$('inventoryDay').value);$('save').disabled=!reportApiReady;field('saveNote',reportApiReady?'A raktárpillanatkép ellenőrzött szerveroldali mentésre kész.':'A szerveroldali mentés nincs aktiválva; az Excel letölthető.');}
   catch(error){$('save').disabled=true;field('saveNote','Raktári mentés blokkolva: '+error.message);}
  }else field('saveNote','A statisztikai mentéshez admin vagy editor jogosultság szükséges.');
  field('message','A Sheet2 elkészült. Az Excel helyben, a böngésződben keletkezett.');
 }catch(error){if(rev===revision)field('message','A fájl feldolgozása sikertelen: '+error.message);}
 finally{if(rev===revision)$('prepare').disabled=false;}
};
$('download').onclick=()=>{
 if(!authorized||!excelBuffer)return;
 const url=URL.createObjectURL(new Blob([excelBuffer],
  {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=excelName;document.body.append(a);
 a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function reportApi(path,{method='GET',payload=null}={}){
 if(!reportApiReady||!authorized||!user)throw Error('A biztonságos riport API nincs bekapcsolva.');
 const identity=user.uid,token=await getIdToken(user,true);
 if(!authorized||user?.uid!==identity)throw Error('A felhasználói munkamenet megváltozott.');
 const url=new URL(path,reportApiBaseUrl+'/');
 if(url.origin!==new URL(reportApiBaseUrl).origin)throw Error('Érvénytelen riport API-cím.');
 const res=await fetch(url,{method,mode:'cors',cache:'no-store',
  headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{})});
 let answer;
 try{answer=await res.json();}catch{throw Error('A szerver nem adott ellenőrizhető választ.');}
 if(!res.ok)throw Error('Szerveroldali mentés/lekérdezés tiltva: '+String(answer.error||res.status));
 return answer;
}
async function requestSave({kind,candidate,status=null,rev,identity,fileSource}){
 const allowReplace=$('replaceApproved').checked;
 let expectedVersion=null;
 if(allowReplace){
  const query=new URLSearchParams({kind,date:candidate.date,station:candidate.station}).toString();
  const current=await reportApi('/v1/reports/current?'+query);
  expectedVersion=current.exists?current.version:0;
 }
 const reply=await reportApi('/v1/reports/save',{method:'POST',
  payload:{kind,candidate,status,allowReplace,expectedVersion,sourceName:fileSource}});
 if(rev!==revision||user?.uid!==identity||!authorized)throw Error('A munkamenet megváltozott.');
 return reply.result;
}
async function saveInventory(){
 if(!reportApiReady||!authorized||!canSave||currentReport?.kind!=='inhub'||!currentSourceMatrix||!user)return;
 if(!$('approve').checked){field('saveNote','Mentés előtt ellenőrizd és hagyd jóvá az adatokat.');return;}
 const rev=revision,identity=user.uid,fileSource=sourceName;
 $('save').disabled=true;field('saveNote','Szerveroldali ellenőrzés és auditált mentés…');
 try{
  const p=planInventorySnapshot(currentReport,currentSourceMatrix,$('inventoryDay').value);
  const candidate={key:p.key,date:p.date,station:p.station,dates:p.dates,areas:p.areas,total:p.total};
  // An existing version must be fetched and explicitly confirmed before replacement.
  const result=await requestSave({kind:'inhub',candidate,rev,identity,fileSource});
  field('saveNote',result.status==='unchanged'?'Azonos raktárállapot: nincs duplázás.':
   'A napi raktárállapot ellenőrzött archívummal mentve. Verzió: '+result.version);
  $('approve').checked=false;await loadStats();
 }catch(error){field('saveNote','A raktári mentés nem történt meg: '+error.message);}
 finally{if(rev===revision&&authorized&&reportApiReady)$('save').disabled=false;}
}
async function loadStats(){
 if(!authorized||!db)return;
 field('statStatus','Szerveri statisztikák betöltése…');
 $('courierStats').replaceChildren();$('vendorStats').replaceChildren();stats=null;
 try{
  const all=await getDocsFromServer(query(collection(db,'performanceDays'),orderBy('date','desc'),limit(250)));
  if(!authorized)return;
  const records=all.docs.map(d=>d.data());
  const verified=records.filter(d=>d.validationSource==='server-aggregates-only');
  const excluded=records.length-verified.length;
  const snapshot=buildPerformanceStatistics(verified);stats=snapshot;
  const warning=snapshot.partial?' · FIGYELEM: hibás vagy duplikált forrás!':'';
  field('statStatus',snapshot.reportDays+' nap/depó riport · operatív (előzetest is tartalmaz): '+snapshot.totalOFD+
   ' OFD · '+snapshot.totalDelivered+' kézbesített · '+pct(snapshot.rate)+
   ' · VÉGLEGES KPI: '+snapshot.totalFinalOFD+' OFD / '+snapshot.totalFinalDelivered+
   ' DLD · '+pct(snapshot.finalRate)+' ('+snapshot.finalReportDays+' végleges és '+
   snapshot.provisionalReportDays+' előzetes riport)'+warning+
   ' · Legfeljebb a 250 legutóbbi rekord (szerverről).'+
   (excluded?' · '+excluded+' korábbi, nem szerverileg ellenőrzött rekord kizárva.':''));
  for(const r of snapshot.couriers.slice(0,100))$('courierStats').append(
   entry([r.daCode,r.daName,r.days,r.ofd,r.delivered,pct(r.rate),
    r.finalOfd,r.finalDelivered,pct(r.finalRate),r.vendors.join(', ')]));
  for(const r of snapshot.vendors.slice(0,100))$('vendorStats').append(
   entry([r.date,r.station,r.vendor,r.couriers,r.ofd,r.delivered,pct(r.rate),r.spr.toFixed(1)]));
  if(!snapshot.couriers.length)$('courierStats').append(entry(['Még nincs mentett napi OFD-riport.']));
 }catch(error){field('statStatus','Az OFD-statisztikák nem ellenőrizhetők: '+error.message);}
 try{
  const all=await getDocsFromServer(query(collection(db,'inventoryDays'),orderBy('date','desc'),limit(180)));
  if(!authorized)return;
  const records=all.docs.map(d=>d.data());
  const verified=records.filter(d=>d.validationSource==='server-aggregates-only');
  const excluded=records.length-verified.length;
  const history=inventoryHistory(verified);
  $('inventoryStats').replaceChildren();
  for(const row of history.rows.slice(0,100))
   $('inventoryStats').append(entry([row.date,row.station,row.total,row.areas]));
  field('inventoryStatStatus',history.rows.length+' raktárpillanatkép'+
   (history.errors.length?' · FIGYELEM: hibás forrásrekord!':'')+
   ' · legfeljebb 180 szerveri napi állapot.'+
   (excluded?' · '+excluded+' korábbi, nem szerverileg ellenőrzött rekord kizárva.':''));
 }catch(error){field('inventoryStatStatus','Raktári statisztika nem ellenőrizhető: '+error.message);}
}
$('refreshStats').onclick=loadStats;
$('inventoryDay').onchange=()=>{
 if(!currentReport||currentReport.kind!=='inhub'||!canSave)return;
 try{planInventorySnapshot(currentReport,currentSourceMatrix,$('inventoryDay').value);$('save').disabled=!reportApiReady;field('saveNote',reportApiReady?'A napi raktárpillanatkép szerveroldalon menthető.':'A mentési API még nincs konfigurálva.');}
 catch(error){$('save').disabled=true;field('saveNote','Raktári mentés blokkolva: '+error.message);}
};
$('save').onclick=async()=>{
 if(!reportApiReady||!authorized||!canSave||!currentReport||!user)return;
 if(currentReport.kind==='inhub')return saveInventory();
 if(currentReport.kind!=='ofd'||!$('approve').checked){
  field('saveNote','Mentés előtt ellenőrizd és hagyd jóvá a riportot.');return;
 }
 const rev=revision,identity=user.uid,fileSource=sourceName;
 const status=$('reportState').value;
 if(!['provisional','final'].includes(status))return;
 if(status==='final'&&!$('confirmFinal').checked){
  field('saveNote','A végleges napi eredményhez külön megerősítés kell.');return;
 }
 $('save').disabled=true;field('saveNote','Szerveroldali ellenőrzés, teljes archívum és audit…');
 try{
  const batches=planPerformanceSnapshots(currentReport);
  if(batches.length!==1)throw Error('Több nap/depó együttes mentése még nincs engedélyezve.');
  const p=batches[0];
  const candidate={key:p.key,date:p.date,station:p.station,rows:p.rows,
   totalOFD:p.totalOFD,totalDelivered:p.totalDelivered,courierCount:p.courierCount};
  const result=await requestSave({kind:'ofd',candidate,status,rev,identity,fileSource});
  field('saveNote',result.status==='unchanged'?'Azonos OFD riport: nincs duplázás.':
   'A futáreredmények szerveroldalon ellenőrizve, archívummal mentve. Verzió: '+result.version);
  $('approve').checked=false;await loadStats();
 }catch(error){field('saveNote','Az OFD-mentés nem történt meg: '+error.message);}
 finally{if(rev===revision&&authorized&&reportApiReady)$('save').disabled=false;}
};
for(const id of ['historyKind','historyDay','historyStation','historyVersion'])
 $(id).addEventListener('input',()=>{inspectedArchive=null;$('historyRestore').disabled=true;$('restoreConfirm').checked=false;});
$('historyFetch').onclick=async()=>{
 if(!reportApiReady||!authorized)return;
 inspectedArchive=null;$('historyRestore').disabled=true;$('restoreConfirm').checked=false;
 const authRevision=revision,uid=user?.uid;
 const kind=$('historyKind').value,date=$('historyDay').value,
  station=$('historyStation').value.trim(),version=$('historyVersion').value;
 try{
  const query=new URLSearchParams({kind,date,station,version}).toString();
  const reply=await reportApi('/v1/reports/version?'+query);
  if(authRevision!==revision||user?.uid!==uid)return;
  field('historyResult','Verzió '+version+' · '+reply.sourceValidation+' · '+JSON.stringify(reply.version));
  if(canRestore&&reply.version?.validationSource==='server-aggregates-only'&&
   reply.version?.unverifiedLegacy!==true){
   inspectedArchive={kind,date,station,version:Number(version)};
   $('historyRestore').disabled=false;
  }
 }catch(error){field('historyResult','A korábbi riportverzió nem érhető el: '+error.message);}
};
$('historyRestore').onclick=async()=>{
 if(!authorized||!canRestore||!reportApiReady||!inspectedArchive||!user)return;
 const version=inspectedArchive,
  reason=$('restoreReason').value.trim(),uid=user.uid,authRevision=revision;
 if(reason.length<10||reason.length>120||!$('restoreConfirm').checked){
  field('restoreResult','A visszaállításhoz legalább 10 karakteres indok és külön megerősítés szükséges.');
  return;
 }
 $('historyRestore').disabled=true;
 field('restoreResult','A jelenlegi verzió és az admin jogosultság szerveroldali ellenőrzése…');
 try{
  const params=new URLSearchParams({kind:version.kind,date:version.date,station:version.station});
  const current=await reportApi('/v1/reports/current?'+params);
  if(!current.exists)throw Error('A napi riport már nem érhető el.');
  if(authRevision!==revision||user?.uid!==uid||!authorized||!canRestore)return;
  const restored=await reportApi('/v1/reports/restore',{method:'POST',payload:{
   kind:version.kind,date:version.date,station:version.station,
   fromVersion:version.version,expectedVersion:current.version,
   reason,confirmed:true}});
  if(authRevision!==revision||user?.uid!==uid)return;
  field('restoreResult','Új, auditált riportverzió: '+restored.result.version+
   ' · visszaállított forrásverzió: '+version.version);
  inspectedArchive=null;$('restoreConfirm').checked=false;$('restoreReason').value='';
  await loadStats();
 }catch(error){
  field('restoreResult','A visszaállítás nem történt meg: '+error.message);
  if(authRevision===revision&&inspectedArchive)$('historyRestore').disabled=false;
 }
};
if(firebaseConfig.projectId!=='imile-management-staging')field('access','Nem staging projekt: hozzáférés tiltva.');
else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async current=>{
  const authRev=++revision;authorized=false;canSave=false;canRestore=false;inspectedArchive=null;user=null;clearReport();
  $('controls').hidden=true;$('file').value='';$('save').disabled=true;stats=null;
  if(!current){window.location.replace('../index.html');return;}
  try{
   const profile=(await getDocFromServer(doc(db,'users',current.uid))).data();
   if(authRev+1!==revision)return;
   if(!allowedProfile(profile)){field('access','Nincs aktív belső jogosultság.');return;}
   authorized=true;user=current;canSave=['admin','editor'].includes(profile.role);
   canRestore=profile.role==='admin';
   $('controls').hidden=false;$('saveOptions').hidden=!canSave;
   $('historyFetch').disabled=!reportApiReady;
   $('restoreOptions').hidden=!canRestore||!reportApiReady;
   $('historyRestore').disabled=true;
   if(!reportApiReady)field('saveNote','A biztonságos szerveroldali API még nincs aktiválva. A kész Excel letölthető.');
   field('access','Belső hozzáférés: '+profile.role+' · helyi XLSX és ellenőrzött szerveri statisztika');
   loadStats();
  }catch{field('access','A jogosultság nem ellenőrizhető; hozzáférés tiltva.');}
 });
}
