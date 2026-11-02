import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const file of ['quota-emulator.test.mjs','quota-abuse-emulator.test.mjs','app-check-emulator.test.mjs']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
