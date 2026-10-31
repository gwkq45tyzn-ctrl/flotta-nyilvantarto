import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,setDoc,deleteDoc,runTransaction,writeBatch,serverTimestamp,query,orderBy} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {parseDay,parseTime} from './import-dates.mjs';
import {readNonNegativeCount,buildImportPlan,formatImportErrors} from './import-validation.mjs';
import {assessBooking,effectiveCapacity,eligibleDriver} from './capacity-eligibility.mjs';
import {planSharedMasterMigration} from '../staging/imile-management/shared-import-plan.mjs';
import {deriveAttendanceHandovers} from '../staging/imile-management/attendance-handover.mjs';
import {decodeCsv} from './import-encoding.mjs';

const $=id=>document.getElementById(id);
const state={role:'',profile:null,uid:null,view:'overview',mode:'month',date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),search:'',data:{drivers:[],vehicles:[],driverCapacities:[],bookings:[],demands:[],results:[],attendance:[],sourceRows:[],users:[]},unsubscribe:[]};
const names={overview:'Áttekintés',planning:'Beosztás és foglalás',drivers:'Futárok',vehicles:'Autók',demands:'Kerületi csomagigény',results:'Futárteljesítmény',attendance:'Jelenlét és fotók',import:'Excel és adatok',admin:'Felhasználók'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('hu-HU');
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s:state.date;
const number=v=>Math.max(0,Math.floor(Number(v)||0));
const get=name=>state.data[name]||[];
const byId=(name,id)=>get(name).find(x=>x.id===id);
const canWrite=()=>['admin','editor'].includes(state.role);
const datestr=d=>new Date(d+'T12:00:00').toLocaleDateString('hu-HU',{year:'numeric',month:'long',day:'numeric'});
const status=(s)=>'<span class="badge '+(s==='confirmed'||s==='Accepted'?'green':s==='absent'||s==='failed'?'red':'amber')+'">'+esc(s||'—')+'</span>';
let auth,db,timer;
function toast(msg,bad=false){const el=$('toast');el.textContent=msg;el.style.background=bad?'#a43e3e':'#183e73';el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),4000);}
function showOnly(id){for(const n of ['setup','login','denied','shell'])$(n).hidden=n!==id;}
function options(items,txt,val='id'){return items.map(x=>'<option value="'+esc(x[val])+'">'+esc(txt(x))+'</option>').join('');}
function field(name,label,type='text',value='',extra=''){return '<label>'+label+'<input type="'+type+'" name="'+name+'" value="'+esc(value)+'" '+extra+' required></label>';}
function select(name,label,items,txt){return '<label>'+label+'<select name="'+name+'" required><option value="">Válassz…</option>'+options(items,txt)+'</select></label>';}
function frm(id,fields,text='Mentés'){return '<form data-form="'+id+'" class="form-grid">'+fields+'<button type="submit" class="primary">'+text+'</button></form>';}
function table(headers,items){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(items.length?items.join(''):'<tr><td colspan="'+headers.length+'" class="empty">Még nincs rögzített adat.</td></tr>')+'</tbody></table></div>';}
const td=(...items)=>'<tr>'+items.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
const cmd=(coll,id)=>canWrite()&&!['drivers','vehicles'].includes(coll)?'<button type="button" class="danger" data-del="'+coll+'" data-id="'+esc(id)+'">Törlés</button>':'';
const label=(text,cls='')=>'<span class="badge '+cls+'">'+esc(text)+'</span>';
function kpi(name,value,desc,cls=''){return '<div class="kpi '+cls+'"><div class="name">'+name+'</div><div class="number">'+fmt(value)+'</div><div class="desc">'+desc+'</div></div>';}
function section(h,body){return '<section class="panel"><h3>'+h+'</h3>'+body+'</section>';}
function datebar(){return '<div class="filterbar"><label>Nap <input type="date" id="datePick" value="'+state.date+'"></label></div>';}
function inRange(x,mode){const day=(x.date||x.eventDate||x.eventTime||'').slice(0,10);if(mode==='day')return day===state.date;if(mode==='month')return day.slice(0,7)===state.date.slice(0,7);const d=new Date(state.date+'T12:00:00');const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);return day>=monday.toISOString().slice(0,10)&&day<=sunday.toISOString().slice(0,10);}
const todayAtDepot=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const bookingAssessment=b=>assessBooking(b,get('drivers'),get('vehicles'),todayAtDepot());
const safeBookingCapacity=b=>effectiveCapacity(b,get('drivers'),get('vehicles'),todayAtDepot());
function totals(mode='day'){const ds=get('demands').filter(x=>inRange(x,mode));const bs=get('bookings').filter(x=>inRange(x,mode));const rs=get('results').filter(x=>inRange(x,mode));const sum=(l,f)=>l.reduce((a,x)=>a+number(x[f]),0);return {newCount:sum(ds,'newCount'),retryCount:sum(ds,'retryCount'),capacity:bs.reduce((n,b)=>n+safeBookingCapacity(b),0),blockedBookings:bs.filter(b=>!bookingAssessment(b).eligible).length,picked:sum(rs,'picked'),success:sum(rs,'success'),failed:sum(rs,'failed'),drivers:new Set(bs.filter(b=>bookingAssessment(b).eligible).map(b=>b.driverId)).size,hasDemand:ds.length>0,hasResults:rs.length>0};}
function overview(){const t=totals();const demand=t.newCount+t.retryCount;const gap=t.capacity-demand;const districts=[...new Set([...get('demands').filter(x=>inRange(x,'day')).map(x=>x.district),...get('bookings').filter(x=>inRange(x,'day')).map(x=>x.district)])].sort();
const region=districts.map(d=>{const a=get('demands').find(x=>x.date===state.date&&x.district===d);const b=get('bookings').filter(x=>x.date===state.date&&x.district===d);const cap=b.reduce((a,x)=>a+safeBookingCapacity(x),0);const count=a?number(a.newCount)+number(a.retryCount):null;return td(esc(d),count===null?'—':fmt(count),fmt(cap),count===null?'—':label((cap-count)>=0?'+'+fmt(cap-count):fmt(cap-count),(cap-count)<0?'red':'green'));});
const att=get('attendance').filter(x=>(x.eventTime||'').startsWith(state.date)).sort((a,b)=>(a.eventTime||'').localeCompare(b.eventTime||''));const latest=new Map();for(const a of att)latest.set(a.daCode||a.driverName,a.type);const ins=new Set([...latest].filter(([k,type])=>type==='Log In').map(([k])=>k));
const bars=districts.map(d=>{const a=get('demands').find(x=>x.date===state.date&&x.district===d);const count=a?number(a.newCount)+number(a.retryCount):0;const max=Math.max(...get('demands').filter(x=>x.date===state.date).map(x=>number(x.newCount)+number(x.retryCount)),1);return '<div class="chartline"><div class="label">'+esc(d)+'</div><div class="bar"><span style="width:'+(100*count/max)+'%"></span></div><div class="value">'+fmt(count)+'</div></div>';}).join('');
return datebar()+(t.blockedBookings?'<p class="notice">Figyelem: '+fmt(t.blockedBookings)+' nem elérhető foglalás jelenleg nincs beleszámítva a kapacitásba.</p>':'')+'<div class="grid kpis">'+kpi('Kiszállítandó csomag',demand,t.hasDemand?'Új + újrakézbesítendő':'Csomagigény még nincs')+kpi('Tervezett kapacitás',t.capacity,'Futárbeosztások alapján')+kpi('Kapacitáseltérés',t.hasDemand?gap:0,t.hasDemand?(gap<0?'Hiány a tervhez képest':'Többlet a tervhez képest'):'Nem számítható',t.hasDemand&&gap<0?'red':'good')+kpi('Bejelentkezett futárok',ins.size,'Attendance Log In események')+'</div><div class="grid twocol">'+section('Kerületi terv–kapacitás',table(['Kerület','Csomagigény','Kapacitás','Eltérés'],region))+section('Csomagigény kerületenként',bars||'<p class="muted">Töltsd fel a napi mennyiségeket.</p>')+'</div>'+section('Tényleges napi teljesítmény','<div class="grid kpis" style="margin:0">'+kpi('Felvett',t.picked,'Tényadat')+kpi('Sikeres',t.success,'Kézbesített', 'good')+kpi('Sikertelen',t.failed,'Kézbesítés', 'warn')+kpi('Sikeresség',t.picked?Math.round(100*t.success/t.picked):0,t.hasResults?'A felvett csomagok %-a':'Nincs tényadat')+'</div>');}
function drivers(){const list=get('drivers').filter(x=>(x.name+' '+x.daCode+' '+x.vendor).toLowerCase().includes(state.search));const edit=canWrite()?section('Depókapacitás megadása (külön az alapadatoktól)',frm('capacity',select('driverId','Futár',get('drivers'),x=>x.name+' · '+x.daCode)+field('capacity','Napi csomagkapacitás','number',0,'min="0" max="10000"'))):'';return '<p class="inline-note">A futártörzs közös adat: a Flotta kezeli. Itt csak a depóhoz szükséges kapacitás állítható.</p>'+edit+section('Futártörzs · '+list.length+' fő',table(['Futár','DA-kód','Vállalkozó','Napi kapacitás'],list.map(x=>td(esc(x.name),esc(x.daCode),esc(x.vendor),fmt(byId('driverCapacities',x.id)?.capacity??x.capacity??0)))));}
function vehicles(){const list=get('vehicles').filter(x=>(x.plate+' '+(x.model||'')).toLowerCase().includes(state.search));return '<p class="inline-note">Az autók és a műszaki státuszok közös törzsadatai a Flotta rendszerből származnak. A Kapacitáskezelő nem írja felül őket.</p>'+section('Autónyilvántartás · '+list.length+' db',table(['Rendszám','Típus','Állapot','Mai foglalás'],list.map(x=>{const b=get('bookings').find(a=>a.date===state.date&&a.vehicleId===x.id);return td(esc(x.plate),esc(x.model),status(x.status),b?esc(byId('drivers',b.driverId)?.name||'—'):'Szabad');})));}
function planning(){const ds=get('drivers').filter(eligibleDriver).slice().sort((a,b)=>a.name.localeCompare(b.name));const vs=get('vehicles').filter(x=>x.status==='Elérhető').slice().sort((a,b)=>a.plate.localeCompare(b.plate));const today=get('bookings').filter(x=>x.date===state.date).sort((a,b)=>(a.district||'').localeCompare(b.district||''));const taken=new Set(today.map(x=>x.vehicleId));const available=vs.filter(x=>!taken.has(x.id));const form=canWrite()?section('Futár és autó összerendelése',frm('booking',field('date','Munkanap','date',state.date)+select('driverId','Futár',ds,x=>x.name+' · '+x.daCode)+select('vehicleId','Szabad autó',available,x=>x.plate)+field('district','Kerület','text','','placeholder="pl. IX."')+'<label>Státusz<select name="status"><option value="planned">Tervezett</option><option value="confirmed">Visszaigazolt</option></select></label>','Foglalás mentése')+'<p class="small">Egy autó egy nap csak egy futárhoz foglalható. Ugyanaz a futár sem kaphat két autót ugyanarra a napra.</p>'):'';
return datebar()+attendanceVehicleSummary()+form+section('Napi foglalások · '+today.length,table(['Futár','Autó','Kerület','Kapacitás','Státusz','Elérhetőség',''],today.map(x=>td(esc(byId('drivers',x.driverId)?.name||'Ismeretlen'),esc(byId('vehicles',x.vehicleId)?.plate||'—'),esc(x.district),fmt(x.capacity),status(x.status),bookingAssessment(x).eligible?label('Rendben','green'):label('Nem elérhető','red'),canWrite()?'<button class="danger" data-cancel="'+esc(x.id)+'">Feloldás</button>':''))));}
function demands(){const rows=get('demands').filter(x=>x.date===state.date).sort((a,b)=>a.district.localeCompare(b.district));return datebar()+(canWrite()?section('Új csomagigény kerületenként',frm('demand',field('date','Nap','date',state.date)+field('district','Kerület','text','','placeholder="pl. XIII."')+field('newCount','Új csomagok','number',0,'min="0"')+field('retryCount','Újrakézbesítendő','number',0,'min="0"'))+'<p class="small">A sikertelen csomag csak akkor számít bele egy későbbi nap igényébe, ha újrakézbesítésre tervezed. Nincs automatikus dupla beszámítás.</p>'):'')+section('Napi csomagigény',table(['Kerület','Új','Újrakézbesítendő','Összesen',''],rows.map(x=>td(esc(x.district),fmt(x.newCount),fmt(x.retryCount),fmt(number(x.newCount)+number(x.retryCount)),cmd('demands',x.id)))));}
function results(){const rs=get('results');const dates=['day','week','month'];const summaries=dates.map(mode=>{const data=rs.filter(x=>inRange(x,mode));return {mode,label:{day:'Napi',week:'Heti',month:'Havi'}[mode],picked:data.reduce((s,x)=>s+number(x.picked),0),success:data.reduce((s,x)=>s+number(x.success),0),failed:data.reduce((s,x)=>s+number(x.failed),0)};});
const byDriver=new Map();for(const r of rs.filter(x=>inRange(x,state.mode))){const x=byDriver.get(r.driverId)||{picked:0,success:0,failed:0,days:new Set()};x.picked+=number(r.picked);x.success+=number(r.success);x.failed+=number(r.failed);x.days.add(r.date);byDriver.set(r.driverId,x);}
const list=[...byDriver].map(([id,r])=>td(esc(byId('drivers',id)?.name||id),r.days.size,fmt(r.picked),fmt(r.success),fmt(r.failed),(r.picked?Math.round(100*r.success/r.picked)+'%':'—'),(r.days.size?(r.picked/r.days.size).toFixed(1):'—')));
return datebar()+'<div class="filterbar"><label>Futárátlag időszaka <select id="modePick"><option value="day" '+(state.mode==='day'?'selected':'')+'>Napi</option><option value="week" '+(state.mode==='week'?'selected':'')+'>Heti</option><option value="month" '+(state.mode==='month'?'selected':'')+'>Havi</option></select></label></div><div class="grid kpis">'+summaries.map(r=>kpi(r.label+' sikeresség',r.picked?Math.round(r.success*100/r.picked):0,'A felvett csomagok %-a')).join('')+kpi('Havi felvett csomag',summaries[2].picked,'Aktuális hónap')+'</div>'+(canWrite()?section('Tényleges futáreredmény',frm('result',field('date','Nap','date',state.date)+select('driverId','Futár',get('drivers'),x=>x.name+' · '+x.daCode)+field('district','Kerület','text','','placeholder="pl. IX."')+field('picked','Felvett csomag','number',0,'min="0"')+field('success','Sikeres','number',0,'min="0"')+field('failed','Sikertelen','number',0,'min="0"'))):'')+section({day:'Napi',week:'Heti',month:'Havi'}[state.mode]+' futárátlagok',table(['Futár','Munkanap','Felvett','Sikeres','Sikertelen','Sikeresség','Felvett / munkanap'],list))+section('Napi rögzített eredmények',table(['Futár','Kerület','Felvett','Sikeres','Sikertelen','Lezáratlan',''],rs.filter(x=>x.date===state.date).map(x=>td(esc(byId('drivers',x.driverId)?.name||'—'),esc(x.district),fmt(x.picked),fmt(x.success),fmt(x.failed),fmt(number(x.picked)-number(x.success)-number(x.failed)),cmd('results',x.id)))));}
function photo(url,name){if(!/^https:\/\/drive\.google\.com\//.test(url||''))return '';const match=String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);const preview=match?'https://drive.google.com/thumbnail?id='+encodeURIComponent(match[1])+'&sz=w240':'';return '<a class="photo" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+(preview?'<img alt="'+esc(name)+' – védett Google Drive-fotó" loading="lazy" referrerpolicy="no-referrer" src="'+esc(preview)+'">':'')+'<span>'+esc(name)+'</span></a>';}
function attendanceVehicleSummary(){
  const data=deriveAttendanceHandovers({
    events:get('attendance'),drivers:get('drivers'),vehicles:get('vehicles'),
    manualBookings:get('bookings')
  });
  const day=data.handovers.filter(x=>x.pickedUpAt.startsWith(state.date));
  const knownDa=new Set(day.map(x=>x.driverId));
  const actualCapacity=get('drivers').filter(x=>knownDa.has(x.id)).reduce((acc,driver)=>
    acc+number(byId('driverCapacities',driver.id)?.capacity??driver.capacity??0),0);
  const body=table(['Futár','Rendszám','Felvétel','Visszaadás','Állapot'],
    day.map(x=>td(esc(byId('drivers',x.driverId)?.name||x.driverId),esc(x.vehicleId),
      esc(x.pickedUpAt.replace('T',' ')),
      esc(x.returnedAt?.replace('T',' ')||'—'),
      esc(x.status==='returned'?'Visszaadva':x.status==='return_review'?'Ellenőrzésre vár':'Futárnál'))));
  const warning=data.alerts.filter(x=>get('attendance').some(a=>a.id===x.eventId&&(a.eventTime||'').startsWith(state.date)));
  return section('Attendance-alapú autóhasználat · '+day.length+' eseménysor',
    '<p class="inline-note">Automatikus, csak olvasható előnézet a szinkronizált Attendance alapján. A tervezett foglalásoktól elkülönül; a kapacitást nem adjuk kétszer össze. Mesterséges tesztelésig ez nem helyettesíti a tényleges kiadás/visszavétel tranzakcióját.</p>'
    +'<p><strong>Mai Attendance-alapú kapacitás: '+fmt(actualCapacity)+'</strong> csomag · '
    +fmt(knownDa.size)+' külön futár</p>'
    +(warning.length?'<p class="notice">'+fmt(warning.length)+' eseménynél autóhiány, ütközés vagy ellenőrizetlen visszaadás miatt beavatkozás lehet szükséges.</p>':'')
    +body);
}
function attendance(){const seen=new Map();for(const a of get('attendance').filter(x=>(x.eventTime||'').startsWith(state.date))){const key=[a.eventTime,a.daCode,a.type].join('|');const prev=seen.get(key);if(!prev||a.source==='google_sheet')seen.set(key,a);}const r=[...seen.values()].sort((a,b)=>(b.eventTime||'').localeCompare(a.eventTime||''));return datebar()+attendanceVehicleSummary()+section('Jelenléti események · '+r.length+' db','<p class="inline-note">A forrás az iMile Driver Attendance – Log In Out. A képek megnyitásához a Google Drive-on külön jogosultság is szükséges. A valós idejű Google-szinkront a belső Google Apps Script összekötő biztosíthatja.</p>'+table(['Időpont','Futár / DA','Esemény','Kiválasztott autó','Vállalkozó','Autófotók'],r.map(x=>td(esc(x.timeKnown===false?'Idő nem szerepel':(x.eventTime||'').replace('T',' ')),esc(x.driverName)+'<div class="small">'+esc(x.daCode)+'</div>',status(x.type),esc(x.vehicleId||'—'),esc(x.vendor),'<div class="photo-grid">'+photo(x.photoFront,'Elölről')+photo(x.photoLeft,'Bal oldal')+photo(x.photoRight,'Jobb oldal')+photo(x.photoBack,'Hátulról')+'</div>'))));}
function imports(){const list=get('sourceRows').filter(x=>!state.search||JSON.stringify(x).toLowerCase().includes(state.search));return (canWrite()?section('Táblázat betöltése','<form id="importForm" class="form-grid"><label>Adattípus<select name="type"><option value="demand">Kerületi csomagigény</option><option value="result">Futáreredmény</option><option value="attendance">Attendance – Mobile Attendance</option><option value="generic">Egyéb operatív adattábla</option></select></label><label>CSV vagy Excel (.xlsx, .xls)<input name="file" type="file" accept=".csv,.xlsx,.xls" required></label><button class="primary" type="submit">Feldolgozás és feltöltés</button></form><p class="small">A fájlt a böngésző dolgozza fel; a kiválasztott sorokat a központi adatbázisba mentjük. Ismételt import nem duplázza az azonos azonosítójú rekordokat. Hibás vagy ismétlődő sor esetén az import nem indul el.</p><div id="importFeedback" role="alert" aria-live="polite" class="small"></div>'):'')+section('Operatív adatbázis',table(['Forrás','Adatok előnézete','Betöltve'],list.slice(0,100).map(x=>td(esc(x.source||'Egyéb'),esc((x.content||'').slice(0,180)),esc(x.importedAt||'')))));}
function admin(){if(state.role!=='admin')return '';const legacyCompare=section('Közös törzsadatok ellenőrzése – csak olvasás','<p class="inline-note">Töltsd be a jelenlegi Flotta Nyilvántartó JSON-mentését. A fájl csak a böngésződben kerül feldolgozásra; az összehasonlítás nem módosít sem a Firebase-ben, sem a Flottában adatot.</p><form id="masterCompareForm" class="form-grid"><label>Flotta JSON-biztonsági mentés<input type="file" name="fleetBackup" accept=".json,application/json" required></label><button class="secondary" type="submit">Összehasonlítás</button></form><div id="masterCompareOutput"></div>');return legacyCompare+section('Belső felhasználók','<p class="inline-note">Új e-mail/jelszó fiókot a Firebase Console → Authentication → Users részen hozhatsz létre. Az ott kapott UID-hez itt tudsz szerepkört rendelni. Így külső személy nem regisztrálhat önállóan.</p>'+frm('user',field('uid','Firebase-felhasználó UID-ja')+field('name','Név')+'<label>Szerepkör<select name="role"><option value="viewer">Megtekintő</option><option value="editor">Szerkesztő</option><option value="admin">Adminisztrátor</option></select></label>','Jogosultság mentése'))+section('Jogosultságok',table(['Név','UID','Szerepkör','Aktív'],get('users').map(x=>td(esc(x.name||'—'),esc(x.id),esc(x.role),x.active===true?'Igen':'Nem'))));}
function render(){if($('shell').hidden)return;$('pageTitle').textContent=names[state.view];$('todayLabel').textContent=datestr(state.date);$('adminNav').hidden=state.role!=='admin';document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===state.view));const c={overview,planning,drivers,vehicles,demands,results,attendance,import:imports,admin}[state.view];const tools=state.view==='overview'?'':'<div class="actions"><input id="tableSearch" type="search" aria-label="Keresés a táblázatban" placeholder="Keresés a listában…" style="width:220px;max-width:100%"><button id="exportCsv" class="secondary" type="button">CSV export</button></div>';$('content').innerHTML='<div class="section-head"><h2>'+esc(names[state.view])+'</h2>'+tools+'</div>'+(c?c():'');}
function listen(){for(const un of state.unsubscribe)un();state.unsubscribe=[];for(const name of ['drivers','vehicles','driverCapacities','bookings','demands','results','attendance','sourceRows',...(state.role==='admin'?['users']:[])]){const unsub=onSnapshot(collection(db,name),snap=>{state.data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));$('liveIndicator').textContent='● Élő kapcsolat';$('liveIndicator').classList.remove('off');$('dataStamp').textContent='Utolsó szinkron: '+new Date().toLocaleTimeString('hu-HU');render();},err=>{console.error(name,err);$('liveIndicator').textContent='● Adatkapcsolati hiba';$('liveIndicator').classList.add('off');toast('Nem érhető el a(z) '+name+' adatbázis. Ellenőrizd a jogosultságokat.',true);});state.unsubscribe.push(unsub);}}
async function saveForm(type,values){if(!canWrite()&&type!=='user')throw Error('Csak belső szerkesztő módosíthat.');let col,id,obj;
if(type==='driver'){throw Error('A futártörzs a Flotta kezelésében van. A közös rekordokat a Kapacitáskezelőben nem módosítjuk.');col='drivers';id=(values.daCode||'').trim().toUpperCase();if(!id)throw Error('Hiányzó DA-kód.');obj={name:values.name.trim(),daCode:id,vendor:values.vendor.trim(),capacity:number(values.capacity),active:true};}
else if(type==='vehicle'){throw Error('Az autótörzs a Flotta kezelésében van. A közös rekordokat a Kapacitáskezelőben nem módosítjuk.');col='vehicles';id=values.plate.replace(/[\s-]/g,'').toUpperCase();if(!id)throw Error('Hiányzó rendszám.');obj={plate:id,model:values.model.trim(),status:values.status};}
else if(type==='capacity'){col='driverCapacities';id=values.driverId;if(!byId('drivers',id))throw Error('A futár nem található a közös törzsben.');obj={capacity:number(values.capacity)};if(obj.capacity>10000)throw Error('Túl nagy kapacitásérték.');}
else if(type==='demand'){col='demands';const date=iso(values.date),district=values.district.trim().toUpperCase().replaceAll('/','-');id=date+'__'+district;obj={date,district,newCount:number(values.newCount),retryCount:number(values.retryCount)};}
else if(type==='result'){col='results';const picked=number(values.picked),success=number(values.success),failed=number(values.failed);if(success+failed>picked)throw Error('A sikeres és sikertelen összeg nem lehet több a felvett csomagszámnál.');const date=iso(values.date),district=values.district.trim().toUpperCase().replaceAll('/','-');id=date+'__'+values.driverId+'__'+district;obj={date,driverId:values.driverId,district,picked,success,failed};}
else if(type==='user'){if(state.role!=='admin')throw Error('Csak adminisztrátor.');col='users';id=values.uid.trim();if(!/^[A-Za-z0-9]{15,128}$/.test(id))throw Error('Érvénytelen Firebase UID.');obj={name:values.name.trim(),role:values.role,active:true};}
else if(type==='booking'){const date=iso(values.date),driverId=values.driverId,vehicleId=values.vehicleId;const driver=byId('drivers',driverId),vehicle=byId('vehicles',vehicleId);if(!eligibleDriver(driver)||!vehicle||vehicle.status!=='Elérhető')throw Error('A futár inaktív vagy az autó nem elérhető.');const bookingId=date+'__'+vehicleId;const driverKey=date+'__'+driverId;const bRef=doc(db,'bookings',bookingId),dRef=doc(db,'driverClaims',driverKey);await runTransaction(db,async tx=>{const [oldBook,oldDriver,liveDriver,liveVehicle,liveCapacity]=await Promise.all([tx.get(bRef),tx.get(dRef),tx.get(doc(db,'drivers',driverId)),tx.get(doc(db,'vehicles',vehicleId)),tx.get(doc(db,'driverCapacities',driverId))]);if(oldBook.exists()||oldDriver.exists())throw Error('Ezen a napon az autó vagy a futár már foglalt.');if(!liveDriver.exists()||liveDriver.data().active!==true||!liveVehicle.exists()||liveVehicle.data().status!=='Elérhető')throw Error('A futár vagy autó állapota megváltozott. Frissítsd a beosztást.');tx.set(bRef,{date,vehicleId,driverId,district:values.district.trim().toUpperCase(),status:values.status,capacity:number(liveCapacity.exists()?liveCapacity.data().capacity:(liveDriver.data().capacity??0))});tx.set(dRef,{date,driverId,bookingId});});toast('Foglalás mentve.');return;}
else throw Error('Ismeretlen művelet.');
await setDoc(doc(db,col,id),obj,{merge:true});toast('Mentés sikeres.');}
async function removeRow(col,id){if(!canWrite())throw Error('Nincs jogosultság.');if(!confirm('Biztosan törlöd a kiválasztott rekordot?'))return;if(col==='bookings')return;await deleteDoc(doc(db,col,id));toast('Törölve.');}
async function cancelBooking(id){const ref=doc(db,'bookings',id);await runTransaction(db,async tx=>{const booking=await tx.get(ref);if(!booking.exists())throw Error('A foglalás már nem található.');const x=booking.data();tx.delete(ref);tx.delete(doc(db,'driverClaims',x.date+'__'+x.driverId));});toast('Foglalás feloldva.');}
const lookup=(obj,...names)=>{const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();const entries=Object.entries(obj);for(const n of names){const f=entries.find(([k])=>normalize(k)===normalize(n));if(f)return f[1];}return '';};
function keyed(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return 'r'+(h>>>0).toString(36)+'_'+s.length;}
async function parseFile(file,type){if(!window.XLSX)throw Error('Az Excel-feldolgozó nem töltődött be. Ellenőrizd az internetkapcsolatot.');const buffer=await file.arrayBuffer();const csv=/\.csv$/i.test(file.name);const wb=csv?XLSX.read(decodeCsv(buffer),{type:'string',raw:true,cellDates:false}):XLSX.read(buffer,{type:'array',cellDates:false});const target=type==='attendance'&&(wb.SheetNames.find(x=>x.toLowerCase().includes('mobile attendance')))||wb.SheetNames[0];const json=XLSX.utils.sheet_to_json(wb.Sheets[target],{defval:'',raw:false});if(json.length>5000)throw Error('Legfeljebb 5000 sor tölthető fel egyszerre.');return {rows:json,sheet:target};}
function requireValue(value,label){
 const v=String(value??'').trim();
 if(!v)throw Error('Hiányzik: '+label);
 if(v.length>100)throw Error('Túl hosszú mező: '+label);
 return v;
}
function rowToRecord(row,type,file){
 if(type==='demand'){
  const date=parseDay(lookup(row,'date','dátum','nap','work date'));
  const district=requireValue(lookup(row,'district','kerület','area','zipcode'),'kerület').toUpperCase().replaceAll('/','-');
  if(!date)throw Error('Hiányzó vagy hibás dátum.');
  const newCount=readNonNegativeCount(lookup(row,'new','newcount','új csomag','új','new packages'),'Új csomag');
  const retryCount=readNonNegativeCount(lookup(row,'retry','retrycount','visszatérő','újrakézbesítendő','failed returns'),'Újrakézbesítendő');
  return {col:'demands',id:date+'__'+district,data:{date,district,newCount,retryCount}};
 }
 if(type==='result'){
  const date=parseDay(lookup(row,'date','dátum','nap'));
  const code=requireValue(lookup(row,'da code','daCode','futárkód','driver id'),'DA-kód').toUpperCase();
  const district=requireValue(lookup(row,'district','kerület','area'),'kerület').toUpperCase().replaceAll('/','-');
  if(!date)throw Error('Hiányzó vagy hibás dátum.');
  if(code.includes('/'))throw Error('Érvénytelen DA-kód.');
  const picked=readNonNegativeCount(lookup(row,'picked','felvett','felvett csomag'),'Felvett');
  const success=readNonNegativeCount(lookup(row,'success','sikeres'),'Sikeres');
  const failed=readNonNegativeCount(lookup(row,'failed','sikertelen'),'Sikertelen');
  if(success+failed>picked)throw Error('A sikeres és sikertelen összeg nagyobb a felvett csomagszámnál.');
  return {col:'results',id:date+'__'+code+'__'+district,data:{date,driverId:code,district,picked,success,failed}};
 }
 if(type==='attendance'){
  const time=parseTime(lookup(row,'Timestamp','dátum','időpont'));
  const daCode=requireValue(lookup(row,'DA Code','daCode'),'DA-kód').toUpperCase();
  const event=requireValue(lookup(row,'Attendance Type','type','event'),'Jelenlét típusa');
  if(!time.date||!time.timeKnown)throw Error('Érvénytelen vagy hiányzó jelenléti időpont.');
  if(daCode.includes('/'))throw Error('Érvénytelen DA-kód.');
  if(!['Log In','Log Out'].includes(event))throw Error('Ismeretlen jelenlét típus.');
  const vehicleValue=String(lookup(row,'Vehicle Plate','Vehicle ID','License Plate','Rendszám','Autó rendszáma')||'');
  const vehicleId=vehicleValue.trim().toUpperCase().replace(/[\s-]+/g,'');
  if(vehicleId && !/^[A-Z0-9]{4,12}$/.test(vehicleId))throw Error('Érvénytelen Attendance rendszám.');
  const record={
   eventTime:time.eventTime,eventDate:time.date,timeKnown:time.timeKnown,daCode,
   driverName:String(lookup(row,'Driver Name','Futár')),
   vendor:String(lookup(row,'Vendor','Vállalkozó')),type:event,status:String(lookup(row,'Status')),
   photoFront:String(lookup(row,'Car Photo - Front')),photoLeft:String(lookup(row,'Car Photo - Left Side')),
   photoRight:String(lookup(row,'Car Photo - Right Side')),photoBack:String(lookup(row,'Car Photo - Back')),
   source:'xlsx:'+file
  };
  if(vehicleId)record.vehicleId=vehicleId;
  return {col:'attendance',id:keyed(time.eventTime+'|'+daCode+'|'+event+'|'+record.photoFront),data:record};
 }
 if(type==='generic'){
  const data=JSON.stringify(row);
  if(!data||data.length>18000)throw Error('Az operatív adatsor meghaladja a 18 000 karakteres határt.');
  return {col:'sourceRows',id:keyed(file+'|'+data),data:{source:file,content:data,importedAt:new Date().toISOString().slice(0,19)}};
 }
 throw Error('Ismeretlen adattípus.');
}
async function importFile(form){
 if(!canWrite())throw Error('Nincs jogosultság az adatimporthoz.');
 const file=form.elements.file.files[0],type=form.elements.type.value;
 if(!file)throw Error('Válassz fájlt.');
 const feedback=document.getElementById('importFeedback');
 if(feedback)feedback.textContent='Adatok ellenőrzése…';
 const parsed=await parseFile(file,type);
 const plan=buildImportPlan(parsed.rows,row=>rowToRecord(row,type,file.name));
 if(!plan.canCommit){
  const msg=formatImportErrors(plan);
  if(feedback)feedback.textContent=msg;
  throw Error(msg);
 }
 const changed=plan.records.filter(x=>{
  const old=byId(x.col,x.id);
  return old&&Object.keys(x.data).some(k=>JSON.stringify(old[k])!==JSON.stringify(x.data[k]));
 }).length;
 const question=plan.total+' sor ellenőrizve a(z) '+parsed.sheet+' munkalapon.\n'
  +'Hibás vagy duplikált sor: 0.\n'
  +'Már létező rekord megváltoztatása: '+changed+'.\n\n'
  +'Folytatod az adatbázisba mentéssel?';
 if(!confirm(question)){if(feedback)feedback.textContent='A feltöltés megszakítva, nem változott adat.';return;}
 let completed=0;
 for(let i=0;i<plan.records.length;i+=300){
  const batch=writeBatch(db);
  const part=plan.records.slice(i,i+300);
  for(const x of part)batch.set(doc(db,x.col,x.id),x.data,{merge:true});
  try{await batch.commit();completed+=part.length;}
  catch(error){
   const msg='Az adatimport részben sikerült: '+completed+' / '+plan.total+' rekord mentve. A mentett adatokat ne töltsd újra ellenőrzés nélkül. '+String(error?.message||error);
   if(feedback)feedback.textContent=msg;
   throw Error(msg);
  }
 }
 if(feedback)feedback.textContent=completed+' sor sikeresen mentve.';
 toast(completed+' sor feldolgozva.');
 form.reset();
}
function navigate(view){if(!names[view])return;state.view=view;state.search='';document.querySelector('.sidebar').classList.remove('open');render();}
document.addEventListener('click',async e=>{const n=e.target.closest('[data-view]');if(n){navigate(n.dataset.view);return;}const del=e.target.closest('[data-del]'),cancel=e.target.closest('[data-cancel]');try{if(del)await removeRow(del.dataset.del,del.dataset.id);if(cancel)await cancelBooking(cancel.dataset.cancel);}catch(ex){toast(ex.message,true);}});
document.addEventListener('change',e=>{if(e.target.id==='datePick'){state.date=iso(e.target.value);render();}if(e.target.id==='modePick'){state.mode=e.target.value;render();}});
document.addEventListener('input',e=>{if(e.target.id==='tableSearch'){const q=e.target.value.trim().toLowerCase();document.querySelectorAll('#content tbody tr').forEach(row=>{row.hidden=q!==''&&!row.textContent.toLowerCase().includes(q);});}});
function csvExport(){
 const map={planning:'bookings',drivers:'drivers',vehicles:'vehicles',demands:'demands',results:'results',attendance:'attendance',import:'sourceRows',admin:'users'};
 let records=get(map[state.view]||'drivers');
 if(['planning','demands','attendance'].includes(state.view))records=records.filter(x=>(x.date||x.eventTime||'').startsWith(state.date));
 if(state.view==='results')records=records.filter(x=>inRange(x,'month'));
 if(!records.length){toast('Nincs exportálható adat.');return;}
 const headers=[...new Set(records.flatMap(x=>Object.keys(x).filter(k=>!k.startsWith('_'))))];
 const safe=v=>{let s=typeof v==='object'?JSON.stringify(v):String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const csv='\ufeff'+headers.map(safe).join(';')+'\r\n'+records.map(r=>headers.map(h=>safe(r[h])).join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='depo_'+state.view+'_'+state.date+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',e=>{if(e.target.id==='exportCsv')csvExport();});
async function previewMasterComparison(form){
 if(state.role!=='admin')throw Error('Csak az adminisztrátor ellenőrizheti a közös törzsadatokat.');
 const file=form.elements.fleetBackup.files[0];
 if(!file)throw Error('Válassz JSON-mentést.');
 if(file.size>15*1024*1024)throw Error('A fájl legfeljebb 15 MB lehet.');
 const input=JSON.parse(await file.text());
 const plan=planSharedMasterMigration(input,{drivers:get('drivers'),vehicles:get('vehicles')});
 const n=plan.counts;
 const out=document.getElementById('masterCompareOutput');
 if(!out)return;
 const totals=[['Futárok a flottában',n.fleetDrivers],['Autók a flottában',n.fleetVehicles],['Új futárrekordok',n.newDrivers],['Új autórekordok',n.newVehicles],['Megegyező futárok',n.matchedDrivers],['Megegyező autók',n.matchedVehicles],['Ütköző futárok',n.conflictingDrivers],['Ütköző autók',n.conflictingVehicles],['Blokkoló hibák',n.blockers]];
 out.innerHTML='<div class="grid kpis" style="margin-top:16px">'+totals.map(([name,value])=>kpi(esc(name),value, name.includes('Blokkoló')?'Élesítés előtt javítani kell':'Ellenőrzési adat',value>0&&name.includes('Blokkoló')?'red':'')).join('')+'</div><p class="inline-note">'+(plan.readyForReview?'A törzsadatok egyeztetésre előkészítve, de az automatikus import továbbra is le van tiltva.':'A feltárt eltérések rendezéséig az adatátvétel nem engedélyezhető.')+'</p>'+section('Ellenőrzendő eltérések',table(['Típus','Terület','Azonosító','Érintett mezők'],plan.problems.slice(0,100).map(x=>td(esc(x.type),esc(x.target||x.kind),esc(x.id||x.fleetId||'—'),esc((x.fields||[]).join(', '))))));
 toast('A flottaadatok összehasonlítása elkészült; nincs adatírás.');
}
document.addEventListener('submit',async e=>{if(e.target.matches('[data-form]')){e.preventDefault();const f=e.target,values=Object.fromEntries(new FormData(f).entries());const b=f.querySelector('button[type=submit]');b.disabled=true;try{await saveForm(f.dataset.form,values);f.reset();render();}catch(ex){toast(ex.message,true);}finally{b.disabled=false;}}else if(e.target.id==='importForm'){e.preventDefault();try{await importFile(e.target);}catch(ex){toast(ex.message,true);}}else if(e.target.id==='masterCompareForm'){e.preventDefault();try{await previewMasterComparison(e.target);}catch(ex){toast('Hiba az összehasonlításban: '+ex.message,true);}}});
$('menuToggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
if(!firebaseConfig.apiKey||!firebaseConfig.projectId||!firebaseConfig.appId){showOnly('setup');}
else {
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';const f=new FormData(e.target);try{await signInWithEmailAndPassword(auth,String(f.get('email')).trim(),String(f.get('password')));}catch(ex){$('loginError').textContent='Hibás belépési adatok, letiltott fiók vagy nem elérhető szolgáltatás.';}});
 $('logout').addEventListener('click',()=>signOut(auth));
 $('signoutDenied').addEventListener('click',()=>signOut(auth));
 onAuthStateChanged(auth,async user=>{for(const un of state.unsubscribe)un();state.unsubscribe=[];if(!user){state.profile=null;state.uid=null;window.location.replace('../staging/imile-management/index.html');return;}try{const r=await getDoc(doc(db,'users',user.uid));if(!r.exists()||r.data().active!==true||!['admin','editor','viewer'].includes(r.data().role)){showOnly('denied');return;}state.uid=user.uid;state.profile=r.data();state.role=r.data().role;$('userSummary').textContent=(state.profile.name||user.email)+' · '+state.role;showOnly('shell');listen();}catch(ex){showOnly('denied');toast('Nem sikerült ellenőrizni a belső jogosultságot.',true);}});
}
