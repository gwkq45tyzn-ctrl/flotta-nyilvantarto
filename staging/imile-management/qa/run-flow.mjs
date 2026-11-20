import {doc,getDoc,setDoc,deleteDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
 QA_TEST_DATE,QA_DRIVER_ID,QA_CAR_ID,QA_BOOKING_ID,QA_CLAIM_ID,
 QA_DRIVER,QA_CAR,QA_BOOKING,QA_CLAIM,
 correctQaMaster,correctQaBooking,qaCapacity
} from './functional-flow.mjs';

const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const message=err=>String(err?.message||err||'ismeretlen hiba');
const permissionDenied=error=>error?.code==='permission-denied' || error?.code==='firestore/permission-denied';

/**
 * Staging only, requires a current signed-in admin. No production URLs or dynamic IDs.
 * Does NOT seed the permanent master records: that requires separate explicit consent.
 * Logs each actual Firestore result; avoids reporting a successful live test prematurely.
 */
export async function executeStagingBookingQa(db,report=()=>{}){
 assert(db?.app?.options?.projectId==='imile-management-staging',
   'A kapcsolódó Firebase-projekt nem staging; a funkcionális teszt tiltva.');
 const driver=doc(db,'drivers',QA_DRIVER_ID),car=doc(db,'vehicles',QA_CAR_ID);
 const capacity=doc(db,'driverCapacities',QA_DRIVER_ID);
 const booking=doc(db,'bookings',QA_BOOKING_ID);
 const claim=doc(db,'driverClaims',QA_CLAIM_ID);
 const out=line=>report(String(line));
 let createdCapacity=false,bookingAttempted=false,primaryError=null;
 const cleanupErrors=[];
 const before=await Promise.all([getDoc(driver),getDoc(car),getDoc(booking),getDoc(claim)]);
 assert(before[0].exists()&&before[1].exists(),'Előbb hozd létre a két mesterséges törzsrekordot.');
 assert(correctQaMaster(before[0].data(),before[1].data()),
   'A tesztrekordok eltérnek a jóváhagyott mintától. Nem módosítunk rajtuk.');
 assert(!before[2].exists()&&!before[3].exists(),
   'A 2099-01-15 dátumhoz már van tesztfoglalás vagy zárolás. Kézi ellenőrzés szükséges.');
 out('1. Staging és mintatörzs ellenőrizve.');

 try {
   const result=await runTransaction(db,async tx=>{
     const [d,c,cap]=await Promise.all([tx.get(driver),tx.get(car),tx.get(capacity)]);
     assert(d.exists()&&c.exists()&&correctQaMaster(d.data(),c.data()),'A mintatörzs időközben megváltozott.');
     if(cap.exists())assert(cap.data().capacity===100&&Object.keys(cap.data()).length===1,
       'A tesztfutár korábbi kapacitásrekordja nem pontosan 100. Nem írjuk felül.');
     else tx.set(capacity,{capacity:100});
     return {created:!cap.exists()};
   });
   createdCapacity=result.created;
   const capCheck=await getDoc(capacity);
   assert(capCheck.exists()&&capCheck.data().capacity===100,'Kapacitásrekord mentése vagy olvasása sikertelen.');
   out('2. driverCapacities/SYNTHETIC_TEST = 100 igazolva.');

   bookingAttempted=true;
   await runTransaction(db,async tx=>{
     const [b,cl,d,c,cap]=await Promise.all([
       tx.get(booking),tx.get(claim),tx.get(driver),tx.get(car),tx.get(capacity)
     ]);
     assert(!b.exists()&&!cl.exists(),'A tesztnap vagy a futár időközben foglalttá vált.');
     assert(d.exists()&&c.exists()&&correctQaMaster(d.data(),c.data()),'Nem elérhető a tesztfutár vagy autó.');
     assert(cap.exists()&&cap.data().capacity===100,'Kapacitás megváltozott.');
     tx.set(booking,QA_BOOKING);
     tx.set(claim,QA_CLAIM);
   });
   out('3. Foglalás és futárzárolás együtt mentve a 2099-01-15 tesztnapra.');

   const [b,cl]=await Promise.all([getDoc(booking),getDoc(claim)]);
   assert(b.exists()&&cl.exists()&&correctQaBooking(b.data(),cl.data()),
     'A foglalás visszaolvasása eltér; megkezdjük a visszavonást.');
   assert(qaCapacity(b.data(),before[0].data(),before[1].data())===100,
     'A tesztkapacitás nem 100.');
   out('4. Visszaolvasás és 100 csomagos kapacitás-ellenőrzés sikeres.');

   // Explicitly attempt an update of an existing booking and claim: both MUST be
   // refused by Firestore rules (allow update: if false). This does not prove every
   // distinct-driver/vehicle collision; those were covered by emulator testing.
   for(const [target,data,name] of [
     [booking,QA_BOOKING,'autófoglalás felülírása'],
     [claim,QA_CLAIM,'futárzárolás felülírása']
   ]){
     let denied=false;
     try{await setDoc(target,data);}
     catch(error){
       if(!permissionDenied(error))throw Error('Nem jogosultsági hiba a(z) '+name+' próbáján: '+message(error));
       denied=true;
     }
     assert(denied,'Biztonsági hiba: engedélyezett a(z) '+name+'!');
     out('5. Duplikált '+name+' tiltva a szerveroldali szabállyal.');
   }
 }catch(error){
   primaryError=error;
 }finally{
   // A test must never silently leave a booking/claim behind.
   if(bookingAttempted){
     try{
       await runTransaction(db,async tx=>{
         const [b,cl]=await Promise.all([tx.get(booking),tx.get(claim)]);
         if(!b.exists()&&!cl.exists())return;
         assert(b.exists()&&cl.exists()&&correctQaBooking(b.data(),cl.data()),
           'A tesztfoglalás nem egyezik vagy csak részben létezik: automatikus törlés tiltva.');
         tx.delete(booking);tx.delete(claim);
       });
       const [b,cl]=await Promise.all([getDoc(booking),getDoc(claim)]);
       assert(!b.exists()&&!cl.exists(),'A tesztfoglalás vagy zárolás a törlés után is látható.');
       out('6. Foglalás és driverClaim feloldva; mindkettő hiányzik.');
     }catch(error){cleanupErrors.push('Foglalás/zárolás visszavonása: '+message(error));}
   }
   if(createdCapacity){
     try{
       const latest=await getDoc(capacity);
       assert(latest.exists()&&latest.data().capacity===100&&Object.keys(latest.data()).length===1,
         'Az időközben módosított kapacitásrekordot nem töröljük.');
       await deleteDoc(capacity);
       assert(!(await getDoc(capacity)).exists(),'A tesztkapacitás rekord visszamaradt.');
       out('7. Ideiglenes kapacitásrekord eltávolítva.');
     }catch(error){cleanupErrors.push('Kapacitás visszavonása: '+message(error));}
   }else out('7. A teszt előtt már létező kapacitásrekordot változatlanul hagytuk.');
 }
 if(cleanupErrors.length)throw Error(
   (primaryError?'Teszt hiba: '+message(primaryError)+' | ':'')+
   'VISSZAMARADT REKORD LEHETSÉGES: '+cleanupErrors.join(' | ')
 );
 if(primaryError)throw primaryError;
 out('SIKERES: foglalás és zárolás nincs az adatbázisban; a két mesterséges törzsrekord megmarad.');
 return {date:QA_TEST_DATE,capacity:100,bookingAndClaimRemoved:true,masterRecordsRemain:true};
}
