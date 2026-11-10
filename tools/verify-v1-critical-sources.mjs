/**
 * V1 FAIL-CLOSED source presence/integrity preflight for a PR candidate.
 *
 * In 2026-11-06 a proposed Grok security branch contained the literal text
 * "PLACEHOLDER" instead of the full restricted Rules (11 bytes), and a
 * 61-byte placeholder instead of the Fleet bridge. These are NOT executable
 * security protections. This gate prevents accepting those missing sources
 * as a release candidate merely because unrelated tests are green.
 *
 * IMPORTANT: Structural check only. A PASS cannot prove rule semantics,
 * source provenance, correctness, readiness for release, or authorization.
 * Required: signed-in DIRECT-SDK positive/negative Firestore emulator tests,
 * frozen SHA/CI, independent approvals and explicit owner consent.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const CRITICAL_V1_SOURCES=Object.freeze({
  'depokapacitas/firestore-v1-restricted.rules':Object.freeze({
    minimumUtf8Bytes:40000,
    signatures:Object.freeze([
      "rules_version = '2'",
      'service cloud.firestore',
      'match /flottaSharedState/',
      'match /bookings/',
      'match /driverClaims/',
      'flottaMigrationApproval',
      'migrationSourceSha256',
      'REPLACE_WITH_REAL_SHARED_UID'
    ])
  }),
  'features/firestore-bridge.js':Object.freeze({
    minimumUtf8Bytes:18000,
    signatures:Object.freeze([
      'firebase.firestore()',
      'async function verifyMigrationApproval',
      'function startListener',
      'migrationSourceSha256',
      'normalizedPlate',
      'snapshot()'
    ])
  }),
  'index.html':Object.freeze({
    minimumUtf8Bytes:100000,
    signatures:Object.freeze([
      'function snapshot()',
      'vehicles',
      'drivers',
      'fuelCards',
      'contacts',
      'features/firestore-bridge.js'
    ])
  })
});

const isPlaceholder=x=>/^(?:PLACEHOLDER(?:[_\s-]|$)|REPLACE_ME(?:[_\s-]|$)|TODO(?:[_\s:-]|$)|WILL_BE_REPLACED(?:[_\s-]|$))/i.test(x.trimStart());

export function auditCriticalSource(path,source){
  const config=CRITICAL_V1_SOURCES[path];
  if(!config)throw new RangeError('Unknown V1 critical source '+path);
  const errors=[];
  if(typeof source!=='string'||!source.trim()){
    return {path,valid:false,errors:['MISSING_OR_EMPTY_SOURCE'],utf8Bytes:0};
  }
  const bytes=Buffer.byteLength(source,'utf8');
  if(isPlaceholder(source))errors.push('PLACEHOLDER_SOURCE');
  if(bytes<config.minimumUtf8Bytes)
    errors.push('TRUNCATED_OR_UNREVIEWED_SOURCE');
  for(const signature of config.signatures){
    if(!source.includes(signature))
      errors.push('MISSING_REQUIRED_STRUCTURE: '+signature);
  }
  return {path,valid:errors.length===0,errors,utf8Bytes:bytes};
}

export function auditV1CriticalSources(reader){
  if(typeof reader!=='function')throw new TypeError('Provide a text source reader');
  const files=Object.keys(CRITICAL_V1_SOURCES).map(path=>{
    try{return auditCriticalSource(path,reader(path));}
    catch(error){
      return {path,valid:false,errors:['SOURCE_READ_FAILED: '+error.code || 'UNKNOWN'],utf8Bytes:0};
    }
  });
  return {
    status:files.every(x=>x.valid)?'STRUCTURE_PRESENT_ONLY':'BLOCKED',
    files,
    releaseAuthorized:false,
    productionRulesValidated:false,
    emulatorSecurityProven:false,
    notice:'Non-semantic minimum source preflight only; a passing check is never evidence of Firestore Rules safety, #133 P0 closure, or permission to deploy.'
  };
}

export function auditLocalV1CriticalSources(){
  return auditV1CriticalSources(path=>
    readFileSync(new URL('../'+path,import.meta.url),'utf8'));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=auditLocalV1CriticalSources();
  for(const f of result.files)
    console.log((f.valid?'SOURCE PRESENT':'SOURCE BLOCKED')+' '+f.path+
      ' ('+f.utf8Bytes+' bytes) '+f.errors.join('; '));
  console.log(result.status+': '+result.notice);
  if(result.status!=='STRUCTURE_PRESENT_ONLY')process.exitCode=1;
}
