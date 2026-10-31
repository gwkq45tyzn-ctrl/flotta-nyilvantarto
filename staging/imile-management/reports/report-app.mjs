import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,query,
 orderBy,limit,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {allowedProfile} from '../session-policy.mjs';
import {inhub,ofd} from './report-core.mjs';
import {readXlsxFirstSheet,writeReportXlsx} from './xlsx-lite.mjs';
import {planPerformanceSnapshots,buildPerformanceStatistics,snapshotHash} from './report-statistics.mjs';

const $=id=>document.getElementById(id);
const field=(id,value)=>{$(id).textContent=String(value)};
const plain=(x)=>x==null?'—':String(x);
const pct=x=>x===null?'—':(x*100).toFixed(2).replace('.',',')+'%';
const entry=(values)=>{
 const tr=document.createElement('tr');
 for(const value of values){const td=document.createElement('td');td.textContent=plain(value);tr.append(td);}
 return tr;
};
let authorized=false,canSave=false,revision=0,excelBuffer=null,excelName=null;
let currentReport=null,sourceName=null,db=null,user=null,stats=null;
function clearReport(){
 revision++;excelBuffer=null;excelName=null;currentReport=null;sourceName=null;
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
  currentReport=result;sourceName=file.name.slice(0,200);
  $('download').disabled=false;preview(result);
  if(result.kind==='ofd'&&canSave){
   try{
    const planned=planPerformanceSnapshots(result);
    $('save').disabled=planned.some(x=>x.rows.length>300);
    field('saveNote',planned.length+' nap/depó rekord készíthető. A mentés csak külön jóváhagyással történik.');
   }catch(error){field('saveNote','Adatmentés blokkolva: '+error.message);$('save').disabled=true;}
  }else field('saveNote',result.kind==='inhub'
   ?'Az In-Hub-riport csak letölthető. A későbbi raktárstatisztikához külön adatmentési kontroll készül.'
   :'A statisztikai mentéshez admin vagy editor jogosultság szükséges.');
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
async function loadStats(){
 if(!authorized||!db)return;
 field('statStatus','Szerveri statisztikák betöltése…');
 $('courierStats').replaceChildren();$('vendorStats').replaceChildren();stats=null;
 try{
  const all=await getDocsFromServer(query(collection(db,'performanceDays'),orderBy('date','desc'),limit(250)));
  if(!authorized)return;
  const snapshot=buildPerformanceStatistics(all.docs.map(d=>d.data()));stats=snapshot;
  const warning=snapshot.partial?' · FIGYELEM: hibás vagy duplikált forrás!':'';
  field('statStatus',snapshot.reportDays+' nap/depó riport · '+snapshot.totalOFD+
   ' OFD · '+snapshot.totalDelivered+' kézbesített · '+pct(snapshot.rate)+warning+
   ' · Legfeljebb a 250 legutóbbi rekord (szerverről).');
  for(const r of snapshot.couriers.slice(0,100))$('courierStats').append(
   entry([r.daCode,r.daName,r.days,r.ofd,r.delivered,pct(r.rate),r.vendors.join(', ')]));
  for(const r of snapshot.vendors.slice(0,100))$('vendorStats').append(
   entry([r.date,r.station,r.vendor,r.couriers,r.ofd,r.delivered,pct(r.rate),r.spr.toFixed(1)]));
  if(!snapshot.couriers.length)$('courierStats').append(entry(['Még nincs mentett napi OFD-riport.']));
 }catch(error){field('statStatus','A szerveri statisztikák nem ellenőrizhetők: '+error.message);}
}
$('refreshStats').onclick=loadStats;
$('save').onclick=async()=>{
 if(!authorized||!canSave||!currentReport||currentReport.kind!=='ofd'||!db||!user)return;
 if(!$('approve').checked){field('saveNote','Mentés előtt jelöld be a jóváhagyást.');return;}
 const rev=revision,identity=user.uid,report=currentReport;
 const status=$('reportState').value;
 if(!['provisional','final'].includes(status))return;
 if(status==='final'&&!$('confirmFinal').checked){
  field('saveNote','Végleges napi riporthoz külön megerősítés szükséges.');return;
 }
 $('save').disabled=true;
 field('saveNote','Jogosultság-ellenőrzött, auditált Firestore-tranzakció…');
 try{
  const profile=(await getDocFromServer(doc(db,'users',identity))).data();
  if(!allowedProfile(profile)||!['admin','editor'].includes(profile.role))throw Error('Nincs érvényes mentési jogosultság.');
  if(rev!==revision||!authorized||user?.uid!==identity)return;
  const batches=planPerformanceSnapshots(report);
  if(batches.some(b=>b.rows.length>300))throw Error('Egy nap/depó legfeljebb 300 futárt tartalmazhat.');
  const prepared=await Promise.all(batches.map(async x=>({...x,contentHash:await snapshotHash(x)})));
  const changes=await runTransaction(db,async tx=>{
   // Firestore requires reading all current documents before any write.
   const refs=prepared.map(p=>doc(db,'performanceDays',p.key));
   const old=await Promise.all(refs.map(ref=>tx.get(ref)));
   let changed=0;
   for(let i=0;i<prepared.length;i++){
    const p=prepared[i],previous=old[i].exists()?old[i].data():null;
    if(previous&&previous.contentHash===p.contentHash&&previous.status===status)continue;
    if(previous&&!$('replaceApproved').checked)
     throw Error('Ehhez a naphoz/depóhoz már van riport. Javításhoz külön cserejóváhagyás szükséges: '+p.key);
    if(previous?.status==='final'&&status!=='final')
     throw Error('Végleges napi riport nem minősíthető vissza előzetessé.');
    const auditRef=doc(collection(db,'performanceAudits')),version=(previous?.version||0)+1;
    const data={
     key:p.key,date:p.date,station:p.station,status,rows:p.rows,
     totalOFD:p.totalOFD,totalDelivered:p.totalDelivered,courierCount:p.courierCount,
     contentHash:p.contentHash,sourceName,version,lastAuditId:auditRef.id,
     createdAt:previous?previous.createdAt:serverTimestamp(),
     createdBy:previous?previous.createdBy:identity,
     updatedAt:serverTimestamp(),updatedBy:identity
    };
    tx.set(refs[i],data);
    tx.set(auditRef,{
     reportKey:p.key,version,contentHash:p.contentHash,priorHash:previous?.contentHash||'',
     action:previous?'replace':'create',status,actor:identity,at:serverTimestamp(),sourceName
    });
    changed++;
   }
   return changed;
  });
  if(rev!==revision||!authorized)return;
  field('saveNote',changes?'Sikeres mentés: '+changes+' napi depórekord. Audit és verziókövetés kész.':
   'Azonos tartalom és státusz: nincs új mentés, nincs duplikáció.');
  $('approve').checked=false;$('replaceApproved').checked=false;
  await loadStats();
 }catch(error){field('saveNote','A mentés nem történt meg: '+error.message);}
 finally{if(rev===revision&&authorized&&currentReport?.kind==='ofd')$('save').disabled=false;}
};
if(firebaseConfig.projectId!=='imile-management-staging')field('access','Nem staging projekt: hozzáférés tiltva.');
else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async current=>{
  const authRev=++revision;authorized=false;canSave=false;user=null;clearReport();
  $('controls').hidden=true;$('file').value='';$('save').disabled=true;stats=null;
  if(!current){window.location.replace('../index.html');return;}
  try{
   const profile=(await getDocFromServer(doc(db,'users',current.uid))).data();
   if(authRev+1!==revision)return;
   if(!allowedProfile(profile)){field('access','Nincs aktív belső jogosultság.');return;}
   authorized=true;user=current;canSave=['admin','editor'].includes(profile.role);
   $('controls').hidden=false;$('saveOptions').hidden=!canSave;
   field('access','Belső hozzáférés: '+profile.role+' · helyi XLSX és ellenőrzött szerveri statisztika');
   loadStats();
  }catch{field('access','A jogosultság nem ellenőrizhető; hozzáférés tiltva.');}
 });
}
