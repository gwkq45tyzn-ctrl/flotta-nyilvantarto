import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {allowedProfile} from '../staging/imile-management/session-policy.mjs';
import {previewParcelImport,MAX_PARCEL_TEXT} from './parcel-preview.mjs';
import {decodeCsv} from './import-encoding.mjs';
const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
let allowed=false,last=null,source='Kézzel megadott minta',sequence=0;
$('previewDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function invalidate(){sequence++;last=null;$('result').hidden=true;$('downloadAudit').disabled=true;}
for(const id of ['previewInput','previewDate','previewFormat'])$(id).addEventListener('input',()=>{invalidate();if(id==='previewInput')source='Kézzel megadott minta';});
$('loadSample').onclick=()=>{invalidate();source='Beépített mesterséges minta';$('previewFormat').value='csv';const d=$('previewDate').value;$('previewInput').value='date,trackingId,district,kind\n'+d+',SYN0001,IX.,new\n'+d+',SYN0001,IX.,new\n'+d+',SYN0002,IX.,retry\n'+d+',SYN0003,X.,new';$('inputMessage').textContent='Mesterséges minta betöltve; még nincs ellenőrzött eredmény.';};
$('previewFile').onchange=async event=>{
 invalidate();const revision=sequence,file=event.target.files[0];if(!file)return;
 try{if(file.size>MAX_PARCEL_TEXT)throw Error('A mintafájl legfeljebb 2 MB lehet.');const format=/\.csv$/i.test(file.name)?'csv':/\.json$/i.test(file.name)?'json':null;if(!format)throw Error('CSV vagy JSON mintafájl szükséges.');const text=decodeCsv(await file.arrayBuffer());if(revision!==sequence)return;$('previewFormat').value=format;$('previewInput').value=text;source=file.name;$('inputMessage').textContent='Helyben beolvasva: '+file.name+'. Nincs adatbázisírás; az ellenőrzés még szükséges.';}
 catch(error){if(revision!==sequence)return;$('previewInput').value='';$('inputMessage').textContent=error.message;}
};
function render(result){
 $('result').hidden=false;const names={verified:'Ellenőrzött előnézet – mentés nincs',blocked:'IMPORT TILTVA – hibás vagy ütköző csomaglista',missing:'Nincs csomagadat a kiválasztott napra; ez nem nulla igény'};
 $('previewStatus').textContent=names[result.status];$('previewStatus').className='status-'+result.status;
 $('previewProvenance').textContent='Forrás: '+result.sourceName+' · Nap: '+result.date+' · Beolvasott sor: '+result.rowsRead+' · Kiválasztott napi sor: '+result.selectedRows+' · Másik napi sor: '+result.excludedRows;
 $('previewTotals').replaceChildren();for(const [title,value]of [['Egyedi csomag',result.uniqueCount],['Ismétlés kihagyva',result.duplicates],['Blokkoló hiba',result.audit.filter(x=>x.level==='error').length],['Adatbázisírás',0]]){const card=make('div');card.className='preview-metric';card.append(make('span',title),make('strong',value===null?'—':value));$('previewTotals').append(card);}
 $('previewDistricts').replaceChildren();for(const row of result.districts){const tr=make('tr');for(const value of [row.district,row.newCount,row.retryCount,row.newCount+row.retryCount])tr.append(make('td',value));$('previewDistricts').append(tr);}
 if(!result.districts.length){const tr=make('tr'),cell=make('td','Nincs hitelesíthető összesítés.');cell.colSpan=4;tr.append(cell);$('previewDistricts').append(tr);}
 $('previewAudit').replaceChildren();for(const issue of result.audit){const tr=make('tr');for(const value of [{error:'Hiba',warning:'Figyelmeztetés',info:'Tájékoztatás'}[issue.level],issue.relatedLines?.join(', ')||issue.line||'—',issue.trackingId||'—',issue.detail])tr.append(make('td',value));$('previewAudit').append(tr);}
 if(!result.audit.length){const tr=make('tr'),cell=make('td','Nincs észlelt sorhiba vagy ismétlés.');cell.colSpan=4;tr.append(cell);$('previewAudit').append(tr);}
 $('downloadAudit').disabled=false;
}
$('previewForm').onsubmit=event=>{event.preventDefault();if(!allowed)return;$('inputMessage').textContent='';last={...previewParcelImport($('previewInput').value,{format:$('previewFormat').value,date:$('previewDate').value,sourceName:source}),checkedAt:new Date().toISOString()};render(last);};
$('downloadAudit').onclick=()=>{if(!allowed||!last)return;const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'})),a=make('a');a.href=url;a.download='csomag-elonezet-'+last.date+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
if(firebaseConfig.projectId!=='imile-management-staging')$('access').textContent='Nem staging konfiguráció: a működés tiltva.';
else{
 const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);let generation=0;
 onAuthStateChanged(auth,async user=>{const rev=++generation;allowed=false;$('controls').hidden=true;invalidate();$('previewInput').value='';$('previewFile').value='';$('inputMessage').textContent='';source='Kézzel megadott minta';if(!user){window.location.replace('../staging/imile-management/index.html');return;}
  try{const profile=(await getDoc(doc(db,'users',user.uid))).data();if(rev!==generation)return;if(!allowedProfile(profile)){$('access').textContent='Nincs aktív belső jogosultság.';return;}allowed=true;$('controls').hidden=false;$('access').textContent='Hozzáférés: '+profile.role+' · csak olvasó előnézet';}
  catch{$('access').textContent='A hozzáférés nem ellenőrizhető. A helyi adatokat nem jelenítjük meg.';}
 });
}
