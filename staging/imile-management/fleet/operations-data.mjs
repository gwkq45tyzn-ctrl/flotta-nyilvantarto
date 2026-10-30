// One canonical drivers/vehicles source; these records contain Fleet-only fields.
const f=(key,label,type='text',required=false,max=160)=>({key,label,type,required,max});
export const schemas=Object.freeze({
 vehicle:{label:'Járműadatok és biztosítások',key:'vehicleId',fields:[f('vehicleId','Rendszám','vehicle',true),f('make','Gyártmány'),f('vin','Alvázszám'),f('year','Évjárat','integer'),f('mileage','Km-óra','integer'),f('lessor','Bérbeadó'),f('location','Telephely'),f('insuranceNumber','Biztosítás száma'),f('insuranceExpiry','Kötelező biztosítás lejárata','date'),f('cascoExpiry','Casco lejárata','date'),f('inspectionExpiry','Műszaki lejárata','date'),f('rentalExpiry','Bérleti szerződés lejárata','date'),f('nextServiceDate','Következő szerviz','date'),f('nextServiceMileage','Következő szerviz km','integer'),f('tyresChanged','Gumicsere megtörtént','boolean'),f('note','Megjegyzés','text',false,2000)]},
 driver:{label:'Futár elérhetősége és okmányai',key:'driverId',fields:[f('driverId','DA-kód','driver',true),f('phone','Telefonszám'),f('licenseExpiry','Jogosítvány lejárata','date'),f('since','Mióta','date'),f('note','Megjegyzés','text',false,2000)]},
 fuel:{label:'Tankolókártyák',key:'code',fields:[f('code','Kártyaazonosító','code',true),f('provider','Szolgáltató'),f('vehicleId','Jármű','vehicle'),f('expiry','Lejárat','date'),f('limit','Havi limit','integer'),f('active','Aktív','boolean'),f('note','Megjegyzés','text',false,2000)]},
 phone:{label:'Telefonok',key:'code',fields:[f('code','Eszközazonosító','code',true),f('number','Telefonszám'),f('model','Modell'),f('imei','IMEI'),f('driverId','Kiadva a futárnak','driver'),f('active','Aktív','boolean'),f('note','Megjegyzés','text',false,2000)]},
 contact:{label:'Kapcsolatok',key:'code',fields:[f('code','Kapcsolatazonosító','code',true),f('name','Név','text',true),f('company','Cég / szolgáltató'),f('phone','Telefonszám'),f('email','E-mail'),f('active','Aktív','boolean'),f('note','Megjegyzés','text',false,2000)]},
 service:{label:'Szervizek',key:'code',fields:[f('code','Szervizazonosító','code',true),f('vehicleId','Rendszám','vehicle',true),f('date','Dátum','date',true),f('provider','Szerviz / szolgáltató'),f('mileage','Km-óra','integer'),f('cost','Költség (Ft)','integer'),f('status','Jármű állapota','status',true),f('note','Elvégzett munka','text',false,2000)]}
});
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
export function validDate(s){
 if(!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function normalizeFleetRecord(kind,input){
 const schema=schemas[kind];ensure(schema,'Ismeretlen flottaadattípus.');
 const data={};
 for(const field of schema.fields){
  const raw=input[field.key];let value=typeof raw==='string'?raw.trim():raw;
  if(field.type==='integer'){
   value=String(value??'');ensure(/^(0|[1-9]\d*)$/.test(value),'Nem negatív egész szám szükséges: '+field.label);
   value=Number(value);ensure(Number.isSafeInteger(value)&&value<=100000000,'Túl nagy szám: '+field.label);
   if(field.key==='year')ensure(value===0||(value>=1900&&value<=2199),'Érvénytelen évjárat.');
  }else if(field.type==='boolean'){
   ensure([true,false,'true','false'].includes(value),'Érvénytelen logikai érték.');value=value===true||value==='true';
  }else{
   value=String(value??'');ensure(value.length<=field.max,'Túl hosszú mező: '+field.label);
   ensure(!field.required||value.length>0,'Kötelező mező: '+field.label);
   if(field.type==='date')ensure(!value||validDate(value),'Érvénytelen naptári dátum: '+field.label);
   if(['code','driver','vehicle'].includes(field.type)){
    value=value.toUpperCase();if(field.type==='vehicle')value=value.replace(/[\s-]/g,'');
    const pattern=field.type==='vehicle'?/^[A-Z0-9]{4,12}$/:/^[A-Z0-9_-]{4,40}$/;
    ensure((!value&&!field.required)||pattern.test(value),'Érvénytelen azonosító: '+field.label);
   }
   if(field.type==='status')ensure(['Elérhető','Szerviz','Leállított'].includes(value),'Érvénytelen járműállapot.');
  }
  data[field.key]=value;
 }
 return {id:kind+'__'+data[schema.key],kind,data};
}
export function expiryWarnings(records,today){
 ensure(validDate(today),'Érvénytelen riportdátum.');
 const result=[];
 for(const row of records)for(const [field,value]of Object.entries(row.data)){
  if(/Expiry$|^expiry$|^nextServiceDate$/.test(field)&&value&&validDate(value)){
   const days=Math.round((Date.parse(value+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
   if(days<=60)result.push({id:row.id,field,date:value,days});
  }
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date));
}
