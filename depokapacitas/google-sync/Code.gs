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
    const raw=sheet.getRange(first,1,last-first+1,16).getValues();
    const display=sheet.getRange(first,1,last-first+1,16).getDisplayValues();
    let writes=[];
    for(let i=0;i<raw.length;i++){
      const r=raw[i],v=display[i];
      const code=String(v[2]||'').trim().toUpperCase();
      const type=String(v[4]||'').trim();
      if(!code||!['Log In','Log Out'].includes(type))continue;
      const dateValue=r[0];
      const known=dateValue instanceof Date && !isNaN(dateValue.valueOf());
      const datetime=known?Utilities.formatDate(dateValue,DEPO_TZ,"yyyy-MM-dd'T'HH:mm:ss"):formatDisplayTimestamp(v[0]);
      if(!datetime)continue;
      const signature=datetime+'|'+code+'|'+type+'|'+String(v[12]||'');
      const id='s'+Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,signature)
        .slice(0,16).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
      const fields={
        eventTime:datetime,eventDate:datetime.substring(0,10),timeKnown:known,
        daCode:code,driverName:String(v[1]||''),vendor:String(v[3]||''),type:type,
        status:String(v[11]||''),photoFront:String(v[12]||''),photoLeft:String(v[13]||''),
        photoRight:String(v[14]||''),photoBack:String(v[15]||''),source:'google_sheet'
      };
      const firestoreFields={};
      for(const key in fields)firestoreFields[key]=typeof fields[key]==='boolean'?{booleanValue:fields[key]}:{stringValue:fields[key]};
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
function formatDisplayTimestamp(s){
  const x=String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(!x)return '';
  return x[3]+'-'+x[1].padStart(2,'0')+'-'+x[2].padStart(2,'0')+'T'+(x[4]?x[4].padStart(2,'0')+':'+x[5]+':'+(x[6]||'00'):'00:00:00');
}
function installFiveMinuteTrigger(){
  ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()==='syncAttendance').forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('syncAttendance').timeBased().everyMinutes(5).create();
}
function resetAttendanceImport(){
  // Csak adminisztrátori kézi újraimport: a következő futás az 2. sortól dolgoz.
  PropertiesService.getScriptProperties().setProperty(DEPO_WATERMARK,'2');
}
