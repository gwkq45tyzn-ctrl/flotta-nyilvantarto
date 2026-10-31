/** Read-only iMile report transforms. No cloud writes, no inferred source aliases. */
export const COLORS=Object.freeze({navy:'002060',blue:'8AB8E6',gray:'E6E6E6',pivot:'DDEBF7',red:'D45D60',yellow:'E7D67B',green:'5AAC6F',lightgreen:'A8C375',missing:'FFF2CC'});
const txt=x=>typeof x==='string'?x.trim():x==null?'':String(x).trim();
const date=x=>{
 if(x instanceof Date){if(!Number.isFinite(x.getTime()))return null;x=x.toISOString().slice(0,10);}
 if(typeof x!=='string')return null;
 const value=x.trim(),m=/^(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
 if(!m||m[2]!==undefined&&(+m[2]>23||+m[3]>59||+m[4]>59))return null;
 const d=new Date(m[1]+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===m[1]?m[1]:null;
};
const int=x=>typeof x==='number'?x:typeof x==='string'&&/^\d+$/.test(x.trim())?Number(x.trim()):NaN;
const header=(matrix,required)=>{if(!Array.isArray(matrix)||!Array.isArray(matrix[0])||matrix.length>10002)throw Error('Hibás vagy túl nagy export.');const h=matrix[0].map(txt);if(new Set(h).size!==h.length)throw Error('Duplikált oszlopfejléc.');for(const k of required)if(!h.includes(k))throw Error('Hiányzó oszlop: '+k);return Object.fromEntries(h.map((v,i)=>[v,i]));};
const data=matrix=>matrix.slice(1).filter(x=>Array.isArray(x)&&x.some(v=>txt(v)!==''));
const cmp=(a,b)=>a.localeCompare(b,'hu',{numeric:true});
export function cityOrDistrict(city,zip){
 const c=txt(city),z=txt(zip);
 if(/^budapest$/i.test(c)){if(!/^1\d{3}$/.test(z))return null;const n=Number(z.slice(1,3));return n>=1&&n<=23?String(n):null;}
 return c||null;
}
export function inhub(matrix){
 const h=header(matrix,['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode']);
 const ids=new Set(),counts=new Map(),days=new Set(),areas=new Set(),issues=[];
 for(const [i,r]of data(matrix).entries()){
  const id=txt(r[h['Waybill Number']]),day=date(r[h['LM Receive Date']]),area=cityOrDistrict(r[h['Consignee city']],r[h['Consignee zipcode']]);
  if(typeof r[h['Waybill Number']]!=='string'||!id||!day||!area){issues.push({line:i+2,reason:'invalid_parcel_or_area'});continue;}
  if(ids.has(id)){issues.push({line:i+2,reason:'duplicate_waybill'});continue;}
  ids.add(id);days.add(day);areas.add(area);const k=JSON.stringify([area,day]);counts.set(k,(counts.get(k)||0)+1);
 }
 if(issues.length)return {kind:'inhub',status:'blocked',issues,total:null,rows:[],dates:[]};
 if(!ids.size)return {kind:'inhub',status:'missing',issues:[],total:null,rows:[],dates:[]};
 const dates=[...days].sort(),rows=[...areas].sort(cmp).map(area=>({area,counts:dates.map(day=>counts.get(JSON.stringify([area,day]))||0)}));
 return {kind:'inhub',status:'ready',dates,rows,total:ids.size,columnTotals:dates.map((_,i)=>rows.reduce((s,r)=>s+r.counts[i],0)),sourceRows:data(matrix).length,issues:[]};
}
export function ofd(matrix){
 const h=header(matrix,['OFD Date','DA','DA Code','Vendor','Station','OFD','Delivered']);
 const byId=new Map(),issues=[];
 for(const [i,r]of data(matrix).entries()){
  const day=date(r[h['OFD Date']]),name=txt(r[h['DA']]),code=txt(r[h['DA Code']]),vendor=txt(r[h['Vendor']]),station=txt(r[h['Station']]);
  const out=int(r[h['OFD']]),del=int(r[h['Delivered']]);
  if(typeof r[h['DA Code']]!=='string'||!day||!name||!code||!vendor||!station||!Number.isSafeInteger(out)||!Number.isSafeInteger(del)||out<0||del<0||del>out){issues.push({line:i+2,reason:'invalid_da_metric'});continue;}
  const key=JSON.stringify([day,station,code,vendor]);
  if(!byId.has(key))byId.set(key,{date:day,station,code,name,vendor,ofd:0,delivered:0,sourceCount:0,district:null});
  const v=byId.get(key);if(v.name!==name)issues.push({line:i+2,reason:'conflicting_da_name'});v.ofd+=out;v.delivered+=del;v.sourceCount++;
 }
 if(issues.length)return {kind:'ofd',status:'blocked',issues,rows:[],vendors:[],totalOfd:null,totalDelivered:null};
 const rows=[...byId.values()].sort((a,b)=>cmp(a.date,b.date)||cmp(a.vendor,b.vendor)||cmp(a.station,b.station)||cmp(a.name,b.name));
 if(!rows.length)return {kind:'ofd',status:'missing',rows:[],vendors:[],totalOfd:null,totalDelivered:null,issues:[]};
 const vendors=new Map();
 for(const r of rows){const k=JSON.stringify([r.date,r.station,r.vendor]);if(!vendors.has(k))vendors.set(k,{date:r.date,station:r.station,vendor:r.vendor,ofd:0,delivered:0,driverCount:0});const x=vendors.get(k);x.ofd+=r.ofd;x.delivered+=r.delivered;x.driverCount++;}
 const summaries=[...vendors.values()].map(v=>({...v,rate:v.ofd?v.delivered/v.ofd:null,spr:v.ofd/v.driverCount}));
 const totalOfd=rows.reduce((a,r)=>a+r.ofd,0),totalDelivered=rows.reduce((a,r)=>a+r.delivered,0);
 return {kind:'ofd',status:'ready',rows:rows.map(r=>({...r,rate:r.ofd?r.delivered/r.ofd:null,p90:r.ofd*.9-r.delivered})),vendors:summaries,uniqueCouriers:rows.length,totalOfd,totalDelivered,rate:totalOfd?totalDelivered/totalOfd:null,issues:[],sourceRows:data(matrix).length,analyticsPreview:rows.map(r=>({date:r.date,station:r.station,daCode:r.code,daName:r.name,vendor:r.vendor,ofd:r.ofd,delivered:r.delivered}))};
}
