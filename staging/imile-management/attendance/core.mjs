/** Independent iMile courier-vehicle check-in state machine.
 * No Google Sheet ingestion, no location requirement, no privileged writers.
 * Client plans do NOT replace server-side Firestore and Storage Rules.
 */
export const PHOTO_KEYS=Object.freeze(['front','left','right','back','cabinFront','cabinRear','cargo']);
export const PHOTO_LABELS=Object.freeze({
 front:'Autó eleje',left:'Bal oldal',right:'Jobb oldal',back:'Autó hátulja',
 cabinFront:'Első utastér',cabinRear:'Hátsó utastér',cargo:'Csomagtér'
});
export const PLATE=value=>String(value??'').trim().toUpperCase().replace(/[\s-]+/g,'');
export const validPlate=value=>/^[A-Z0-9]{4,12}$/.test(PLATE(value));
export const validKm=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000000;
const deny=reason=>Object.freeze({ok:false,reason});
export function validatePhotos(paths,uid,sessionId,stage){
 if(!uid||!/^[A-Za-z0-9_-]{5,128}$/.test(uid)||!sessionId||!/^[A-Za-z0-9_-]{12,128}$/.test(sessionId))
  return deny('Érvénytelen futár- vagy eseményazonosító.');
 if(!['in','out'].includes(stage))return deny('Érvénytelen fotózási szakasz.');
 if(!paths||typeof paths!=='object'||Object.keys(paths).length!==PHOTO_KEYS.length)
  return deny('Mind a 7 kötelező fénykép szükséges.');
 const prefix='attendance/'+uid+'/'+sessionId+'/'+stage+'/';
 for(const key of PHOTO_KEYS){
  const path=paths[key];
  if(typeof path!=='string'||path!==prefix+key+'.jpg')
   return deny('Hiányzó vagy nem megfelelő fénykép: '+PHOTO_LABELS[key]);
 }
 return Object.freeze({ok:true});
}
export function planCheckIn({uid,access,vehicle,lock,claim,sessionId,mileage,photos}={}){
 if(!access?.active||access?.uid!==uid||!access?.driverId)return deny('Nincs aktív futárjogosultság.');
 if(!vehicle||!validPlate(vehicle.plate||vehicle.id)||vehicle.status!=='Elérhető')
  return deny('Az autó nem kiadható.');
 if(lock||claim)return deny('Az autó vagy a futár már aktív kiadással rendelkezik.');
 if(!validKm(mileage))return deny('Érvénytelen kilométeróra-állás.');
 const checked=validatePhotos(photos,uid,sessionId,'in');
 if(!checked.ok)return checked;
 return Object.freeze({ok:true,plate:PLATE(vehicle.plate||vehicle.id),driverId:access.driverId,uid,sessionId,mileage});
}
export function planCheckOut({uid,session,mileage,photos,damageNote=''}={}){
 if(!session||session.uid!==uid||session.status!=='active')return deny('Nincs aktív autóhasználat.');
 if(!validKm(mileage)||mileage<session.startKm)return deny('A záró kilométer nem lehet kisebb a kezdő értéknél.');
 if(typeof damageNote!=='string'||damageNote.length>1000)return deny('Túl hosszú megjegyzés.');
 const checked=validatePhotos(photos,uid,session.id,'out');
 if(!checked.ok)return checked;
 return Object.freeze({ok:true,status:'awaiting_review',endKm:mileage,damageNote});
}
export function planReview({session,carPresent,keyPresent,clean,damageReviewed=false}={}){
 if(!session||session.status!=='awaiting_review')return deny('Csak kijelentkezett, ellenőrzésre váró autó vehető vissza.');
 if(carPresent!==true||keyPresent!==true)return deny('Az autó és a kulcs fizikai jelenléte nem igazolt.');
 if(clean!==true||String(session.damageNote||'').trim()&&!damageReviewed)
  return deny('Tisztaság vagy sérülés miatt külön intézkedés szükséges.');
 return Object.freeze({ok:true,status:'reviewed'});
}
export function bulkReviewEligible({sessions,physicallyChecked,keysChecked}={}){
 if(!Array.isArray(sessions)||!sessions.length)return deny('Nincs visszavehető autó.');
 if(physicallyChecked!==true||keysChecked!==true)
  return deny('Az összes autó és kulcs fizikai ellenőrzését külön igazolni kell.');
 const plates=new Set();
 for(const session of sessions){
  if(plates.has(session.plate))return deny('Duplikált rendszám a visszavételi listában.');
  plates.add(session.plate);
  const p=planReview({session,carPresent:true,keyPresent:true,clean:true});
  if(!p.ok)return deny(session.plate+': '+p.reason);
 }
 return Object.freeze({ok:true,count:sessions.length});
}
export function fleetSummary({vehicles=[],locks=[],confirmedDrivers=0}={}){
 const available=vehicles.filter(v=>v.status==='Elérhető');
 const locked=new Set(locks.filter(x=>x.state!=='reviewed').map(x=>PLATE(x.plate)));
 const ready=available.filter(x=>!locked.has(PLATE(x.plate))).length;
 const drivers=Number.isSafeInteger(confirmedDrivers)&&confirmedDrivers>=0?confirmedDrivers:0;
 return Object.freeze({operationalCars:available.length,confirmedDrivers:drivers,
  physicallyReady:ready,missingDrivers:Math.max(0,available.length-drivers),
  potentialCarsInUse:Math.min(available.length,drivers)});
}
