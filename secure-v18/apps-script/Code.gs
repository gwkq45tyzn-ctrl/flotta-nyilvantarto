/** iMile Flotta v18.1. Private standalone Apps Script; never share this project. */
const FLOTTA = Object.freeze({version:'18.1',sessionSeconds:14400,maxChars:44000,bcryptCost:12});
function props_(){return PropertiesService.getScriptProperties();}
function cache_(){return CacheService.getScriptCache();}
function book_(){const id=props_().getProperty('FLOTTA_SHEET_ID');if(!id)throw Error('NOT_CONFIGURED');return SpreadsheetApp.openById(id);}
function digest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function random_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function pepper_(){const p=props_().getProperty('FLOTTA_PEPPER');if(!p)throw Error('NOT_CONFIGURED');return p;}
function secretInput_(password){return Utilities.base64Encode(Utilities.computeHmacSha256Signature(String(password),pepper_(),Utilities.Charset.UTF_8));}
function bcrypt_(){return dcodeIO.bcrypt;}
function salt_(){const bytes=Utilities.computeHmacSha256Signature(random_(),pepper_(),Utilities.Charset.UTF_8).slice(0,16).map(b=>b&255);return '$2a$'+FLOTTA.bcryptCost+'$'+bcrypt_().encodeBase64(bytes,16);}
function passwordHash_(password){return bcrypt_().hashSync(secretInput_(password),salt_());}
function passwordMatches_(password,hash){return bcrypt_().compareSync(secretInput_(password),hash);}
function username_(name){const s=String(name||'').trim().toLowerCase();if(!/^[a-z0-9._-]{3,40}$/.test(s))throw Error('INVALID_USERNAME');return s;}
function passwordValid_(p){return typeof p==='string'&&p.length>=12&&p.length<=128;}
function userKey_(name){return 'FLOTTA_USER_'+name;}
function user_(name){return JSON.parse(props_().getProperty(userKey_(name))||'null');}
function saveUser_(name,user){props_().setProperty(userKey_(name),JSON.stringify(user));}
function users_(){const p=props_().getProperties();return Object.keys(p).filter(k=>k.indexOf('FLOTTA_USER_')===0).map(k=>({username:k.slice(12),...JSON.parse(p[k])}));}
function addUser_(name,password,role){name=username_(name);if(user_(name))throw Error('USERNAME_EXISTS');if(!passwordValid_(password))throw Error('PASSWORD_POLICY');if(!['admin','editor'].includes(role))throw Error('FORBIDDEN');saveUser_(name,{hash:passwordHash_(password),role,enabled:true,revision:1,created:new Date().toISOString()});return name;}
/** Run from the owner-only editor after the owner enters BOOTSTRAP_PASSWORD. */
function initializeAdmin(){
 const owner=Session.getEffectiveUser().getEmail(),active=Session.getActiveUser().getEmail();
 if(!owner||active!==owner)throw Error('OWNER_ONLY');
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{if(users_().length)throw Error('ALREADY_CONFIGURED');
  const p=props_(),name=username_(p.getProperty('BOOTSTRAP_USERNAME')),password=p.getProperty('BOOTSTRAP_PASSWORD');
  if(!passwordValid_(password))throw Error('PASSWORD_POLICY');
  current_(); // Existing state must be readable; never seed an empty production database.
  if(!p.getProperty('FLOTTA_PEPPER'))p.setProperty('FLOTTA_PEPPER',random_()+random_());
  const admin={hash:passwordHash_(password),role:'admin',enabled:true,revision:1,created:new Date().toISOString()};
  const dummy=passwordHash_(random_());
  p.setProperties({[userKey_(name)]:JSON.stringify(admin),FLOTTA_DUMMY_HASH:dummy});
  p.deleteProperty('BOOTSTRAP_PASSWORD');p.deleteProperty('BOOTSTRAP_USERNAME');
  return 'Admin ready. Bootstrap password removed.';
 }finally{lock.releaseLock();}
}
function current_(){
 const sheet=book_().getSheetByName('_APP_STATE');if(!sheet)throw Error('STATE_MISSING');
 const row=sheet.getRange('A2:C2').getValues()[0];
 if(!row[2]||!Number.isSafeInteger(Number(row[0]))||Number(row[0])<1)throw Error('STATE_INVALID');
 const data=JSON.parse(row[2]);validateData_(data);
 return {version:Number(row[0]),requestId:String(row[1]||''),data};
}
function validateData_(data){
 if(!data||typeof data!=='object'||!['vehicles','fuelCards','drivers','contacts'].every(k=>Array.isArray(data[k])))throw Error('INVALID_DATA');
 for(const key of ['vehicles','fuelCards','drivers','contacts']){
  const seen=new Set();for(const item of data[key]){
   if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)||seen.has(item.id))throw Error('INVALID_RECORD');seen.add(item.id);
   for(const [field,value] of Object.entries(item)){
    if(field==='history'){if(value!=null&&(!Array.isArray(value)||value.some(h=>!h||typeof h!=='object'||Array.isArray(h)||Object.values(h).some(v=>v!==null&&typeof v==='object'))))throw Error('INVALID_DATA');}
    else if(value!==null&&typeof value==='object')throw Error('INVALID_DATA');
   }
  }
 }
 const json=JSON.stringify(data);if(json.length>FLOTTA.maxChars)throw Error('DATA_TOO_LARGE');
 function walk(x,depth){if(depth>12)throw Error('INVALID_DATA');if(x&&typeof x==='object')for(const k of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('INVALID_DATA');walk(x[k],depth+1);}}
 walk(data,0);return data;
}
function publicData_(data){const d=JSON.parse(JSON.stringify(data));d.fuelCards.forEach(c=>{delete c.pin;delete c.PIN;c.note=String(c.note||'').replace(/\bPIN\s*:\s*\S+/gi,'').trim();});return d;}
function sessionKey_(token){if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw Error('AUTH_REQUIRED');return 'FLOTTA_SESSION_'+digest_(token);}
function auth_(token){
 const key=sessionKey_(token),raw=cache_().get(key);if(!raw)throw Error('SESSION_EXPIRED');
 const s=JSON.parse(raw),u=user_(s.username);
 if(!u||!u.enabled||u.revision!==s.revision){cache_().remove(key);throw Error('ACCESS_REVOKED');}
 if(Date.now()>=s.expires){cache_().remove(key);throw Error('SESSION_EXPIRED');}
 return {username:s.username,role:u.role};
}
function login_(req){
 let name;try{name=username_(req.username);}catch(e){name='invalid';}
 const u=user_(name),p=props_(),failKey='FLOTTA_FAIL_'+(u?digest_(name):'unknown');
 const failure=JSON.parse(p.getProperty(failKey)||'{"count":0,"until":0}');
 if(failure.until>Date.now()&&failure.count>=6)throw Error('TOO_MANY_ATTEMPTS');
 const hash=u?u.hash:p.getProperty('FLOTTA_DUMMY_HASH');if(!hash)throw Error('NOT_CONFIGURED');
 const pass=passwordValid_(req.password)&&passwordMatches_(req.password,hash);
 if(!u||!u.enabled||!pass){p.setProperty(failKey,JSON.stringify({count:failure.until>Date.now()?failure.count+1:1,until:Date.now()+900000}));throw Error('INVALID_CREDENTIALS');}
 p.deleteProperty(failKey);
 const token=digest_(secretInput_(random_())),expires=Date.now()+FLOTTA.sessionSeconds*1000;
 cache_().put(sessionKey_(token),JSON.stringify({username:name,revision:u.revision,expires}),FLOTTA.sessionSeconds);
 return {ok:true,token,user:{username:name,role:u.role},expires};
}
function literal_(v){return {userEnteredValue:{stringValue:v===undefined||v===null?'':String(v)}};}
function mirrorRequests_(data,previous){
 const book=book_(),cardSheet=book.getSheetByName('Tankolókártyák');if(!cardSheet)throw Error('STATE_INVALID');
 const existing=cardSheet.getDataRange().getValues(),formula=cardSheet.getDataRange().getFormulas(),protectedCards=Object.create(null);
 const oldCardNumbers=new Map(previous.fuelCards.map(c=>[c.id,String(c.number)]));
 for(let i=1;i<existing.length;i++){
  const number=String(existing[i][0]||'');if(!number)continue;
  protectedCards[number]=formula[i]&&formula[i][3]?{userEnteredValue:{formulaValue:formula[i][3]}}:literal_(existing[i][3]);
 }
 const parts=[
  ['Járművek',11,data.vehicles.map(v=>[v.rendszam,[v.gyartmany,v.modell].filter(Boolean).join(' '),v.currentDriver,v.berbeado,v.helyszin,v.status,v.gumicsere,v.muszakiLejarat,v.kovetkezoSzervizDatum,v.megjegyzes,v.alvazszam].map(literal_))],
  ['Tankolókártyák',6,data.fuelCards.map(c=>[literal_(c.number),literal_(c.provider),literal_(c.vehicle),protectedCards[oldCardNumbers.get(c.id)]||protectedCards[String(c.number)]||literal_(''),literal_(c.status),literal_(c.note)])],
  ['Kapcsolatok',3,data.contacts.map(c=>[c.ceg,c.nev,c.telefon].map(literal_))]
 ];
 return parts.flatMap(([name,width,rows])=>{const sheet=book.getSheetByName(name);if(!sheet)throw Error('STATE_INVALID');const n=Math.max(sheet.getLastRow()-1,rows.length);if(!n)return [];return [{updateCells:{range:{sheetId:sheet.getSheetId(),startRowIndex:1,endRowIndex:n+1,startColumnIndex:0,endColumnIndex:width},rows:rows.map(values=>({values})),fields:'userEnteredValue'}}];});
}
function saveData_(req,who){
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(String(req.requestId||'')))throw Error('INVALID_REQUEST');
 const old=current_(),key='FLOTTA_RECEIPT_'+digest_(who.username+'|'+req.requestId),receipt=cache_().get(key);
 if(receipt)return JSON.parse(receipt);
 if(old.requestId===req.requestId)return {ok:true,version:old.version,requestId:req.requestId};
 if(!Number.isSafeInteger(req.baseVersion)||req.baseVersion!==old.version)return {ok:false,error:'CONFLICT',conflict:true,version:old.version};
 const incoming=validateData_(JSON.parse(JSON.stringify(req.data))),data={...old.data,...incoming};
 for(const key of ['vehicles','fuelCards','drivers','contacts']){const previous=new Map(old.data[key].map(x=>[x.id,x]));data[key]=incoming[key].map(x=>({...previous.get(x.id),...x}));}
 // Fields deliberately not sent to the browser remain in the authoritative state.
 for(const c of data.fuelCards){const previous=old.data.fuelCards.find(x=>x.id===c.id);if(previous){for(const k of ['pin','PIN'])if(Object.prototype.hasOwnProperty.call(previous,k))c[k]=previous[k];const pins=String(previous.note||'').match(/\bPIN\s*:\s*\S+/gi);if(pins)c.note=String(c.note||'').replace(/\bPIN\s*:\s*\S+/gi,'').trim()+' '+pins.join(' ');}}
 validateData_(data);
 const stateSheet=book_().getSheetByName('_APP_STATE'),next=old.version+1;
 const requests=mirrorRequests_(publicData_(data),old.data);
 requests.push({updateCells:{range:{sheetId:stateSheet.getSheetId(),startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:3},rows:[{values:[{userEnteredValue:{numberValue:next}},literal_(req.requestId),literal_(JSON.stringify(data))]}],fields:'userEnteredValue'}});
 // Sheets batchUpdate is atomic: all mirrors and the version commit together.
 Sheets.Spreadsheets.batchUpdate({requests},book_().getId());
 const result={ok:true,version:next,requestId:req.requestId};cache_().put(key,JSON.stringify(result),21600);return result;
}
/** The only browser RPC entry point. Every data operation verifies a session. */
function fleetRpc(req){
 let lock;
 try{
  if(!req||typeof req!=='object'||Array.isArray(req)||JSON.stringify(req).length>100000)throw Error('INVALID_REQUEST');
  if(req.action==='ping')return {ok:true,secure:true,version:FLOTTA.version,setup:users_().length>0};
  lock=LockService.getScriptLock();if(!lock.tryLock(25000))throw Error('DATABASE_BUSY');
  if(req.action==='login')return login_(req);
  const who=auth_(req.token);
  if(req.action==='logout'){cache_().remove(sessionKey_(req.token));return {ok:true};}
  if(req.action==='read'){const s=current_();return {ok:true,...s,data:publicData_(s.data),user:who};}
  if(req.action==='whoami')return {ok:true,user:who};
  if(req.action==='save')return saveData_(req,who);
  if(req.action==='changePassword'){
   const u=user_(who.username);if(!passwordValid_(req.oldPassword)||!passwordMatches_(req.oldPassword,u.hash))throw Error('INVALID_CREDENTIALS');
   if(!passwordValid_(req.password))throw Error('PASSWORD_POLICY');u.hash=passwordHash_(req.password);u.revision++;saveUser_(who.username,u);return {ok:true};
  }
  if(who.role!=='admin')throw Error('FORBIDDEN');
  if(req.action==='users')return {ok:true,users:users_().map(u=>({username:u.username,role:u.role,enabled:u.enabled}))};
  if(req.action==='addUser'){addUser_(req.username,req.password,'editor');return {ok:true};}
  if(req.action==='setUserEnabled'){
   const name=username_(req.username),u=user_(name);if(!u||u.role==='admin')throw Error('CANNOT_DISABLE_ADMIN');if(typeof req.enabled!=='boolean')throw Error('INVALID_REQUEST');
   u.enabled=req.enabled;u.revision++;saveUser_(name,u);return {ok:true};
  }
  throw Error('UNKNOWN_ACTION');
 }catch(err){const code=String(err.message||'');return {ok:false,error:/^[A-Z_]+$/.test(code)?code:'SERVER_ERROR'};}
 finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function doGet(e){
 if(e&&e.parameter&&Object.keys(e.parameter).some(k=>!['lang','v'].includes(k)))return ContentService.createTextOutput(JSON.stringify({ok:false,error:'AUTH_REQUIRED'})).setMimeType(ContentService.MimeType.JSON);
 return HtmlService.createHtmlOutputFromFile('Index').setTitle('iMile Flotta / Fleet').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function doPost(){return ContentService.createTextOutput(JSON.stringify({ok:false,error:'AUTH_REQUIRED'})).setMimeType(ContentService.MimeType.JSON);}
