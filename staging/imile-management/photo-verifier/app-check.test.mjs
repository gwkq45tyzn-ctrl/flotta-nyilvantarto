import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {verifyLocalAttestation,localAttestationRuntime,verifyAttestation,QA_APP_ID,WEB_APP_ID} from './app-check.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pub=publicKey.export({type:'spki',format:'pem'}),now=Date.now(),seconds=Math.floor(now/1000);
const base={iss:'urn:imile:synthetic-local-appcheck',aud:['projects/demo-imile-quota'],sub:QA_APP_ID,app_id:QA_APP_ID,iat:seconds,exp:seconds+300};
function token(p={},h={}){const s=[{alg:'RS256',kid:'synthetic-local-v1',...h},{...base,...p}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return s+'.'+sign('RSA-SHA256',Buffer.from(s),privateKey).toString('base64url');}
test('local signed proof accepted with exact demo/app audience',()=>assert.equal(verifyLocalAttestation(token(),pub,{now}).appId,QA_APP_ID));
for(const [name,p,h]of [['expired',{exp:seconds-1}],['future',{iat:seconds+60}],['wrong-app',{sub:'other'}],['wrong-project',{aud:['projects/production']}],['wrong-issuer',{iss:'other'}],['excessive-lifetime',{exp:seconds+1000}],['algorithm',{}, {alg:'none'}],['kid',{}, {kid:'other'}]])
 test(name+' proof denied',()=>assert.throws(()=>verifyLocalAttestation(token(p,h),pub,{now})));
test('tampered bytes denied',()=>assert.throws(()=>verifyLocalAttestation(token().slice(0,-8)+'abcdefgh',pub,{now})));
test('missing/malformed/oversized proofs denied',()=>{for(const s of [undefined,'x','a'.repeat(9000)])assert.throws(()=>verifyLocalAttestation(s,pub,{now}));});
test('test authority gated to exact demo and loopback emulators',()=>{
 const env={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-imile-quota',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8888',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9398'};
 assert.ok(localAttestationRuntime(env));for(const patch of [{GCLOUD_PROJECT:'imile-management-staging'},{FUNCTIONS_EMULATOR:'false'},{FIRESTORE_EMULATOR_HOST:'cloud:443'},{GCLOUD_PROJECT:'demo-other'}])assert.equal(localAttestationRuntime({...env,...patch}),false);
});
test('server app allowlist matches public Firebase config',async()=>assert.ok((await readFile(new URL('../../../depokapacitas/firebase-config.js',import.meta.url),'utf8')).includes(WEB_APP_ID)));
test('production rejects local authority config before any remote SDK verification',async()=>{
 const prior=process.env.ATTENDANCE_QA_APPCHECK_PUBLIC_KEY,emulator=process.env.FUNCTIONS_EMULATOR;
 process.env.ATTENDANCE_QA_APPCHECK_PUBLIC_KEY=Buffer.from(pub).toString('base64');process.env.FUNCTIONS_EMULATOR='false';
 try{await assert.rejects(()=>verifyAttestation({app:{appId:WEB_APP_ID},rawRequest:{headers:{'x-firebase-appcheck':token()}}},null));}
 finally{if(prior===undefined)delete process.env.ATTENDANCE_QA_APPCHECK_PUBLIC_KEY;else process.env.ATTENDANCE_QA_APPCHECK_PUBLIC_KEY=prior;if(emulator===undefined)delete process.env.FUNCTIONS_EMULATOR;else process.env.FUNCTIONS_EMULATOR=emulator;}
});
test('callable enforcement separate from private verifier and browser has no test bypass',async()=>{
 const call=await readFile(new URL('quota-callable.mjs',import.meta.url),'utf8'),browser=await readFile(new URL('../attendance/app-check.mjs',import.meta.url),'utf8');
 assert.match(call,/enforceAppCheck:true/);assert.doesNotMatch(call,/consumeAppCheckToken:true/);
 assert.match(browser,/ReCaptchaEnterpriseProvider/);assert.doesNotMatch(browser,/DEBUG_TOKEN|CustomProvider|127\.0\.0\.1/);
});
