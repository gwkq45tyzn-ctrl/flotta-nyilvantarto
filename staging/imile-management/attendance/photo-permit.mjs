const SID=/^s_[a-f0-9]{32}$/;
const ID=/^[a-f0-9]{32}$/;
const storageKey=uid=>'imile.photoPermit.request.v1.'+uid;
const memory=new Map();
const fresh=()=>crypto.randomUUID().replaceAll('-','');
const browserStore=()=>{try{return globalThis.sessionStorage;}catch{return undefined;}};
export function clearPermitRequest(uid,store=browserStore()){
 memory.delete(uid);try{store?.removeItem(storageKey(uid));}catch{}
}
function requestId(uid,store){
 let id;try{id=store?.getItem(storageKey(uid));}catch{}
 if(!ID.test(id||''))id=memory.get(uid)||fresh();
 memory.set(uid,id);try{store?.setItem(storageKey(uid),id);}catch{}return id;
}
export async function requestPhotoPermit(call,{uid,stage,sessionId,store=browserStore()}){
 if(typeof uid!=='string'||!uid||!['in','out'].includes(stage))throw Error('Érvénytelen feltöltési kérés.');
 const payload=stage==='in'?{action:'begin',requestId:requestId(uid,store)}:{action:'checkout',sessionId};
 let result;
 try{result=await call(payload);}catch(e){
  const messages={DAILY_QUOTA_EXHAUSTED:'A napi fotófeltöltési keret elfogyott. Kérj indokolt adminisztrátori feloldást.',
   DA_UPLOAD_IN_PROGRESS:'Ehhez a DA-kódhoz már folyamatban van egy másik fiók feltöltése. Kérj vezetői ellenőrzést.',
   PERMIT_EXPIRED_OR_FINISHED:'A korábbi feltöltési engedély lejárt vagy lezárult.',REQUEST_ALREADY_FINISHED:'A korábbi feltöltési engedély már lezárult.',
   POLICY_NOT_CONFIGURED:'A szerveres fotófeltöltési szabályzat még nincs beállítva.',UPLOADS_DISABLED:'A fotófeltöltés átmenetileg szünetel.',
   PERMIT_MISSING:'Nincs érvényes feltöltési engedély. Kérj adminisztrátori segítséget.',TOO_MANY_REQUEST_ALIASES:'Túl sok külön feltöltési kérés indult. Folytasd az eredeti lapon.'};
  const code=Object.keys(messages).find(k=>String(e.message||'').includes(k));
  const error=Error(messages[code]||'A feltöltési engedély nem érhető el. Próbáld újra; új napi keretet nem kérünk.');
  error.restartAllowed=['PERMIT_EXPIRED_OR_FINISHED','REQUEST_ALREADY_FINISHED'].includes(code);throw error;
 }
 const p=result?.data;
 if(!p||p.uid!==uid||p.source!=='upload-quota-v1'||!SID.test(p.sessionId)||p.stage!==stage||!Number.isFinite(p.expiresAt)||p.expiresAt<=0||
  stage==='out'&&p.sessionId!==sessionId||stage==='in'&&!ID.test(p.requestId))throw Error('Érvénytelen szerveres feltöltési engedély.');
 if(stage==='in'){
  memory.set(uid,p.requestId);try{store?.setItem(storageKey(uid),p.requestId);}catch{}
 }
 return p;
}
