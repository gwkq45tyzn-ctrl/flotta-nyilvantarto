const REQUIRED=['demands','bookings','drivers','vehicles'];
export function assessSources(meta={}, {online=true,now=Date.now(),maxAge=15*60*1000,required=REQUIRED}={}){
 const keys=Array.isArray(required)&&required.length?required:REQUIRED;
 const missing=keys.filter(x=>!meta[x]?.loaded),failed=keys.filter(x=>meta[x]?.error);
 const times=keys.map(x=>meta[x]?.serverAt).filter(x=>Number.isFinite(x)&&x>0);
 const confirmedAt=times.length===keys.length?Math.min(...times):null;
 let status='ready',message='Szerverrel ellenőrzött pillanatkép';
 if(!online){status='offline';message='Offline: csak korábbi adatok láthatók, a kapacitás nem hitelesíthető.';}
 else if(failed.length){status='error';message='Adatforráshiba: '+failed.join(', ')+'. A terv nem teljes.';}
 else if(missing.length){status='loading';message='Még nincs minden adatforrás betöltve: '+missing.join(', ')+'.';}
 else if(keys.some(x=>meta[x]?.pending)){status='pending';message='A helyi módosítás szerveri visszaigazolásra vár.';}
 else if(keys.some(x=>meta[x]?.fromCache!==false)||confirmedAt===null){status='cached';message='Gyorsítótárazott adat: még nincs teljes szerveri visszaigazolás.';}
 else if(!Number.isFinite(now)||confirmedAt>now||now-confirmedAt>maxAge){status='stale';message='Régen vagy hibás időponttal ellenőrzött pillanatkép; frissítés szükséges.';}
 return {status,trusted:status==='ready',message,confirmedAt};
}
