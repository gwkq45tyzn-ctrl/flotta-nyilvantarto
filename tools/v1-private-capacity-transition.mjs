/**
 * iMile Fleet/Depot: read-only, LOCAL owner capacity transition proof.
 * Five private files: two A2:C2 source captures, saved ORIGINAL rich C2 JSON,
 * owner-reviewed CANDIDATE rich JSON and individual active-driver decisions.
 *
 * Only explicitly reviewed capacity fields on current active drivers may
 * differ from original. Every other private field and nested history MUST be
 * preserved. No browser, Firestore, Apps Script, network, write or deployment.
 * The owner-controlled input/decisions still are NOT independent authority.
 *
 * node tools/v1-private-capacity-transition.mjs \
 *   --first /private/first.tsv --second /private/second.tsv \
 *   --original /private/original.json --candidate /private/reviewed.json \
 *   --decisions /private/owner-decisions.json [--json]
 */
import {lstatSync,readFileSync} from 'node:fs';
import {TextDecoder} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessPrivateAppStateReadbacks}
  from './v1-private-appstate-double-readback.mjs';
import {assessPrivateFleetExport} from './v1-owner-readiness-cli.mjs';
import {prepareReviewedCourierCapacities} from './v1-capacity-remediation.mjs';
import {sha256} from './v1-migration-dryrun.mjs';

const MAX_SOURCE_BYTES=1_200_000,MAX_DECISIONS_BYTES=64*1024;
export const CAPACITY_TRANSITION_SCHEMA='imile-v1-private-capacity-transition-1';
const active=s=>typeof s==='string'&&
  ['aktiv','aktív'].includes(s.trim().toLowerCase());
const normDA=s=>typeof s==='string'?s.trim().toUpperCase():'';

function verdict(reasons,extra={}){
  const sorted=[...new Set(reasons)].sort();
  return {
    schema:CAPACITY_TRANSITION_SCHEMA,
    locallyProvenOnlyReviewedCapacitiesChanged:sorted.length===0,
    reasons:sorted,
    readbackStable:false,originalFileMatchesReadback:false,
    allActiveDriversIndividuallyReviewed:false,
    fullRichCandidateMatchesExpected:false,
    candidateOperationalReadiness:false,
    statusReviewWarnings:[],
    counts:null,
    ...extra,
    originalPrivatelyPinned:false,
    actualLiveSourceAuthorityVerified:false,
    pendingBrowserEditsReconciled:false,
    reviewedDecisionsAuthenticated:false,
    independentlyRestorableBackupVerified:false,
    legacyAppsScriptWritersVerifiedStopped:false,
    actualFirebaseIamVerified:false,
    firestoreEncodedSizeVerified:false,
    productionReleaseAuthorized:false,
    authorizedForImport:false,
    noCloudWrites:true
  };
}
function parseStrictJson(s){
  if(typeof s!=='string'||!s||Buffer.byteLength(s,'utf8')>MAX_SOURCE_BYTES)
    throw Error('PRIVATE_JSON_INVALID');
  return JSON.parse(s);
}

export function assessPrivateCapacityTransition({
  firstText,secondText,originalText,candidateText,decisionsText
}={}){
  let source;
  const readback=assessPrivateAppStateReadbacks(firstText,secondText,originalText);
  if(!readback.localReadbackAndSavedBytesConsistent)
    return verdict(['ORIGINAL_READBACK_OR_SAVED_BYTES_DENIED'],{
      readbackStable:readback.revisionMatched&&readback.timestampMatched&&
        readback.sourceCellBytesMatched,
      originalFileMatchesReadback:readback.savedExportBytesMatched,
      counts:readback.counts||null
    });
  try{source=parseStrictJson(originalText);}
  catch{return verdict(['ORIGINAL_JSON_INVALID']);}
  let candidate,decisions;
  try{candidate=parseStrictJson(candidateText);}
  catch{return verdict(['CANDIDATE_JSON_INVALID'],{
    readbackStable:true,originalFileMatchesReadback:true
  });}
  try{decisions=parseStrictJson(decisionsText);}
  catch{return verdict(['DECISIONS_JSON_INVALID'],{
    readbackStable:true,originalFileMatchesReadback:true
  });}

  // No implicit 70, 80 or any inherited capacity approval: this stronger
  // owner transition gate demands one explicit decision for EVERY active DA,
  // including drivers who already had a valid capacity.
  const activeDrivers=Array.isArray(source?.drivers)?
    source.drivers.filter(d=>d&&active(d.status)):[];
  const expectedDA=new Set(activeDrivers.map(d=>normDA(d.daCode)));
  const reviews=Array.isArray(decisions)?decisions:[];
  const reviewedDA=new Set();
  let complete=Array.isArray(decisions)&&
    reviews.length===activeDrivers.length&&
    expectedDA.size===activeDrivers.length;
  for(const d of reviews){
    const id=normDA(d?.daCode);
    if(!d||typeof d!=='object'||Array.isArray(d)||
       Object.keys(d).sort().join(',')!=='daCode,kapacitas,reviewed'||
       d.reviewed!==true||!Number.isSafeInteger(d.kapacitas)||
       d.kapacitas<1||d.kapacitas>10000||!expectedDA.has(id)||
       reviewedDA.has(id))complete=false;
    reviewedDA.add(id);
  }
  if(reviewedDA.size!==expectedDA.size)complete=false;
  if(!complete)return verdict(['MISSING_OR_INVALID_INDIVIDUAL_ACTIVE_DRIVER_REVIEW'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:false,
    counts:readback.counts
  });
  let expected;
  try{expected=prepareReviewedCourierCapacities(source,decisions);}
  catch{return verdict(['CAPACITY_REMEDIATION_PRIVATE_PREFLIGHT_FAILED'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true
  });}
  if(!expected.ok)return verdict(['CAPACITY_REMEDIATION_DENIED'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true,
    counts:readback.counts
  });
  let exact=false;
  try{exact=sha256(candidate)===sha256(expected.candidate);}
  catch{return verdict(['RICH_CANDIDATE_CANONICALIZATION_FAILED'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true
  });}
  if(!exact)return verdict(['UNREVIEWED_RICH_FIELD_CHANGE_OR_CAPACITY_DRIFT'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true,
    fullRichCandidateMatchesExpected:false,
    counts:readback.counts
  });
  let state;
  try{state=assessPrivateFleetExport(candidate);}
  catch{return verdict(['CANDIDATE_PREFLIGHT_ERROR'],{
    readbackStable:true,originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true,
    fullRichCandidateMatchesExpected:true
  });}
  const reasons=[];
  if(!state.sourcePreflightOk)reasons.push('CANDIDATE_FULL_RICH_PREFLIGHT_DENIED');
  if(!state.operationallyReady)reasons.push('CANDIDATE_OPERATIONAL_CAPACITY_DENIED');
  return verdict(reasons,{
    readbackStable:true,
    originalFileMatchesReadback:true,
    allActiveDriversIndividuallyReviewed:true,
    fullRichCandidateMatchesExpected:true,
    candidateOperationalReadiness:state.operationallyReady,
    statusReviewWarnings:state.warnings,
    counts:{
      ...state.counts,
      activeReviewed:expected.counts.activeReviewed,
      capacitiesActuallyChanged:expected.counts.changed,
      activeMissingBefore:expected.counts.activeMissingBefore
    }
  });
}
function readPrivate(path,maxBytes){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||!Number.isSafeInteger(st.size)||
     st.size<1||st.size>maxBytes)throw Error('PRIVATE_FILE_DENIED');
  const b=readFileSync(path);
  if(b.length!==st.size)throw Error('PRIVATE_FILE_CHANGED');
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
}
function output(r,json){
  if(json){process.stdout.write(JSON.stringify(r,null,2)+'\n');return;}
  process.stdout.write([
    'iMile Flotta: PRIVÁT FUTÁRKAPACITÁS-ÁTMENET',
    'Eredeti 2x forrás és a mentés egyezik: '+(r.readbackStable&&
      r.originalFileMatchesReadback?'IGEN':'NEM'),
    'Összes aktív futár egyenként felülvizsgálva: '+
      (r.allActiveDriversIndividuallyReviewed?'IGEN':'NEM'),
    'Csak jóváhagyott kapacitás változott; rich adatok épek: '+
      (r.fullRichCandidateMatchesExpected?'IGEN':'NEM'),
    'Helyi adatátmenet: '+(r.locallyProvenOnlyReviewedCapacitiesChanged?'MEGFELEL':'STOP'),
    'Kizáró okok: '+(r.reasons.join(', ')||'nincs helyi eltérés'),
    'ÉLES IMPORT TILOS: független backup, aktuális éles forrás/írók, IAM, antirollback és kettős audit hiányzik.'
  ].join('\n')+'\n');
}
export function runPrivateCapacityTransition(argv=process.argv.slice(2)){
  const json=argv.includes('--json');
  const args=argv.filter(a=>a!=='--json');
  const allowed=['--first','--second','--original','--candidate','--decisions'];
  if(argv.filter(a=>a==='--json').length>1||args.length!==10){
    output(verdict(['INVALID_ARGUMENTS']),json);return 1;
  }
  const parsed={};
  for(let i=0;i<args.length;i+=2){
    const k=args[i],value=args[i+1];
    if(!allowed.includes(k)||Object.hasOwn(parsed,k)||!value||
       value.startsWith('-')){
      output(verdict(['INVALID_ARGUMENTS']),json);return 1;
    }
    parsed[k]=value;
  }
  if(allowed.some(k=>!parsed[k])){
    output(verdict(['INVALID_ARGUMENTS']),json);return 1;
  }
  const inputs={};
  for(const [flag,key,max] of [
    ['--first','firstText',MAX_SOURCE_BYTES],
    ['--second','secondText',MAX_SOURCE_BYTES],
    ['--original','originalText',MAX_SOURCE_BYTES],
    ['--candidate','candidateText',MAX_SOURCE_BYTES],
    ['--decisions','decisionsText',MAX_DECISIONS_BYTES]
  ]){
    try{inputs[key]=readPrivate(parsed[flag],max);}
    catch{output(verdict([key.toUpperCase()+'_PRIVATE_FILE_UNREADABLE']),json);return 1;}
  }
  let result;
  try{result=assessPrivateCapacityTransition(inputs);}
  catch{result=verdict(['LOCAL_PRIVATE_TRANSITION_FAILED']);}
  output(result,json);
  return result.locallyProvenOnlyReviewedCapacitiesChanged?0:2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=runPrivateCapacityTransition();
