// Local synthetic authority, NEVER a Firebase debug token or service-account key.
import {generateKeyPairSync,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {QA_APP_ID} from './app-check.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const encoded=publicKey.export({type:'spki',format:'pem'}).toString();
const envFile=new URL('.env.local',import.meta.url);let prior;
try{prior=await readFile(envFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(prior)throw Error('QA_ENV_FILE_EXISTS');
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8181');
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
 if(url.pathname!=='/token'){res.writeHead(404);return res.end();}
 const variant=url.searchParams.get('variant'),now=Math.floor(Date.now()/1000);
 const payload={iss:'urn:imile:synthetic-local-appcheck',aud:['projects/demo-imile-quota'],
  sub:QA_APP_ID,app_id:QA_APP_ID,iat:now,exp:now+300};
 if(variant==='wrong-app')payload.sub=payload.app_id='1:1234567890:web:wrongapp';
 if(variant==='wrong-project')payload.aud=['projects/demo-other'];
 if(variant==='expired')payload.exp=now-10;
 if(variant==='future')payload.iat=now+3600;
 const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic-local-v1'})).toString('base64url');
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),data=head+'.'+body;
 const signature=sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
 const token=data+'.'+(variant==='bad-signature'?'a'.repeat(signature.length):signature);
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({token,expireTimeMillis:Date.now()+240000}));
});
await new Promise(resolve=>server.listen(8181,'127.0.0.1',resolve));
await writeFile(envFile,'ATTENDANCE_QA_APPCHECK_PUBLIC_KEY='+Buffer.from(encoded).toString('base64')+'\n');
const args=process.argv.slice(2);
if(!args.length)throw Error('EMULATOR_COMMAND_REQUIRED');
const child=process.env.FIREBASE_CLI_JS?
 spawn(process.execPath,[process.env.FIREBASE_CLI_JS,...args],{stdio:'inherit',env:process.env}):
 spawn('npx',['--yes','firebase-tools@15.34.2',...args],{stdio:'inherit',env:process.env});
const finish=async code=>{server.close();await unlink(envFile).catch(()=>{});process.exit(code??1);};
child.on('exit',finish);child.on('error',()=>finish(1));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
