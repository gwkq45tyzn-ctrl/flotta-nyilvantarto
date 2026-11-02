/**
 * Read-only audit for duplicate or malformed company-car courier access.
 * Never uses Google Sheets, client credentials or private Auth account info.
 */
export function auditCourierAccess(accesses){
 if(!Array.isArray(accesses))return {ready:false,duplicates:[],invalid:[]};
 const grouped=new Map(),invalid=[];
 for(const record of accesses){
  if(record?.active!==true)continue;
  const driverId=String(record.driverId||'').trim().toUpperCase();
  const uid=String(record.uid||record.id||'').trim();
  if(!/^[A-Z0-9_-]{4,40}$/.test(driverId)||!uid){
   invalid.push({driverId:driverId||'(hiányzik)',uid:uid||'(hiányzik)'});
   continue;
  }
  const uids=grouped.get(driverId)||new Set();
  uids.add(uid);grouped.set(driverId,uids);
 }
 const duplicates=[...grouped].filter(([,uids])=>uids.size>1)
  .map(([driverId,uids])=>({driverId,activeAccounts:uids.size})).sort((a,b)=>a.driverId.localeCompare(b.driverId));
 return {ready:true,duplicates,invalid};
}
