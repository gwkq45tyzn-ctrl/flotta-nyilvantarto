/**
 * DepóKapacitás · belső Google Attendance szinkron
 * A szkript NEM webalkalmazás: csak időzített triggerrel fut.
 * A tulajdonosnak olvasási hozzáférés kell az Attendance-táblához
 * és Firebase/Google Cloud IAM-beli Firestore írási jogosultság.
 * Service-account privát kulcsot ne tegyél GitHubra.
 */
const DEPO_SHEET_ID='172WO6bYfJriFxIYl7MDT6dELQxzOgVrXuWUCNpJHaDI';
const DEPO_SHEET_NAME='Mobile Attendance';
const DEPO_PROJECT_ID='ADD_FIREBASE_PROJECT_ID';
const DEPO_TZ='Europe/Budapest';
const DEPO_WATERMARK='DEPO_ATTENDANCE_NEXT_ROW';
function syncAttendance(){
  if(DEPO_PROJECT_ID==='ADD_FIREBASE_PROJECT_ID') throw Error('Add meg a Firebase projectId-t.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))return;
  try{
    const sheet=SpreadsheetApp.openById(DEPO_SHEET_ID).getSheetByName(DEPO_SHEET_NAME);
    if(!sheet)throw Error('Nem található a Mobile Attendance munkalap.');
    const props=PropertiesService.getScriptProperties();
    const last=sheet.getLastRow();const first=Math.max(2,Number(props.getProperty(DEPO_WATERMARK)||'2'));
    if(last<first)return;
    // The existing Mobile Attendance uses 16 columns. Only adopt a car ID
    // after an explicitly named additional column is present in the sheet.
    // Historic 16-column events stay unchanged and never generate handovers.
    const columns=Math.max(16,sheet.getLastColumn());
    const header=sheet.getRange(1,1,1,columns).getDisplayValues()[0];
    const normHeader=x=>String(x||'').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const vehicleIndex=header.findIndex(x=>
      ['vehicleplate','vehicleid','licenseplate','rendszam','autorendszama'].includes(normHeader(x)));
    // Separate pickup, return or shared "Odometer" source columns are optional.
    // No columns or form questions are created or modified in the source.
    const pickupIndex=header.findIndex(x=>
      ['pickupodometer','pickupkm','atvetelikm','atvetelikilometerora','atvetelikilometeroraallas'].includes(normHeader(x)));
    const returnIndex=header.findIndex(x=>
      ['returnodometer','returnkm','visszaadasikm','visszaadasikilometerora','visszaadasikilometeroraallas'].includes(normHeader(x)));
    const sharedOdometerIndex=header.findIndex(x=>
      ['odometer','odometerreading','mileage','kilometeroraallas','aktualiskilometeroraallas'].includes(normHeader(x)));
    const raw=sheet.getRange(first,1,last-first+1,columns).getValues();
    const display=sheet.getRange(first,1,last-first+1,columns).getDisplayValues();
    let writes=[];
    for(let i=0;i<raw.length;i++){
      const r=raw[i],v=display[i];
      const code=String(v[2]||'').trim().toUpperCase();
      const type=String(v[4]||'').trim();
      if(!code||!['Log In','Log Out'].includes(type))continue;
      const dateValue=r[0];
      const known=dateValue instanceof Date && !isNaN(dateValue.valueOf());
      const fallback=known?'':formatDisplayTimestamp(v[0]);
      const datetime=known?Utilities.formatDate(dateValue,DEPO_TZ,"yyyy-MM-dd'T'HH:mm:ss"):fallback;
      if(!datetime){console.warn('Hibás vagy hiányzó bejelentkezési időpont, forrássor: '+(first+i));continue;}
      const signature=datetime+'|'+code+'|'+type+'|'+String(v[12]||'');
      const id='s'+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,signature)
        .slice(0,16).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
      const fields={
        eventTime:datetime,eventDate:datetime.substring(0,10),timeKnown:known||Boolean(fallback),
        daCode:code,driverName:String(v[1]||''),vendor:String(v[3]||''),type:type,
        status:String(v[11]||''),photoFront:String(v[12]||''),photoLeft:String(v[13]||''),
        photoRight:String(v[14]||''),photoBack:String(v[15]||''),source:'google_sheet'
      };
      // Optional: the Google Form must first add "Vehicle Plate" (exact
      // plate ID only) to Mobile Attendance; no automatic assignment without it.
      if(vehicleIndex>=0){
        const vehicleId=String(v[vehicleIndex]||'').trim().toUpperCase().replace(/[\s-]+/g,'');
        if(vehicleId){
          if(!/^[A-Z0-9]{4,12}$/.test(vehicleId)){
            console.warn('Érvénytelen kiválasztott rendszám, sor: '+(first+i));
            continue;
          }
          fields.vehicleId=vehicleId;
        }
      }
      const odometerIndex=type==='Log In'
        ? (pickupIndex>=0?pickupIndex:sharedOdometerIndex)
        : (returnIndex>=0?returnIndex:sharedOdometerIndex);
      if(odometerIndex>=0){
        const odometer=parseAttendanceOdometer(r[odometerIndex],v[odometerIndex]);
        if(odometer!==null){
          fields[type==='Log In'?'pickupOdometer':'returnOdometer']=odometer;
        }else if(String(v[odometerIndex]||'').trim()){
          console.warn('Hibás kilométeróra-adat, sor: '+(first+i));
        }
      }
      const firestoreFields={};
      for(const key in fields){
        const value=fields[key];
        firestoreFields[key]=typeof value==='boolean'?{booleanValue:value}:
          typeof value==='number'?{integerValue:String(value)}:{stringValue:value};
      }
      writes.push({update:{name:'projects/'+DEPO_PROJECT_ID+'/databases/(default)/documents/attendance/'+id,fields:firestoreFields}});
    }
    const endpoint='https://firestore.googleapis.com/v1/projects/'+DEPO_PROJECT_ID+'/databases/(default)/documents:commit';
    for(let i=0;i<writes.length;i+=200){
      const response=UrlFetchApp.fetch(endpoint,{
        method:'post',contentType:'application/json',
        headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
        payload:JSON.stringify({writes:writes.slice(i,i+200)}),
        muteHttpExceptions:true
      });
      if(response.getResponseCode()>=300)throw Error('Firestore '+response.getResponseCode()+': '+response.getContentText().slice(0,450));
    }
    props.setProperty(DEPO_WATERMARK,String(last+1));
    console.log('Szinkronizált sorok: '+raw.length+' / mentett események: '+writes.length);
  }finally{lock.releaseLock();}
}
function parseAttendanceOdometer(raw,display){
  // Only an exact nonnegative integer is accepted. Never round an odometer,
  // interpret a decimal as a thousands separator or fabricate a missing value.
  if(raw===undefined||raw===null||raw==='')return null;
  if(typeof raw==='number'){
    return Number.isSafeInteger(raw)&&raw>=0&&raw<=100000000?raw:null;
  }
  const s=String(display??raw).trim().replace(/[ \u00a0\u202f]/g,'');
  if(!/^\d{1,9}$/.test(s))return null;
  const number=Number(s);
  return Number.isSafeInteger(number)&&number<=100000000?number:null;
}
function formatDisplayTimestamp(s){
  // A Google Forms MM/DD/YYYY vagy M/D/YYYY formátumot írhat ki.
  // Nem fogadunk el idő nélküli, érvénytelen vagy kétértelműen feldolgozott eseményt.
  const x=String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
  if(!x)return '';
  const month=Number(x[1]),day=Number(x[2]),year=Number(x[3]);
  let hour=Number(x[4]);const minute=Number(x[5]),second=Number(x[6]||0);
  if(year<2000||year>2100||month<1||month>12||day<1||day>31||minute>59||second>59)return '';
  if(x[7]){if(hour<1||hour>12)return '';hour=hour%12+(x[7].toUpperCase()==='PM'?12:0);}
  else if(hour>23)return '';
  const dt=new Date(Date.UTC(year,month-1,day));
  if(dt.getUTCFullYear()!==year||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==day)return '';
  const p=n=>String(n).padStart(2,'0');
  return year+'-'+p(month)+'-'+p(day)+'T'+p(hour)+':'+p(minute)+':'+p(second);
}
function installFiveMinuteTrigger(){
  ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()==='syncAttendance').forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('syncAttendance').timeBased().everyMinutes(5).create();
}
function resetAttendanceImport(){
  // Csak adminisztrátori kézi újraimport: a következő futás az 2. sortól dolgoz.
  PropertiesService.getScriptProperties().setProperty(DEPO_WATERMARK,'2');
}
