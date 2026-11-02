import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function checkProductionEntry({baseSha,head='HEAD',cwd=process.cwd(),fetchBase=true}={}){
 if(typeof baseSha!=='string'||!/^[a-f0-9]{40}$/.test(baseSha)||/^0+$/.test(baseSha))throw Error('PROTECTED_BASE_SHA_REQUIRED');
 if(fetchBase)execFileSync('git',['fetch','--no-tags','origin',baseSha],{cwd,stdio:'inherit'});
 try{execFileSync('git',['diff','--exit-code',baseSha,head,'--','index.html','features'],{cwd,stdio:'pipe'});}
 catch(e){if(e.status===1)throw Error('PROTECTED_FLOTTA_ENTRY_CHANGED');throw e;}
 return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 checkProductionEntry({baseSha:process.env.PROTECTED_BASE_SHA});
 console.log('PASS: production Fleet entry/features unchanged relative to this change base; no moving-main comparison');
}
