/**
 * Deterministic ORIGINAL rich Fleet source with 30 keyed synthetic drivers
 * and 2 vehicles. No real personnel, vehicles or customer records.
 * Used identically by two independently spawned Node OS processes.
 */
export function createSyntheticStaleWriterSource(){
  return {
    drivers:Array.from({length:30},(_,i)=>({
      id:'synthetic-d-'+String(i).padStart(3,'0'),
      daCode:'DA'+String(i).padStart(4,'0'),
      name:'NO REAL PERSON '+String(i),
      kapacitas:40+i,status:'aktiv',
      history:[{kind:'hire',nested:{unicode:'Árvíztűrő',id:i}}],
      preserveFuture:{nested:[{i,s:['ß','漢字']}]}
    })),
    vehicles:Array.from({length:2},(_,i)=>({
      id:'synthetic-v-'+String(i),
      rendszam:'PL'+String(i).padStart(4,'0'),
      status:'aktiv',history:[{kind:'service',part:{retain:true}}],
      other:{nested:{country:'HU',syntheticOnly:true}}
    })),
    fuelCards:[{id:'f1',tokens:['synthetic']}],
    contacts:[{id:'c1',history:[{who:'no-real-contact'}]}],
    originalRootMetadata:{preserve:'yes'}
  };
}
