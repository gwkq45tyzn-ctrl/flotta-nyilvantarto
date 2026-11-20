import {verifyParcelDemand} from './district-capacity.mjs';
export const PARCEL_COLUMNS=Object.freeze(['date','trackingId','district','kind']);
export const MAX_PARCEL_ROWS=5000,MAX_PARCEL_TEXT=2000000;
const day=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function csvRows(text){
 const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,start=1;
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();if(row.some(x=>x.trim()!==''))rows.push({cells:row,line:start});row=[];start=line+1;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
  if(c==='"'){if(cell||closed)throw Error('Hibás idézőjel a(z) '+line+'. sorban.');quoted=true;}
  else if(c===',')endCell();
  else if(c==='\n'||c==='\r'){endRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
  else{if(closed&&!/\s/.test(c))throw Error('Hibás karakter az idézőjel után a(z) '+line+'. sorban.');if(!closed)cell+=c;}
  if(rows.length>MAX_PARCEL_ROWS+1)throw Error('Legfeljebb '+MAX_PARCEL_ROWS+' adatsor vizsgálható.');
 }
 if(quoted)throw Error('Lezáratlan idézőjel a(z) '+start+'. sortól.');
 if(cell||row.length||closed)endRow();
 if(!rows.length)return [];
 const header=rows.shift().cells.map(x=>x.trim());
 if(header.length!==4||new Set(header).size!==4||!PARCEL_COLUMNS.every(x=>header.includes(x)))
  throw Error('A prototípus CSV-fejléce: date,trackingId,district,kind. A valós oszlopmegfeleltetés még nincs véglegesítve.');
 return rows.map(x=>({value:x.cells.length===header.length?Object.fromEntries(header.map((key,i)=>[key,x.cells[i]])):null,sourceLine:x.line}));
}
export function previewParcelImport(text,{format='csv',date,sourceName='Helyi minta'}={}){
 const result={mode:'read-only',writesAllowed:false,status:'blocked',verified:false,sourceName:String(sourceName).slice(0,200),date,rowsRead:0,selectedRows:0,excludedRows:0,uniqueCount:null,duplicates:0,districts:[],audit:[]};
 const error=(reason,line,detail,extra={})=>result.audit.push({level:'error',reason,line,detail,...extra});
 if(!day(date)){error('invalid_day',null,'Érvénytelen kiválasztott nap.');return result;}
 if(typeof text!=='string'||text.length>MAX_PARCEL_TEXT){error('input_limit',null,'A bemenet legfeljebb 2 millió karakter lehet.');return result;}
 let rows;
 try{
  text=text.replace(/^\uFEFF/,'');
  if(!text.trim())rows=[];
  else if(format==='csv')rows=csvRows(text);
  else if(format==='json'){
   const parsed=JSON.parse(text);if(!Array.isArray(parsed))throw Error('JSON tömb szükséges.');
   rows=parsed.map((value,index)=>({value,sourceLine:index+1}));
  }else throw Error('Csak CSV vagy JSON prototípus támogatott.');
 }catch(e){error('parse_error',null,e.message);return result;}
 result.rowsRead=rows.length;
 if(rows.length>MAX_PARCEL_ROWS){error('row_limit',null,'Legfeljebb '+MAX_PARCEL_ROWS+' adatsor vizsgálható.');return result;}
 const valid=[];
 for(const {value:row,sourceLine}of rows){
  if(!row||Array.isArray(row)||typeof row!=='object'||Object.keys(row).length!==4||!PARCEL_COLUMNS.every(x=>Object.hasOwn(row,x))){error('invalid_schema',sourceLine,'Pontosan a négy prototípusmező szükséges.');continue;}
  if(!PARCEL_COLUMNS.every(x=>typeof row[x]==='string')){error('invalid_type',sourceLine,'Minden mező szöveg legyen; számmá alakított tracking ID-ból elveszhet a kezdő nulla.');continue;}
  const normalized={date:row.date.trim(),trackingId:row.trackingId.trim().toUpperCase(),district:row.district.trim().toLocaleUpperCase('hu-HU').replaceAll('/','-'),kind:row.kind.trim().toLowerCase(),sourceLine};
  if(!day(normalized.date)||!normalized.trackingId||normalized.trackingId.length>100||/[\u0000-\u0020\u007f]/.test(normalized.trackingId)||!normalized.district||normalized.district.length>60||!['new','retry'].includes(normalized.kind)){
   error('invalid_parcel',sourceLine,'Hiányzó vagy hibás ISO-nap, tracking ID, kerület vagy new/retry besorolás.');continue;
  }
  if(normalized.date!==date){result.excludedRows++;result.audit.push({level:'info',reason:'other_day',line:sourceLine,trackingId:normalized.trackingId,detail:'Másik nap: '+normalized.date});continue;}
  valid.push(normalized);
 }
 result.selectedRows=valid.length;
 const groups=new Map();for(const row of valid){if(!groups.has(row.trackingId))groups.set(row.trackingId,[]);groups.get(row.trackingId).push(row);}
 for(const [id,group]of groups){
  if(group.length<2)continue;
  const conflict=group.some(x=>x.district!==group[0].district||x.kind!==group[0].kind);
  if(conflict)for(const row of group)error('conflicting_parcel',row.sourceLine,'Azonos napi tracking ID eltérő kerülettel vagy new/retry besorolással. Nincs automatikus választás.',{trackingId:id,district:row.district,kind:row.kind,relatedLines:group.map(x=>x.sourceLine)});
  else for(const row of group.slice(1)){result.duplicates++;result.audit.push({level:'warning',reason:'duplicate_parcel',line:row.sourceLine,trackingId:id,relatedLines:[group[0].sourceLine,row.sourceLine],detail:'Azonos ismétlés; csak egyszer számít bele.'});}
 }
 const checked=verifyParcelDemand(valid,{date});
 if(result.audit.some(x=>x.level==='error'))return result;
 if(!checked.hasRecords){result.status='missing';result.audit.push({level:'warning',reason:'no_records',line:null,detail:'A kiválasztott napra nincs csomagadat; ez nem nulla csomag.'});return result;}
 if(!checked.verified){error('unverified_source',null,'A csomaglista ellenőrzése nem sikerült.');return result;}
 result.status='verified';result.verified=true;result.uniqueCount=checked.uniqueCount;result.districts=checked.districts;
 return result;
}
