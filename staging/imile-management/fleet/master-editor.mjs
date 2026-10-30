import {normalizedDriver,normalizedVehicle,sameRecord} from './master-data.mjs';

/**
 * Writes only canonical staging Fleet master records. Firebase Auth and
 * Firestore Rules provide the actual server-side admin authorization.
 * Re-reads the current record transactionally to prevent silent overwrites.
 */
export async function saveFleetMaster({db,kind,input,baseline,runTransaction,doc}){
  if(db?.app?.options?.projectId!=='imile-management-staging')
    throw Error('Éles vagy ismeretlen Firebase-projektre mentés nem engedélyezett.');
  if(kind!=='drivers'&&kind!=='vehicles')throw Error('Érvénytelen törzstípus.');
  const record=kind==='drivers'?normalizedDriver(input):normalizedVehicle(input);
  const original=baseline?{...baseline}:null;
  if(original&&original.id!==record.id)
    throw Error('A rendszám és DA-kód meglévő rekordnál nem módosítható.');
  if(original)delete original.id;
  const reference=doc(db,kind,record.id);
  const action=await runTransaction(db,async tx=>{
    const current=await tx.get(reference);
    if(original){
      if(!current.exists()||!sameRecord(current.data(),original))
        throw Error('A rekord időközben megváltozott. Frissítsd az oldalt, mielőtt mented.');
      tx.set(reference,record.data);
      return 'updated';
    }
    if(current.exists())throw Error('Ez az azonosító már létezik. Válaszd a meglévő rekord szerkesztését.');
    tx.set(reference,record.data);
    return 'created';
  });
  return {id:record.id,action};
}
