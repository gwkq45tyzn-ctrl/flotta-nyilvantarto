import fs from 'node:fs';
import assert from 'node:assert/strict';
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));assert.equal(fixture.project,'demo-imile-qa');
const base='http://127.0.0.1:8787/v1/projects/demo-imile-qa/databases/(default)/documents';
const report={environment:'local-emulator-only',tests:[]};
const tokens={};
for(const user of fixture.users){const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:user.password,returnSecureToken:true})});assert.ok(response.ok);tokens[user.role]=(await response.json()).idToken;}
const encode=obj=>Object.fromEntries(Object.entries(obj).map(([k,x])=>[k,typeof x==='string'?{stringValue:x}:typeof x==='boolean'?{booleanValue:x}:{integerValue:String(x)}]));
async function check(name,role,method,url,data,allow){const response=await fetch(url,{method,headers:{'Content-Type':'application/json',...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{})},...(data?{body:JSON.stringify(data)}:{})});const pass=allow?response.ok:response.status===403;report.tests.push({name,expected:allow?'ALLOW':'DENY',status:response.status,pass});if(!pass)console.error(name+': unexpected HTTP '+response.status);}
const ref=path=>base.slice(base.indexOf('projects/'))+'/'+path;
const demand={date:'2099-02-03',district:'SYNTHETIC_RULES',newCount:10,retryCount:2};
await check('admin operational read','admin','GET',base+'/demands',null,true);
await check('viewer operational read','viewer','GET',base+'/demands',null,true);
await check('anonymous operational read denied',null,'GET',base+'/demands',null,false);
await check('viewer demand write denied','viewer','PATCH',base+'/demands/2099-02-03__SYNTHETIC_RULES',{fields:encode(demand)},false);
await check('editor demand write allowed','editor','PATCH',base+'/demands/2099-02-03__SYNTHETIC_RULES',{fields:encode(demand)},true);
await check('viewer user list denied','viewer','GET',base+'/users',null,false);
await check('editor canonical vehicle write denied','editor','PATCH',base+'/vehicles/QACAR02',{fields:encode({plate:'QACAR02',model:'SYNTHETIC QA',status:'Elérhető'})},false);
const pair=(vehicleId,driverId,capacity)=>{const date='2099-02-01',id=date+'__'+vehicleId;return [{update:{name:ref('bookings/'+id),fields:encode({date,vehicleId,driverId,district:'IX.',status:'planned',capacity})}},{update:{name:ref('driverClaims/'+date+'__'+driverId),fields:encode({date,driverId,bookingId:id})}}];};
await check('double car with another driver denied','editor','POST',base+':commit',{writes:pair('QACAR01','QA_DRIVER_2',80)},false);
await check('double driver with another car denied','editor','POST',base+':commit',{writes:pair('QACAR02','QA_DRIVER_1',100)},false);
await check('viewer atomic booking denied','viewer','POST',base+':commit',{writes:pair('QACAR02','QA_DRIVER_2',80)},false);
await check('editor valid atomic pair allowed','editor','POST',base+':commit',{writes:pair('QACAR02','QA_DRIVER_2',80)},true);
await check('editor atomic booking cancellation allowed','editor','POST',base+':commit',{writes:[{delete:ref('bookings/2099-02-01__QACAR02')},{delete:ref('driverClaims/2099-02-01__QA_DRIVER_2')}]},true);
await check('editor demand cleanup allowed','editor','DELETE',base+'/demands/2099-02-03__SYNTHETIC_RULES',null,true);
report.passed=report.tests.filter(x=>x.pass).length;report.failed=report.tests.filter(x=>!x.pass).length;
fs.writeFileSync(process.argv[3]||process.argv[2]+'.results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
