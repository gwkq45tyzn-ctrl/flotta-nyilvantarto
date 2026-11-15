/**
 * Local-only Apps Script writer/cutover manifest ANALYZER (not production verification).
 * Consumes REDACTED metadata supplied by the owner, never endpoints, secrets or live data.
 * A clean owner SELF-DECLARATION is not independently authenticated evidence.
 * This file has no network client, credential, mutation or deployment functionality.
 */
export const CUTOVER_SCHEMA='imile-v1-local-legacy-cutover-1';
const COVERAGE=[
  'scriptProjects','deployedWebApps','staleBrowserClients','installedTriggers',
  'timeDrivenTriggers','sheetDestinations','firebaseDestinations','urlFetchWriters'
];
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,fields)=>plain(o)&&Object.keys(o).length===fields.length&&
  fields.every(f=>has(o,f));
const ref=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(s);
const cap=n=>Number.isSafeInteger(n)&&n>=0&&n<=1024;
const enums=(s,values)=>typeof s==='string'&&values.includes(s);
const array=a=>Array.isArray(a)&&a.length<=1024;
const flags={ownerEvidenceAuthenticated:false,liveDeploymentVerified:false,
  productionCutoverAuthorized:false,authorizedForImport:false,readOnly:true};

function result(reasons,counts){
  const issues=[...new Set(reasons)].sort();
  return {schema:CUTOVER_SCHEMA,locallyComplete:issues.length===0,
    noActiveFleetWriterClaimed:issues.length===0&&counts.activeFleetWriters===0,
    reasons:issues,counts,...flags};
}
const empty=()=>({projects:0,deployments:0,triggers:0,principals:0,
  destinations:0,activeFleetWriters:0,unknownStatus:0});
const validTimestamp=(v,now)=>{
  if(typeof v!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v))
    return false;
  const time=Date.parse(v);
  return Number.isFinite(time)&&new Date(time).toISOString()===v&&
    time<=now+5*60*1000&&now-time<=7*24*3600*1000;
};

export function assessAppsScriptCutoverEvidence(manifest,{now=Date.now()}={}){
  const reasons=[],counts=empty();
  const add=reason=>reasons.push(reason);
  if(!plain(manifest))return result(['MANIFEST_MISSING_OR_INVALID'],counts);
  const fields=['schemaVersion','capturedAt','ownerDeclaredComplete','coverage',
    'sourceSha256','principals','destinations','projects'];
  if(!exact(manifest,fields))add('MANIFEST_FIELDS_MISSING_OR_UNEXPECTED');
  if(manifest.schemaVersion!==CUTOVER_SCHEMA)add('UNSUPPORTED_MANIFEST_VERSION');
  if(!validTimestamp(manifest.capturedAt,now))add('OWNER_SNAPSHOT_STALE_OR_INVALID');
  if(manifest.ownerDeclaredComplete!==true)add('OWNER_COMPLETENESS_UNCONFIRMED');
  if(!/^[a-f0-9]{64}$/.test(manifest.sourceSha256??''))
    add('UNPINNED_SOURCE_FINGERPRINT');
  if(!exact(manifest.coverage,COVERAGE)||
    !COVERAGE.every(key=>manifest.coverage[key]===true))
    add('LEGACY_WRITER_SURFACES_NOT_ALL_REVIEWED');
  if(!array(manifest.principals)||manifest.principals.length===0)
    add('EXECUTION_PRINCIPAL_INVENTORY_MISSING');
  if(!array(manifest.destinations)||manifest.destinations.length===0)
    add('WRITE_DESTINATION_INVENTORY_MISSING');
  if(!array(manifest.projects)||manifest.projects.length===0)
    add('SCRIPT_PROJECT_INVENTORY_MISSING');
  if(!array(manifest.projects)||!array(manifest.principals)||
     !array(manifest.destinations))
    return result(reasons,counts);

  const principals=new Set(),destinations=new Set(),projects=new Set(),members=new Set();
  for(const p of manifest.principals){
    counts.principals++;
    if(!exact(p,['ref','identityReviewed'])||!ref(p.ref)||p.identityReviewed!==true)
      add('UNKNOWN_EXECUTION_PRINCIPAL');
    else if(principals.has(p.ref))add('DUPLICATE_EVIDENCE_REFERENCE');
    else principals.add(p.ref);
  }
  for(const d of manifest.destinations){
    counts.destinations++;
    if(!exact(d,['ref','kind','writeTargetReviewed'])||!ref(d.ref)||
       !enums(d.kind,['sheet','firebase','external'])||
       d.writeTargetReviewed!==true)add('UNKNOWN_WRITE_DESTINATION');
    else if(destinations.has(d.ref))add('DUPLICATE_EVIDENCE_REFERENCE');
    else destinations.add(d.ref);
  }
  for(const p of manifest.projects){
    counts.projects++;
    if(!exact(p,['ref','ownerPrincipalRef','deployments','triggers',
      'declaredNoDeployments','declaredNoTriggers'])||!ref(p.ref)){
      add('INVALID_PROJECT_INVENTORY');continue;
    }
    if(projects.has(p.ref))add('DUPLICATE_EVIDENCE_REFERENCE');
    else projects.add(p.ref);
    if(!principals.has(p.ownerPrincipalRef))add('UNKNOWN_EXECUTION_PRINCIPAL');
    if(!array(p.deployments)||!array(p.triggers)){
      add('INVALID_PROJECT_INVENTORY');continue;
    }
    if(p.deployments.length===0&&p.declaredNoDeployments!==true)
      add('UNVERIFIED_EMPTY_DEPLOYMENT_INVENTORY');
    if(p.deployments.length>0&&p.declaredNoDeployments!==false)
      add('INVALID_DEPLOYMENT_EMPTY_CLAIM');
    if(p.triggers.length===0&&p.declaredNoTriggers!==true)
      add('UNVERIFIED_EMPTY_TRIGGER_INVENTORY');
    if(p.triggers.length>0&&p.declaredNoTriggers!==false)
      add('INVALID_TRIGGER_EMPTY_CLAIM');
    for(const d of p.deployments){
      counts.deployments++;
      if(!exact(d,['ref','enabled','mayWriteFleet','principalRef',
        'destinationRefs','versionReviewed'])||!ref(d.ref)){
        add('INVALID_DEPLOYMENT_EVIDENCE');continue;
      }
      if(members.has(d.ref))add('DUPLICATE_EVIDENCE_REFERENCE');
      else members.add(d.ref);
      if(d.versionReviewed!==true)add('UNREVIEWED_DEPLOYMENT_VERSION');
      if(!principals.has(d.principalRef))add('UNKNOWN_EXECUTION_PRINCIPAL');
      if(![true,false].includes(d.enabled)||!
        [true,false].includes(d.mayWriteFleet)){
        add('UNKNOWN_DEPLOYMENT_STATUS');counts.unknownStatus++;
      }else if(d.enabled&&d.mayWriteFleet){
        add('ACTIVE_LEGACY_FLEET_WRITER');counts.activeFleetWriters++;
      }
      if(!array(d.destinationRefs)||(!d.destinationRefs.length&&
         d.mayWriteFleet!==false)||d.destinationRefs?.some(v=>!
         destinations.has(v)))add('UNKNOWN_WRITE_DESTINATION');
    }
    for(const t of p.triggers){
      counts.triggers++;
      if(!exact(t,['ref','kind','enabled','mayWriteFleet',
        'principalRef','destinationRefs'])||!ref(t.ref)){
        add('INVALID_TRIGGER_EVIDENCE');continue;
      }
      if(members.has(t.ref))add('DUPLICATE_EVIDENCE_REFERENCE');
      else members.add(t.ref);
      if(!enums(t.kind,['installed','time-driven']))
        add('UNKNOWN_TRIGGER_KIND');
      if(!principals.has(t.principalRef))
        add('UNKNOWN_EXECUTION_PRINCIPAL');
      if(![true,false].includes(t.enabled)||!
        [true,false].includes(t.mayWriteFleet)){
        add('UNKNOWN_TRIGGER_STATUS');counts.unknownStatus++;
      }else if(t.enabled&&t.mayWriteFleet){
        add('ACTIVE_LEGACY_FLEET_WRITER');counts.activeFleetWriters++;
      }
      if(!array(t.destinationRefs)||(!t.destinationRefs.length&&
         t.mayWriteFleet!==false)||t.destinationRefs?.some(v=>
         !destinations.has(v)))add('UNKNOWN_WRITE_DESTINATION');
    }
  }
  if(counts.deployments+counts.triggers>1024)add('INVENTORY_TOO_LARGE');
  return result(reasons,counts);
}
