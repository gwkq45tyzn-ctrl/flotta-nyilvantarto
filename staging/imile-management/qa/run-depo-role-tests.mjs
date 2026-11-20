import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'imile-emulator-roles-'));
const credentials=path.join(directory,'credentials.json'),report=path.join(directory,'results.json');
try{
 for(const [file,args]of [['seed-depo-e2e.mjs',[credentials]],['depo-role-tests.mjs',[credentials,report]]]){
  const result=spawnSync(process.execPath,[path.join(import.meta.dirname,file),...args],{stdio:'inherit'});if(result.status!==0)throw Error('Local role emulator workflow failed: '+file);
 }
}finally{
 for(const file of [credentials,report])if(fs.existsSync(file))fs.unlinkSync(file);
 fs.rmdirSync(directory);
}
