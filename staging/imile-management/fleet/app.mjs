import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,onSnapshot,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {allowedProfile} from '../session-policy.mjs';
import {saveFleetMaster} from './master-editor.mjs';
import {deriveAttendanceHandovers} from '../attendance-handover.mjs';
import {fleetAvailability} from './availability.mjs';

const $=id=>document.getElementById(id);
const toMenu=()=>window.location.replace('../index.html');
const depotToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let unsubs=[],generation=0;
const state={admin:false,uid:null,drivers:[],vehicles:[],attendance:[],bookings:[],fleetAssignments:[]};
function clear() {
  for(const un of unsubs)un();
  unsubs=[];
  state.admin=false;state.uid=null;state.drivers=[];state.vehicles=[];state.attendance=[];state.bookings=[];state.fleetAssignments=[];
  $('fleetContent').hidden=true;
  $('adminVehiclePanel').hidden=true;
  $('adminDriverPanel').hidden=true;
  $('driversActions').hidden=true;
  $('vehiclesActions').hidden=true;
  for(const kind of ['driver','vehicle'])resetEdit(kind);
}
function status(message,bad=false){
  $('status').textContent=message;
  $('status').classList.toggle('error',bad);
}
function resetEdit(kind){
  const form=$(kind+'Form');
  form.reset();
  form.dataset.baseline='';
  const identity=kind==='driver'?'daCode':'plate';
  form.elements[identity].readOnly=false;
  $('save'+(kind==='driver'?'Driver':'Vehicle')).textContent=
    kind==='driver'?'Új futár létrehozása':'Új autó létrehozása';
}
function startEdit(kind,row){
  if(!state.admin)return;
  const form=$(kind+'Form');
  for(const [key,value] of Object.entries(row)){
    if(form.elements[key])form.elements[key].value=String(value);
  }
  const identity=kind==='driver'?'daCode':'plate';
  form.elements[identity].readOnly=true;
  // Preserved snapshot for an optimistic concurrency check inside a Firestore transaction.
  form.dataset.baseline=JSON.stringify(row);
  $('save'+(kind==='driver'?'Driver':'Vehicle')).textContent='Módosítás mentése';
  form.scrollIntoView({behavior:'smooth',block:'center'});
}
function renderRows(target,rows,columns,kind){
  const body=$(target);
  body.replaceChildren();
  if(!rows.length){
    const tr=document.createElement('tr'),cell=document.createElement('td');
    cell.colSpan=columns.length+(state.admin?1:0);
    cell.textContent='Még nincsenek rekordok a staging adatbázisban.';
    tr.append(cell);body.append(tr);return;
  }
  for(const x of rows){
    const tr=document.createElement('tr');
    for(const fn of columns){
      const cell=document.createElement('td');
      cell.textContent=String(fn(x)??'');
      tr.append(cell);
    }
    if(state.admin){
      const td=document.createElement('td'),edit=document.createElement('button');
      edit.type='button';edit.className='edit';
      edit.textContent='Szerkesztés';
      edit.setAttribute('aria-label',(kind==='driver'?'Futár':'Autó')+' szerkesztése: '+(x.id||''));
      edit.addEventListener('click',()=>startEdit(kind,x));
      td.append(edit);tr.append(td);
    }
    body.append(tr);
  }
}
function render(){
  const handovers=deriveAttendanceHandovers({
    events:state.attendance,drivers:state.drivers,vehicles:state.vehicles,
    manualBookings:state.bookings
  });
  const handoverBody=$('handoverBody');
  handoverBody.replaceChildren();
  const displayed=handovers.handovers.slice(-100).reverse();
  for(const row of displayed){
    const tr=document.createElement('tr');
    for(const value of [
      state.drivers.find(x=>x.id===row.driverId)?.name||row.driverId,
      row.vehicleId,row.pickedUpAt.replace('T',' '),
      row.returnedAt?.replace('T',' ')||'—',
      row.status==='returned'?'Visszaadva':row.status==='return_review'?'Ellenőrzésre vár':'Futárnál'
    ]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}
    handoverBody.append(tr);
  }
  if(!displayed.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=5;td.textContent='Még nincs rendszámmal ellátott Attendance-esemény.';
    tr.append(td);handoverBody.append(tr);
  }
  $('attendanceHandoverStatus').textContent=handovers.openVehicleIds.length+
    ' kiadott / ellenőrzésre váró autó · '+handovers.alerts.length+
    ' feldolgozási figyelmeztetés. A foglalásokat a kapacitástervező külön kezeli.';
  $('driversCount').textContent=state.drivers.length;
  $('activeCount').textContent=state.drivers.filter(x=>x.active===true).length;
  $('vehiclesCount').textContent=state.vehicles.length;
  const availability=fleetAvailability({vehicles:state.vehicles,
    assignments:state.fleetAssignments,attendanceOpenVehicleIds:handovers.openVehicleIds,
    bookings:state.bookings,day:depotToday()});
  $('availableCount').textContent=availability.free;
  renderRows('driversBody',state.drivers.slice().sort((a,b)=>
    String(a.daCode||'').localeCompare(String(b.daCode||''))),[
      x=>x.daCode||x.id,x=>x.name,x=>x.vendor,x=>x.active===true?'Aktív':'Inaktív'
    ],'driver');
  renderRows('vehiclesBody',state.vehicles.slice().sort((a,b)=>
    String(a.plate||'').localeCompare(String(b.plate||''))),[
      x=>x.plate||x.id,x=>x.model,x=>x.status
    ],'vehicle');
}
const configured=Boolean(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId);
if(!configured||firebaseConfig.projectId!=='imile-management-staging'){
  status('A Firebase staging projekt nincs konfigurálva, vagy nem a jóváhagyott tesztprojekt.',true);
  $('logout').disabled=true;
}else{
  const app=initializeApp(firebaseConfig);
  const auth=getAuth(app),db=getFirestore(app);
  $('logout').addEventListener('click',async()=>{
    try{await signOut(auth);toMenu();}
    catch(error){console.error(error);status('Nem sikerült kijelentkezni.',true);}
  });
  for(const kind of ['driver','vehicle']){
    $(kind==='driver'?'cancelDriverEdit':'cancelVehicleEdit').addEventListener('click',()=>resetEdit(kind));
    $(kind+'Form').addEventListener('submit',async event=>{
      event.preventDefault();
      if(!state.admin||!state.uid){
        status('A törzsszerkesztéshez aktív adminjogosultság szükséges.',true);
        return;
      }
      const form=event.currentTarget;
      const button=form.querySelector('button[type="submit"]');
      const output=$(kind+'Message');
      const baseline=form.dataset.baseline?JSON.parse(form.dataset.baseline):null;
      const input=Object.fromEntries(new FormData(form).entries());
      const label=kind==='driver'?'futár':'autó';
      button.disabled=true;
      output.textContent='Mentés folyamatban…';
      try{
        const result=await saveFleetMaster({
          db,kind:kind==='driver'?'drivers':'vehicles',
          input,baseline,runTransaction,doc
        });
        output.textContent=(result.action==='created'?'Létrehozva: ':'Módosítva: ')+result.id+
          '. A DepóKapacitás ugyanazt a Firestore törzset olvassa.';
        resetEdit(kind);
      }catch(error){
        console.error('Staging Fleet master save failed',error);
        output.textContent='Nem sikerült menteni: '+String(error?.message||'Ismeretlen hiba');
      }finally{button.disabled=false;}
    });
  }
  onAuthStateChanged(auth,async user=>{
    const rev=++generation;
    clear();
    if(!user){toMenu();return;}
    try{
      const record=await getDoc(doc(db,'users',user.uid));
      if(rev!==generation)return;
      const profile=record.exists()?record.data():null;
      if(!allowedProfile(profile)){
        status('Nincs aktív jogosultságod az iMile staging rendszerhez.',true);return;
      }
      state.uid=user.uid;
      state.admin=profile.role==='admin';
      $('userInfo').textContent=(profile.name||user.email||'Felhasználó')+' · '+profile.role;
      $('adminDriverPanel').hidden=!state.admin;
      $('adminVehiclePanel').hidden=!state.admin;
      $('driversActions').hidden=!state.admin;
      $('vehiclesActions').hidden=!state.admin;
      const loaded=new Set();
      for(const name of ['drivers','vehicles','attendance','bookings','fleetAssignments']){
        const unsubscribe=onSnapshot(collection(db,name),snap=>{
          if(rev!==generation)return;
          state[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
          loaded.add(name);
          if(loaded.size===5){
            try{render();$('fleetContent').hidden=false;
              status('● Élő staging Firestore kapcsolat · minden alapforrás betöltve · '+
               (state.admin?'admin törzsszerkesztés engedélyezett':'olvasási jogosultság'));
            }catch(error){$('fleetContent').hidden=true;status('Nem ellenőrizhető a teljes Flotta-állapot: '+error.message,true);}
          }else{$('fleetContent').hidden=true;status('Flotta-adatok betöltése: '+loaded.size+'/5 forrás…');}
        },error=>{
          if(rev!==generation)return;
          console.error('Staging fleet read failed:',name,error);
          $('fleetContent').hidden=true;
          status('Az egyik kötelező Flotta-forrás ('+name+') nem érhető el. Az elérhetőség nem tekinthető ellenőrzöttnek.',true);
        });
        unsubs.push(unsubscribe);
      }
    }catch(error){
      if(rev!==generation)return;
      console.error('Staging profile verification failed',error);
      status('Nem sikerült ellenőrizni a belépési jogosultságot.',true);
    }
  },error=>{console.error(error);status('Firebase hitelesítési hiba.',true);});
}
