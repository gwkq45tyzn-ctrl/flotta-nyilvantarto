/**
 * Read-only, optionally available view of the ORIGINAL Fleet Firestore snapshot.
 * NO writes, no automatic upsert into /drivers or /vehicles, no source-of-truth
 * claim before verified cutover. A server-confirmed snapshot is still not proof
 * of a verified migration: it is only an inspection preview.
 */
import {planSharedMigration} from '../features/shared-master-adapter.mjs';

const empty=Object.freeze({status:'waiting',note:'Flotta adatkapcsolat ellenőrzése…',
  revision:null,drivers:[],vehicles:[],issues:[],counts:null});

/** Returns only canonical projection; never retains rich private Fleet sidecars. */
export function projectSharedFleetSnapshot(data,metadata={}) {
  if(metadata.fromCache===true||metadata.hasPendingWrites===true){
    return {...empty,status:'unconfirmed',
      note:'Nem szerver-visszaigazolt adat: cache/függő írás. A Flotta előnézet nincs frissítve.'};
  }
  if(data==null)return {...empty,status:'missing',
    note:'A közös Flotta-dokumentum még nem létezik. Adatátvitel nincs jóváhagyva.'};
  const rev=data.revision;
  if(!Number.isSafeInteger(rev)||rev<1)return {...empty,status:'invalid',
    note:'Hibás Flotta revízió: előnézet nem használható.'};
  try{
    const plan=planSharedMigration(data);
    const ready=plan.ready&&plan.writes.vehicles.every(Boolean)&&plan.writes.drivers.every(Boolean);
    return {
      status:ready?'preview':'review',
      note:ready
        ?'Szerverről igazolt Flotta-előnézet. Operatív törzsadatként csak külön jóváhagyott migráció és teljes Depó-egyezés esetén használható.'
        :'Az eredeti Flotta rekordjai eltéréseket tartalmaznak: külön ellenőrzés kell, foglalás nem engedélyezett.',
      revision:rev,
      vehicles:plan.writes.vehicles.filter(Boolean),
      drivers:plan.writes.drivers.filter(Boolean),
      issues:plan.issues.slice(0,50),
      counts:plan.counts,
      omittedIssues:Math.max(0,plan.issues.length-50)
    };
  }catch(e){
    return {...empty,status:'invalid',note:'A Flotta-dokumentum szerkezete hibás: '+String(e?.message||e)};
  }
}
export const emptySharedFleetPreview=()=>({...empty});
