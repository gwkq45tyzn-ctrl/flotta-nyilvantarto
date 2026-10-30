import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from '../../../depokapacitas/firebase-config.js';
import {correctQaMaster} from './functional-flow.mjs';
import {executeStagingBookingQa} from './run-flow.mjs';

const $=id=>document.getElementById(id);
const DRIVER_ID='SYNTHETIC_TEST',CAR_ID='TESTCAR01';
const DRIVER=Object.freeze({name:'Tesztfutár (mesterséges)',daCode:DRIVER_ID,vendor:'QA',capacity:100,active:true});
const CAR=Object.freeze({plate:CAR_ID,model:'SYNTHETIC QA',status:'Elérhető'});
const isStaging=firebaseConfig.projectId==='imile-management-staging';
const state=message=>$('state').textContent=message;
if(!isStaging) {
  state('Biztonsági tiltás: nem a jóváhagyott staging Firebase-projekt van konfigurálva.');
} else {
  const firebase=initializeApp(firebaseConfig);
  const db=getFirestore(firebase),auth=getAuth(firebase);
  let admin=false, busy=false, already=false, readyForRun=false;
  const driverRef=doc(db,'drivers',DRIVER_ID),carRef=doc(db,'vehicles',CAR_ID);
  const button=$('create'),runButton=$('runFlow');
  const refresh=async()=>{
    button.disabled=true;
    const [d,c]=await Promise.all([getDoc(driverRef),getDoc(carRef)]);
    already=d.exists()||c.exists();
    readyForRun=d.exists()&&c.exists()&&correctQaMaster(d.data(),c.data());
    $('existing').textContent=already
      ? 'Már létezik a tesztfutár és/vagy tesztautó. Semmit nem írunk felül; ellenőrizd a meglévő rekordokat.'
      : 'A két tesztazonosító még szabad.';
    button.disabled=already||!admin||busy;
    runButton.disabled=!readyForRun||!admin||busy;
  };
  onAuthStateChanged(auth,async user=>{
    admin=false;button.disabled=true;runButton.disabled=true;$('controls').hidden=true;
    if(!user){state('Nincs bejelentkezés. Lépj be a közös főmenüből.');return;}
    try{
      const profile=await getDoc(doc(db,'users',user.uid));
      admin=profile.exists()&&profile.data().active===true&&profile.data().role==='admin';
      if(!admin){state('Az előkészítéshez aktív adminjogosultság szükséges.');return;}
      $('controls').hidden=false;state('Aktív adminfiók ellenőrizve. Csak mesterséges adatok engedélyezettek.');
      await refresh();
    }catch(error){console.error('QA access check failed',error);state('A Firestore jogosultságellenőrzése nem sikerült.');}
  });
  runButton.addEventListener('click',async()=>{
    if(!admin||busy||!readyForRun||!isStaging)return;
    if(!window.confirm('Elindítod az izolált staging foglalási tesztet? A teszt ideiglenes foglalást és futárzárolást hoz létre, majd visszavonja. A két mesterséges törzsrekord megmarad.'))return;
    busy=true;runButton.disabled=true;button.disabled=true;
    const flowLog=$('flowLog');flowLog.textContent='Teszt indítása…';
    const writeLog=line=>{flowLog.textContent+='\n'+line;};
    try{
      const outcome=await executeStagingBookingQa(db,writeLog);
      writeLog('Sikeres teszt: '+outcome.capacity+' csomag, foglalás és driverClaim eltávolítva.');
    }catch(error){
      console.error('Staging booking flow failed',error);
      writeLog('HIBA: '+String(error?.message||error));
      writeLog('Ha maradt foglalás vagy zárolás, csak ellenőrzés után próbáld újra.');
    }finally{
      busy=false;
      try{await refresh();}catch(error){console.error('QA refresh failed',error);writeLog('Nem sikerült frissíteni a tesztadatok állapotát.');}
    }
  });
    button.addEventListener('click',async()=>{
    if(!admin||busy||already||!isStaging)return;
    if(!window.confirm('Biztosan létrehozod a két szintetikus rekordot? A Firestore-szabályok szerint automatikusan nem törölhetők.'))return;
    busy=true;button.disabled=true;
    try{
      await runTransaction(db,async tx=>{
        const [d,c]=await Promise.all([tx.get(driverRef),tx.get(carRef)]);
        if(d.exists()||c.exists())throw Error('Egyik tesztazonosító már foglalt. Nem írtunk felül rekordot.');
        tx.set(driverRef,DRIVER);
        tx.set(carRef,CAR);
      });
      $('result').textContent='Mindkét mesterséges törzsrekord létrejött. A DepóKapacitásban most beállítható a kapacitás és kipróbálható a beosztás.';
      await refresh();
    }catch(error){
      console.error('Synthetic staging seed failed',error);
      $('result').textContent='Nem sikerült a mentés. Nem helyettesítjük élő adatokkal; ellenőrizd a Firestore jogosultságokat.';
      try{await refresh();}catch(e){console.error(e);}
    }finally{busy=false;try{await refresh();}catch(e){console.error('QA refresh failed',e);}}
  });
}
