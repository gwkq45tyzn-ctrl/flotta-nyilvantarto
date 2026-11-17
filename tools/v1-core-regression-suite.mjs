/** Exact-source core regression runner. Emulator-only tests are a required separate lane. */
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const emulator=[
  'tools/v1-keyed-write-readback.test.mjs',
  'tools/v1-scaled-fenced-migration.test.mjs',
  'tools/v1-stale-writer-multiprocess.test.mjs'
];
const mode=process.argv[2];
if(!['offline','emulator'].includes(mode))throw Error('EXPLICIT_REGRESSION_LANE_REQUIRED');
const all=['tools','depokapacitas','features'].flatMap(dir=>
  readdirSync(dir).filter(name=>name.endsWith('.test.mjs')).map(name=>dir+'/'+name)).sort();
for(const path of emulator)if(!all.includes(path))throw Error('MISSING_REQUIRED_EMULATOR_REGRESSION: '+path);
const files=mode==='offline'?all.filter(path=>!emulator.includes(path)):emulator;
if(mode==='emulator'&&process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787')
  throw Error('LOCAL_EMULATOR_REQUIRED');
console.log('REQUIRED '+mode+' regression lane: '+files.length+' test files; '+
  (mode==='offline'?'3 emulator files MUST run separately':'real local Firestore required'));
// Separate emulator executions avoid resource contention and preserve failure status.
for(const group of mode==='offline'?[files]:files.map(file=>[file])){
  const result=spawnSync(process.execPath,['--test',...group],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
