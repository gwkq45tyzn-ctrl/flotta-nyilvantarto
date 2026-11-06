// Loopback emulator only; creates NO real Firebase users or staging cloud data.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
const project='demo-imile-qa',base='http://127.0.0.1:8787/v1/projects/'+project+'/databases/(default)/documents';
const output=process.argv[2];if(!output)throw Error('A private local artifact output path is required.');
async function request(url,body,owner=false){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(owner?{Authorization:'Bearer owner'}:{})},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error('Local emulator request failed: '+response.status);return value;}
const value=x=>typeof x==='string'?{stringValue:x}:typeof x==='boolean'?{booleanValue:x}:{integerValue:String(x)};
const fields=obj=>Object.fromEntries(Object.entries(obj).map(([key,x])=>[key,value(x)]));
const docs=[],users=[];
for(const role of ['admin','editor','viewer']){
 const email=role+'@example.invalid',password=randomBytes(24).toString('base64url');
 const account=await request('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',{email,password,returnSecureToken:true});
 users.push({role,email,password,uid:account.localId});docs.push(['users/'+account.localId,{name:'Synthetic '+role,role,active:true}]);
}
for(const [id,capacity]of [['QA_DRIVER_1',100],['QA_DRIVER_2',80]])docs.push(['drivers/'+id,{daCode:id,name:'SYNTHETIC '+id,vendor:'QA',capacity,active:true}]);
for(const plate of ['QACAR01','QACAR02'])docs.push(['vehicles/'+plate,{plate,model:'SYNTHETIC QA',status:'Elérhető'}]);
const date='2099-02-01';
docs.push(['demands/'+date+'__IX.',{date,district:'IX.',newCount:120,retryCount:30}],['demands/'+date+'__X.',{date,district:'X.',newCount:0,retryCount:0}],['bookings/'+date+'__QACAR01',{date,district:'IX.',driverId:'QA_DRIVER_1',vehicleId:'QACAR01',status:'planned',capacity:100}],['driverClaims/'+date+'__QA_DRIVER_1',{date,driverId:'QA_DRIVER_1',bookingId:date+'__QACAR01'}]);
await request(base+':commit',{writes:docs.map(([name,data])=>({update:{name:base.slice(base.indexOf('projects/'))+'/'+name,fields:fields(data)}}))},true);
fs.writeFileSync(output,JSON.stringify({project,users},null,2));
console.log('Seeded local emulator: 3 synthetic roles, 2 drivers, 2 cars, shortage50, known zero demand. Credentials are local-only and not logged.');
