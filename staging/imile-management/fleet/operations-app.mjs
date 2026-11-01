import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {allowedProfile} from '../session-policy.mjs';
import {schemas,expiryWarnings} from './operations-data.mjs';
import {saveFleetRecord,moveFleetVehicle} from './operations-store.mjs';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
let db,auth,uid,role,kind='vehicle',baseline=null,busy=false,unsubs=[],generation=0,liveVerified=false;
const data={drivers:[],vehicles:[],fleetRecords:[],fleetAssignments:[],fleetMovements:[]};
const writable=()=>liveVerified&&['admin','editor'].includes(role),recordWritable=()=>writable()&&(kind!=='service'||role==='admin');
function setStatus(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function clear(){for(const unsub of unsubs)unsub();unsubs=[];liveVerified=false;uid=null;role=null;baseline=null;for(const key of Object.keys(data))data[key]=[];$('recordForm').replaceChildren();$('recordRows').replaceChildren();$('movementRows').replaceChildren();$('assignments').replaceChildren();$('warnings').replaceChildren();$('workspace').hidden=true;}
function options(select,rows,key,label){
 const previous=select.value;select.replaceChildren(new Option('Válassz…',''));
 for(const row of rows)select.add(new Option(label(row),row[key]));
 select.value=previous;
}
function buildForm(){
 const form=$('recordForm');form.replaceChildren();
 $('sectionTitle').textContent=schemas[kind].label;
 $('permission').textContent=recordWritable()?
  (baseline&&kind==='service'?'Korábbi szerviz adatainak javítása: az eredeti autó, dátum és akkori állapot nem módosítható. A mai járműállapothoz új szervizbejegyzést készíts.':
   'Mentés engedélyezett. Az azonosító nem módosítható; az időközben megváltozott rekord mentése leáll.'):
  'Olvasási jogosultság. Szervizállapot módosításához admin szükséges.';
 for(const field of schemas[kind].fields){
  const label=el('label',field.label),control=el(['vehicle','driver','boolean','status'].includes(field.type)?'select':'input');
  control.name=field.key;control.required=field.required;control.disabled=!recordWritable();
  if(['vehicle','driver'].includes(field.type)){
   options(control,data[field.type==='vehicle'?'vehicles':'drivers'],'id',x=>field.type==='vehicle'?x.plate:x.daCode+' · '+x.name);
  }else if(field.type==='boolean'){control.add(new Option('Igen','true'));control.add(new Option('Nem','false'));if(field.key==='tyresChanged')control.value='false';}
  else if(field.type==='status')for(const value of ['Elérhető','Szerviz','Leállított'])control.add(new Option(value,value));
  else{control.type=field.type==='integer'?'number':field.type==='date'?'date':'text';control.maxLength=field.max;if(field.type==='integer'){control.min='0';control.max='100000000';control.step='1';control.value='0';}}
  if(baseline)control.value=String(baseline.data[field.key]);
  if(baseline&&field.key===schemas[kind].key){if(control.tagName==='SELECT')control.disabled=true;else control.readOnly=true;}
  if(baseline&&kind==='service'&&['vehicleId','date','status'].includes(field.key))control.disabled=true;
  label.append(control);form.append(label);
 }
 const button=el('button',baseline?'Módosítás mentése':'Új rekord mentése');button.type='submit';button.disabled=!recordWritable()||busy;form.append(button);
 for(const btn of $('tabs').children)btn.setAttribute('aria-pressed',String(btn.dataset.kind===kind));
}
function render(){
 const search=$('search').value.trim().toLocaleLowerCase('hu');
 const rows=data.fleetRecords.filter(x=>x.kind===kind&&JSON.stringify(x.data).toLocaleLowerCase('hu').includes(search)).sort((a,b)=>a.id.localeCompare(b.id));
 const fields=schemas[kind].fields,head=el('tr');for(const f of fields)head.append(el('th',f.label));head.append(el('th','Kezelés'));$('recordHead').replaceChildren(head);$('recordRows').replaceChildren();
 for(const row of rows){const tr=el('tr');for(const f of fields)tr.append(el('td',row.data[f.key]===true?'Igen':row.data[f.key]===false?'Nem':row.data[f.key]));
  const td=el('td'),edit=el('button','Szerkesztés');edit.disabled=!recordWritable();edit.setAttribute('aria-label','Szerkesztés: '+row.id);edit.onclick=()=>{baseline=row;buildForm();$('recordForm').scrollIntoView({block:'center'});};td.append(edit);tr.append(td);$('recordRows').append(tr);
 }
 if(!rows.length){const row=el('tr'),cell=el('td','Nincs mentett adat.');cell.colSpan=fields.length+1;row.append(cell);$('recordRows').append(row);}
 $('assignments').replaceChildren();
 for(const a of data.fleetAssignments.filter(x=>x.active===true)){
  const line=el('div');line.className='actions';line.append(el('span',a.vehicleId+' → '+a.driverId+' · '+a.mileage+' km'));
  if(writable()){
   const button=el('button','Visszavétel előkészítése');button.type='button';
   button.onclick=()=>{
    const form=$('movementForm');
    form.elements.vehicleId.value=a.vehicleId;
    form.elements.driverId.value=a.driverId;
    form.elements.action.value='return';
    const issued=data.fleetMovements.find(m=>m.id===a.operationId);
    form.elements.date.value=issued?.date>today()?issued.date:today();
    form.elements.mileage.value=String(a.mileage);
    $('movementMessage').textContent='Visszavétel előkészítve: '+a.vehicleId+' / '+a.driverId+'. Ellenőrizd a valós km-órát, majd mentsd a műveletet.';
    form.scrollIntoView({block:'center'});
   };
   line.append(button);
  }
  $('assignments').append(line);
}
 if(!data.fleetAssignments.some(x=>x.active))$('assignments').append(el('p','Nincs aktív járműkiadás.'));
 $('movementRows').replaceChildren();for(const m of data.fleetMovements.slice().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))){const tr=el('tr');for(const v of [m.date,m.vehicleId,m.driverId,m.action==='checkout'?'Kiadás':'Visszavétel',m.mileage,m.note])tr.append(el('td',v));$('movementRows').append(tr);}
 $('warnings').replaceChildren();for(const item of expiryWarnings(data.fleetRecords,today())){const f=schemas[data.fleetRecords.find(x=>x.id===item.id).kind].fields.find(x=>x.key===item.field);const p=el('p',item.id+' · '+f.label+': '+item.date+' · '+(item.days<0?'Lejárt '+(-item.days)+' napja':item.days+' nap múlva'));p.className='warning';$('warnings').append(p);}
 $('summary').textContent=data.vehicles.length+' autó · '+data.drivers.length+' futár · '+data.fleetMovements.length+' kiadási/visszavételi esemény · '+data.fleetRecords.filter(x=>x.kind==='service').length+' szervizrekord';
}
function refreshChoices(){for(const form of [$('movementForm'),$('recordForm')])for(const [field,col]of [['vehicleId','vehicles'],['driverId','drivers']]){const select=form.elements[field];if(select?.tagName==='SELECT'){options(select,data[col],'id',x=>field==='vehicleId'?x.plate:x.daCode+' · '+x.name);if(form.id==='recordForm'&&baseline)select.value=baseline.data[field];}}}
for(const [key,schema]of Object.entries(schemas)){const btn=el('button',schema.label);btn.dataset.kind=key;btn.onclick=()=>{kind=key;baseline=null;buildForm();render();};$('tabs').append(btn);}
$('newRecord').onclick=()=>{baseline=null;buildForm();};$('search').oninput=render;$('print').onclick=()=>window.print();
$('export').onclick=()=>{if(!uid)return;const blob=new Blob([JSON.stringify({project:'imile-management-staging',exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='imile-staging-fleet-'+today()+'.json';a.click();URL.revokeObjectURL(url);};
$('recordForm').onsubmit=async event=>{
 event.preventDefault();if(!recordWritable()||busy)return;const input=Object.fromEntries(new FormData(event.currentTarget));
 if(baseline){
  input[schemas[kind].key]=baseline.data[schemas[kind].key];
  if(kind==='service')for(const field of ['vehicleId','date','status'])input[field]=baseline.data[field];
 }
 busy=true;const btn=event.currentTarget.querySelector('button[type=submit]');btn.disabled=true;$('saveMessage').textContent='Mentés…';
 try{const id=await saveFleetRecord({db,kind,input,baseline,uid,doc,runTransaction,serverTimestamp});$('saveMessage').textContent='Mentve: '+id;baseline=null;buildForm();}
 catch(error){$('saveMessage').textContent='Nem sikerült menteni: '+error.message;}finally{busy=false;btn.disabled=!recordWritable();const current=$('recordForm').querySelector('button[type=submit]');if(current)current.disabled=!recordWritable();}
};
$('movementForm').elements.date.value=today();
$('movementForm').onsubmit=async event=>{
 event.preventDefault();if(!writable()||busy)return;busy=true;const btn=event.currentTarget.querySelector('button');btn.disabled=true;
 try{await moveFleetVehicle({db,input:Object.fromEntries(new FormData(event.currentTarget)),uid,doc,collection,runTransaction,serverTimestamp});$('movementMessage').textContent='A művelet mentve; az autó és a futár kapcsolata frissült.';}
 catch(error){$('movementMessage').textContent='Nem sikerült menteni: '+error.message;}finally{busy=false;btn.disabled=!writable();}
};
if(firebaseConfig.projectId!=='imile-management-staging')setStatus('Nem staging projekt: a működés tiltva.',true);
else{
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 $('logout').onclick=async()=>{await signOut(auth);window.location.replace('../index.html');};
 onAuthStateChanged(auth,async user=>{
  const rev=++generation;clear();if(!user){window.location.replace('../index.html');return;}
  try{const snap=await getDocFromServer(doc(db,'users',user.uid)),profile=snap.data();if(rev!==generation)return;
   if(!allowedProfile(profile)){setStatus('Nincs aktív hozzáférés.',true);return;}
   uid=user.uid;role=profile.role;$('identity').textContent=(profile.name||'Felhasználó')+' · '+role;
   for(const control of $('movementForm').elements)control.disabled=!writable();
   buildForm();const loaded=new Map();
   for(const name of Object.keys(data))unsubs.push(onSnapshot(collection(db,name),{includeMetadataChanges:true},snapshot=>{
    if(rev!==generation)return;
    data[name]=snapshot.docs.map(d=>({...d.data(),id:d.id}));
    loaded.set(name,!snapshot.metadata.fromCache&&!snapshot.metadata.hasPendingWrites);
    const wasLive=liveVerified;
    liveVerified=loaded.size===Object.keys(data).length&&[...loaded.values()].every(Boolean);
    if(liveVerified){
      try{
        refreshChoices();
        if(!wasLive)buildForm();
        for(const control of $('movementForm').elements)control.disabled=!writable();
        render();$('workspace').hidden=false;
        setStatus('● Szerverről ellenőrzött staging Firestore · minden alapforrás naprakész');
      }catch(error){liveVerified=false;$('workspace').hidden=true;setStatus('A Flotta-adatok nem jeleníthetők meg megbízhatóan: '+error.message,true);}
    }else{
      $('workspace').hidden=true;
      for(const control of $('movementForm').elements)control.disabled=true;
      setStatus(loaded.size<Object.keys(data).length?
       'Flotta-adatok betöltése: '+loaded.size+'/'+Object.keys(data).length+' forrás…':
       'Az adatok gyorsítótárazottak vagy függő módosítást tartalmaznak; szerverkapcsolat kell a műveletekhez.',
       loaded.size===Object.keys(data).length);
    }
   },error=>{
    if(rev!==generation)return;
    liveVerified=false;$('workspace').hidden=true;
    for(const control of $('movementForm').elements)control.disabled=true;
    setStatus('Flotta-adatkapcsolati hiba ('+name+'): '+error.message,true);
   }));
  }catch(error){if(rev===generation)setStatus('Jogosultságellenőrzési hiba: '+error.message,true);}
 });
}
