import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {getStorage} from 'firebase-admin/storage';
import {isDeepStrictEqual} from 'node:util';
import {BUCKET,MAX_BYTES,reject} from './verifier.mjs';

export function serverAdapters(app){
 const db=getFirestore(app),bucket=getStorage(app).bucket(BUCKET),auth=getAuth(app);
 const ref=id=>db.doc(`photoReceipts/${id.uid}/sessions/${id.sessionId}/stages/${id.stage}`);
 const identity=async id=>{
  let u;try{u=await auth.getUser(id.uid);}catch(e){if(e.code==='auth/user-not-found')reject('ACCOUNT_MISSING');throw e;}
  if(u.disabled)reject('ACCOUNT_DISABLED');
 };
 const check=async(tx,id)=>{
  const read=async p=>(await tx.get(db.doc(p))).data();
  const access=await read('courierAccess/'+id.uid);
  if(access?.uid!==id.uid||access.active!==true||typeof access.driverId!=='string'||!/^[A-Z0-9_-]{4,40}$/.test(access.driverId))reject('COURIER_DENIED');
  const driver=await read('drivers/'+access.driverId);
  if(driver?.active!==true)reject('DRIVER_INACTIVE');
  const session=await read('vehicleSessions/'+id.sessionId);
  if(session&&(session.uid!==id.uid||session.driverId!==access.driverId))reject('SESSION_OWNER');
  const courier=await read('courierLocks/'+id.uid),da=await read('driverLocks/'+access.driverId);
  if(id.stage==='in'){
   // Check-in session is intentionally created AFTER its photo receipt.
   if(session||courier||da)reject('CHECKIN_ALREADY_ACTIVE');
  }else{
   if(session?.status!=='active'||typeof session.plate!=='string'||!/^[A-Z0-9-]{3,12}$/.test(session.plate))reject('CHECKOUT_NOT_ACTIVE');
   const car=await read('vehicleLocks/'+session.plate);
   for(const lock of [courier,da,car])if(lock?.sessionId!==id.sessionId||lock.plate!==session.plate||lock.state!=='active')reject('LOCK_MISMATCH');
   if(da.uid!==id.uid||car.uid!==id.uid||da.driverId!==access.driverId||car.driverId!==access.driverId)reject('LOCK_MISMATCH');
  }
 };
 return {
  objects:{
   async metadata(path){try{return (await bucket.file(path).getMetadata())[0];}catch(e){if(Number(e.code)===404)return null;throw e;}},
   async download(m){
    const file=bucket.file(m.name,{generation:m.generation});
    const chunks=[];let size=0;
    for await(const chunk of file.createReadStream({validation:'crc32c',decompress:false})){
     size+=chunk.length;if(size>MAX_BYTES||size>m.size)reject('SIZE_MISMATCH');chunks.push(chunk);
    }
    return Buffer.concat(chunks);
   }
  },
  async authorize(id){
   await identity(id);
   // An already issued receipt may be replayed after checkout/review. It is
   // still checked for object replacement, but never reissued or re-timestamped.
   await db.runTransaction(async tx=>{const old=await tx.get(ref(id));if(!old.exists)await check(tx,id);});
  },
  receipts:{
   async get(id){return (await ref(id).get()).data();},
   async commit(id,proof){
    await identity(id);
    await db.runTransaction(async tx=>{
     const old=await tx.get(ref(id));
     if(old.exists){
      if(!old.data().verified||!isDeepStrictEqual(old.data().objects,proof.objects))reject('RECEIPT_CONFLICT');
      return;
     }
     await check(tx,id);
     tx.create(ref(id),{...proof,verifiedAt:FieldValue.serverTimestamp()});
    });
   },
   async invalidate(id,reason){await db.runTransaction(async tx=>{
    const old=await tx.get(ref(id));if(old.exists&&old.data().verified===true)
     tx.update(ref(id),{verified:false,invalidatedAt:FieldValue.serverTimestamp(),invalidReason:reason});
   });}
  }
 };
}
