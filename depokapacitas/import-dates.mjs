// DepoKapacitas: locale-aware import of dates and Google Attendance timestamps.
// Slash dates are often US formatted in Google Forms; Hungarian CSV dates default to DMY.
// Ambiguous values can be directed explicitly by the importer.
const pad=n=>String(n).padStart(2,'0');
const valid=(y,m,d)=>Number.isInteger(y)&&Number.isInteger(m)&&Number.isInteger(d)
  &&y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31
  &&new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===y+'-'+pad(m)+'-'+pad(d);
const assembled=(y,m,d)=>valid(y,m,d)?y+'-'+pad(m)+'-'+pad(d):'';
function excelSerial(v){
  const n=typeof v==='number'?v:Number(String(v).trim());
  if(!Number.isFinite(n)||n<36526||n>73050)return null;
  const ms=Date.UTC(1899,11,30)+Math.round(n*86400000);
  return new Date(ms);
}
export function parseDay(value,slashOrder='DMY'){
  if(value instanceof Date&&!isNaN(value.getTime()))
    return assembled(value.getFullYear(),value.getMonth()+1,value.getDate());
  if(value===null||value===undefined)return '';
  const valueText=String(value).trim();
  const serial=/^\d{5}(?:\.\d+)?$/.test(valueText)?excelSerial(valueText):null;
  if(serial)return assembled(serial.getUTCFullYear(),serial.getUTCMonth()+1,serial.getUTCDate());
  const iso=valueText.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[ T])/);
  if(iso)return assembled(+iso[1],+iso[2],+iso[3]);
  const local=valueText.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})(?:$|[ T])/);
  if(!local)return '';
  let a=+local[1],b=+local[3],y=+local[4],sep=local[2];
  if(sep==='.')return assembled(y,b,a); // dd.mm.yyyy
  if(a>12)return assembled(y,b,a);       // unambiguous EU: dd/mm
  if(b>12)return assembled(y,a,b);       // unambiguous US: mm/dd
  return slashOrder==='MDY'?assembled(y,a,b):assembled(y,b,a);
}
export function parseTime(value,slashOrder='MDY'){
  const text=String(value??'').trim();
  const date=parseDay(value,slashOrder);
  if(!date)return {date:'',timeKnown:false,eventTime:''};
  const serial=/^\d{5}(?:\.\d+)?$/.test(text)?excelSerial(text):null;
  if(serial){const time=pad(serial.getUTCHours())+':'+pad(serial.getUTCMinutes())+':'+pad(serial.getUTCSeconds());return {date,timeKnown:true,eventTime:date+'T'+time};}
  const t=text.match(/(?:\s|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  if(!t)return {date,timeKnown:false,eventTime:date+'T00:00:00'};
  let hour=+t[1],minute=+t[2],second=+(t[3]||0);
  const suffix=t[4]?.toUpperCase();
  if(suffix){if(hour<1||hour>12)return {date:'',timeKnown:false,eventTime:''};hour=hour%12+(suffix==='PM'?12:0);}
  if(hour>23||minute>59||second>59)return {date:'',timeKnown:false,eventTime:''};
  return {date,timeKnown:true,eventTime:date+'T'+pad(hour)+':'+pad(minute)+':'+pad(second)};
}
