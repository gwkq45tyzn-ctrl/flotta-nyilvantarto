// Read-only; OAuth stays in memory. No enable/create/deploy/IAM mutation calls.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {inspectPilot} from './pilot-preflight.mjs';
if(!process.env.FIREBASE_TOOLS_AUTH_MODULE)throw Error('EXISTING_FIREBASE_CLI_AUTH_MODULE_REQUIRED');
const require=createRequire(import.meta.url),auth=require(process.env.FIREBASE_TOOLS_AUTH_MODULE);
try{
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error();
 const token=await auth.getAccessToken(account.tokens.refresh_token,account.tokens.scopes);
 const result=await inspectPilot(async(url,body)=>{
  const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},...body?{body:JSON.stringify(body)}:{}});
  return {http:r.status,data:await r.json()};
 });
 const output=process.argv[2];if(!output)throw Error();
 await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({decision:result.decision,blockers:result.blockers,billingEnabled:result.billingEnabled,bucketCount:result.bucketCount,firestoreRegion:result.firestoreRegion,evidenceCount:result.evidence.length}));
}catch{console.error('READ_ONLY_PREFLIGHT_UNAVAILABLE: credentials and remote details redacted');process.exitCode=1;}
