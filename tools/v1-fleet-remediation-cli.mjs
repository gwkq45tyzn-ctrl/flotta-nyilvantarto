/**
 * V1 private Fleet preparation command. OFFLINE ONLY: no Firebase, Google or
 * network import. Audit source JSON or create a *non-authorized* candidate
 * from individually specified patches; NEVER patch the original in place.
 *
 * Examples (private file paths OUTSIDE the Git checkout):
 *   node tools/v1-fleet-remediation-cli.mjs audit --input /tmp/fleet.json
 *   node tools/v1-fleet-remediation-cli.mjs prepare --input /tmp/fleet.json \
 *     --patches /tmp/explicit-capacities.json --expected-sha <audit-sha> \
 *     --output /tmp/v1-candidate-private.json
 */
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {
  auditFleetSourceForImport,buildExplicitFleetRemediationCandidate
} from '../features/v1-fleet-source-remediation.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const MAX_PRIVATE_JSON_BYTES=2*1024*1024;
const FLAGS=new Set(['input','patches','expected-sha','output']);
const SHA=/^[a-f0-9]{64}$/;

function optionsOf(args){
  const o={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!key.startsWith('--')||!FLAGS.has(key.slice(2))||
       Object.hasOwn(o,key.slice(2)))throw Error('INVALID_OR_DUPLICATE_ARGUMENT');
    const value=args[++i];
    if(!value||value.startsWith('--'))throw Error('MISSING_ARGUMENT_VALUE');
    o[key.slice(2)]=value;
  }
  return o;
}
function privateJson(path){
  try{
    const n=statSync(path).size;
    if(n<=0||n>MAX_PRIVATE_JSON_BYTES)throw Error('PRIVATE_JSON_SIZE_DENIED');
    return JSON.parse(readFileSync(path,'utf8'));
  }catch(_){throw Error('PRIVATE_SOURCE_UNAVAILABLE_OR_NOT_JSON');}
}
function refuseRepoOutput(output){
  const full=resolve(output),rel=relative(REPO_ROOT,full);
  // A source candidate contains personal and vehicle data. Never create it
  // under Git checkout even when accidentally given a plausible file name.
  if(rel===''||(rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)))
    throw Error('PRIVATE_OUTPUT_MUST_BE_OUTSIDE_GIT_CHECKOUT');
  return full;
}
function redacted(audit){
  return {
    ready:audit.ready,
    originalSha256:audit.originalSha256,
    counts:audit.counts,
    missingCapacityCount:audit.missingCapacityIndices.length,
    unknownStatusCount:audit.unknownStatusIndices.length,
    sourcePreflightReady:audit.sourcePreflightReady,
    businessReady:audit.businessReady,
    projectionReady:audit.projectionReady,
    bookingWindowReady:audit.bookingWindowReady,
    issueReasons:audit.issues.map(issue=>issue.reason),
    authorizedForImport:false,
    ownerApprovalAuthenticated:false,productionIamVerified:false
  };
}
export function runPrivateFleetPreparation(argv){
  const [command,...args]=argv;
  if(!['audit','prepare'].includes(command))throw Error('UNKNOWN_COMMAND');
  const opts=optionsOf(args);
  if(!opts.input)throw Error('INPUT_REQUIRED');
  if(command==='audit'&&(opts.patches||opts.output))
    throw Error('AUDIT_IS_READ_ONLY');
  if(opts['expected-sha']&&!SHA.test(opts['expected-sha']))
    throw Error('EXPECTED_SHA_REQUIRED');
  if(command==='prepare'&&
     (!opts.patches||!opts.output||!opts['expected-sha']))
    throw Error('PRIVATE_PATCH_OUTPUT_AND_SHA_REQUIRED');
  // Before reading personal source, enforce the output location check.
  const dest=command==='prepare'?refuseRepoOutput(opts.output):null;
  const original=privateJson(opts.input);
  const audit=auditFleetSourceForImport(original);
  if(opts['expected-sha']&&audit.originalSha256!==opts['expected-sha'])
    throw Error('ORIGINAL_SOURCE_SHA_MISMATCH');
  if(command==='audit')return redacted(audit);
  const changes=privateJson(opts.patches);
  const candidate=buildExplicitFleetRemediationCandidate({
    original,expectedOriginalSha256:opts['expected-sha'],changes
  });
  // wx and owner-only permissions; no overwrite even if file already exists.
  try{
    writeFileSync(dest,JSON.stringify(candidate.candidate)+'\n',
      {encoding:'utf8',flag:'wx',mode:0o600});
  }catch(_){throw Error('PRIVATE_OUTPUT_CREATE_DENIED');}
  return {
    ready:true,counts:audit.counts,
    originalSha256:audit.originalSha256,
    candidateSha256:candidate.candidateSha256,
    patchedDriverCount:candidate.applied.length,
    writtenPrivateCandidate:true,
    ownerApprovalAuthenticated:false,
    authorizedForImport:false,productionSealAllowed:false
  };
}
function cli(){
  try{
    console.log(JSON.stringify(runPrivateFleetPreparation(process.argv.slice(2))));
  }catch(e){
    // Do not leak driver names, DAs, arbitrary JSON fields or file paths to
    // shell logs / CI on failures.
    console.error('V1_PRIVATE_SOURCE_DENIED: '+
      String(e.message||e).split(':')[0]);
    process.exitCode=2;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  cli();
