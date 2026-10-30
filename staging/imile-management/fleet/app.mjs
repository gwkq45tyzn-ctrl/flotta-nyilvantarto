import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,onSnapshot} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {allowedProfile} from '../session-policy.mjs';

const $=id=>document.getElementById(id);
const toMenu=()=>window.location.replace('../index.html');
let unsubs=[];
let generation=0;
function clear() {
  for(const un of unsubs)un();
  unsubs=[];
  $('fleetContent').hidden=true;
}
function status(message,bad=false) {
  $('status').textContent=message;
  $('status').classList.toggle('error',bad);
}
function renderRows(target,rows,columns) {
  const body=$(target);
  body.replaceChildren();
  if(!rows.length) {
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=columns.length;td.textContent='Még nincsenek rekordok a staging adatbázisban.';
    tr.append(td);body.append(tr);return;
  }
  for(const x of rows) {
    const tr=document.createElement('tr');
    for(const fn of columns) {
      const cell=document.createElement('td');
      cell.textContent=String(fn(x)??'');
      tr.append(cell);
    }
    body.append(tr);
  }
}
const configured=!!(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId);
if(!configured){
  status('A Firebase staging projekt nincs konfigurálva.',true);
  $('logout').disabled=true;
}else{
  const app=initializeApp(firebaseConfig);
  const auth=getAuth(app),db=getFirestore(app);
  $('logout').addEventListener('click',async()=>{try{await signOut(auth);toMenu();}catch(error){console.error(error);status('Nem sikerült kijelentkezni.',true);}});
  onAuthStateChanged(auth,async user=>{
    const rev=++generation;
    clear();
    if(!user){toMenu();return;}
    try {
      const snapshot=await getDoc(doc(db,'users',user.uid));
      if(rev!==generation)return;
      const profile=snapshot.exists()?snapshot.data():null;
      if(!allowedProfile(profile)){status('Nincs aktív jogosultságod az iMile staging rendszerhez.',true);return;}
      $('userInfo').textContent=(profile.name||user.email||'Felhasználó')+' · '+profile.role;
      const data={drivers:[],vehicles:[]},loaded=new Set();
      for(const name of ['drivers','vehicles']) {
        const unsubscribe=onSnapshot(collection(db,name),snap=>{
          if(rev!==generation)return;
          data[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
          loaded.add(name);
          if(name==='drivers'){
            $('driversCount').textContent=data.drivers.length;
            $('activeCount').textContent=data.drivers.filter(x=>x.active===true).length;
            renderRows('driversBody',data.drivers.slice().sort((a,b)=>String(a.daCode||'').localeCompare(String(b.daCode||''))),[
              x=>x.daCode||x.id,x=>x.name,x=>x.vendor,x=>x.active===true?'Aktív':'Inaktív'
            ]);
          }else{
            $('vehiclesCount').textContent=data.vehicles.length;
            $('availableCount').textContent=data.vehicles.filter(x=>x.status==='Elérhető').length;
            renderRows('vehiclesBody',data.vehicles.slice().sort((a,b)=>String(a.plate||'').localeCompare(String(b.plate||''))),[
              x=>x.plate||x.id,x=>x.model,x=>x.status
            ]);
          }
          $('fleetContent').hidden=false;
          status(loaded.size===2?'● Élő Firestore kapcsolat · kizárólag olvasás':'Adatok betöltése…');
        },error=>{
          if(rev!==generation)return;
          console.error('Staging fleet read failed:',name,error);
          status('A közös törzsadatok olvasása sikertelen. Ellenőrizd a Firestore jogosultságokat.',true);
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
