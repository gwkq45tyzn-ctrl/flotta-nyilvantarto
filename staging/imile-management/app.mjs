import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../depokapacitas/firebase-config.js';
import {allowedProfile,menuEntries,loginEmailForUsername} from './session-policy.mjs';

const $=id=>document.getElementById(id);
const views=['loading','login','denied','error','menu'];
function show(name) {
  for(const id of views) $(id).hidden=id!==name;
}
function fail(message) {
  $('connectionMessage').textContent=message;
  show('error');
}
const ready=Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
if (!ready) {
  fail('A staging Firebase webkonfiguráció hiányos. A bejelentkezés nem érhető el.');
} else {
  const firebase=initializeApp(firebaseConfig);
  const auth=getAuth(firebase), db=getFirestore(firebase);
  let authSequence=0;

  onAuthStateChanged(auth,async user=>{
    const revision=++authSequence;
    if(!user) { show('login'); return; }
    show('loading');
    try {
      const record=await getDoc(doc(db,'users',user.uid));
      if(revision!==authSequence)return;
      const profile=record.exists()?record.data():null;
      if(!allowedProfile(profile)){ show('denied'); return; }
      const entries=menuEntries(profile);
      $('qaLink').hidden=profile.role!=='admin';
      $('depoLink').hidden=!entries.some(x=>x.id==='depo'&&x.enabled);
      $('fleetLink').hidden=!entries.some(x=>x.id==='fleet'&&x.enabled);
      $('fleetMasterLink').hidden=!entries.some(x=>x.id==='fleet'&&x.enabled);
      $('userSummary').textContent=(profile.name||user.email||'Belső felhasználó')+' · '+profile.role;
      show('menu');
    } catch(error) {
      if(revision!==authSequence)return;
      console.error('Firebase profile verification failed',error);
      fail('Nem sikerült ellenőrizni a hozzáférést. Ellenőrizd az internetkapcsolatot és a Firebase-szabályokat.');
    }
  },error=>{
    console.error('Firebase auth state unavailable',error);
    fail('Nem sikerült kapcsolódni a Firebase-hitelesítéshez.');
  });

  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    $('loginError').textContent='';
    const button=$('loginSubmit');
    button.disabled=true;
    try{
      const data=new FormData(event.currentTarget);
      const loginEmail=loginEmailForUsername(data.get('username'));
      if (!loginEmail) throw new Error('Invalid login');
      await signInWithEmailAndPassword(auth,loginEmail,String(data.get('password')||''));
      event.currentTarget.reset();
    }catch(error){
      console.error('Staging Firebase login failed',error?.code||'unknown');
      $('loginError').textContent='Sikertelen bejelentkezés. Ellenőrizd az adatokat és a hálózati kapcsolatot.';
    }finally{
      button.disabled=false;
    }
  });
  for(const id of ['logout','deniedLogout']) {
    $(id).addEventListener('click',async ()=>{
      try{await signOut(auth);}
      catch(error){console.error('Logout failed',error);fail('Nem sikerült kijelentkezni. Próbáld újra.');}
    });
  }
}
$('retry').addEventListener('click',()=>window.location.reload());
