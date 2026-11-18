/**
 * Offline owner decisions: security and source-contract static checks.
 * No production data. Real interaction/bytes/identity path also in Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('./v1-owner-operations-review.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
test('owner status/capacity UI is a valid self-contained HU offline page',()=>{
  assert.ok(script.length>9000);
  assert.doesNotThrow(()=>new Script(script,{filename:'v1-owner-operations-review-inline.js'}));
  assert.match(html,/<html lang="hu">/);
  for(const token of ["default-src 'none'","connect-src 'none'","form-action 'none'",
    "object-src 'none'","frame-src 'none'","base-uri 'none'"])assert.ok(html.includes(token));
  assert.doesNotMatch(html,/<script[^>]+\bsrc=|<link[^>]+\bhref=|<iframe|<img\b|<form\b/i);
});
test('no private source persists or leaves the browser, regardless of values',()=>{
  for(const pattern of [
    /\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bWebSocket\b/,/\bnavigator\.sendBeacon\b/,
    /\blocalStorage\b/,/\bsessionStorage\b/,/\bindexedDB\b/,
    /serviceWorker/,/\.innerHTML\s*=/,/\bnew Function\s*\(/,/\beval\s*\(/
  ])assert.doesNotMatch(script,pattern);
  assert.match(script,/file\.text\(\)/);
  assert.match(script,/new Blob\(/);
  assert.match(script,/URL\.createObjectURL/);
  assert.match(script,/crypto\.subtle\.digest\('SHA-256'/);
});
test('both uncertain statuses and all resulting active capacities require owner decisions',()=>{
  assert.match(html,/id="statusRows"/);
  assert.match(html,/id="capacityRows"/);
  assert.match(script,/statusControls\.every\(x=>x\.select\.value&&x\.confirm\.checked\)/);
  assert.match(script,/capacityControls\.every\(x=>/);
  assert.match(script,/select\.addEventListener\('change',\(\)=>\{check\.checked=false;renderCapacities\(\);\}\)/);
  assert.match(script,/statuses\.some\(x=>!x\.status\|\|x\.reviewed!==true\)/);
  assert.match(script,/candidate\.drivers\[index\]\.kapacitas=decision\.kapacitas/);
  assert.match(script,/sourceSha256:await digest\(canonicalBytes\(source\)\)/);
  assert.doesNotMatch(script,/value=['"]70['"]/);
  assert.match(script,/MAX_DRIVER_ROWS=30/);
  assert.match(script,/MAX_OWNED_READS=120,MIGRATION_PAIR_CHUNK=8/);
});
test('both private files must return from disk byte-exact before any summary',()=>{
  assert.match(html,/id="decisionVerify"/);
  assert.match(html,/id="candidateVerify"/);
  assert.match(script,/file\.size<1\|\|file\.size>MAX_FILE_BYTES/);
  assert.match(script,/bytes!==\(which==='decision'\?current\.decisionText:current\.candidateText\)/);
  assert.match(script,/canonicalBytes\(parsed\)!==canonicalBytes\(/);
  assert.match(script,/verifiedDecision&&verifiedCandidate/);
  assert.match(script,/version!==revision\|\|current!==prepared\|\|token!==readVersion/);
  assert.match(script,/ui\.summaryDownload\.disabled/);
  assert.match(script,/decisionPlanSaveReadbackVerified:true/);
});
test('UI cannot authenticate an owner or authorize live Fleet import',()=>{
  for(const token of [
    'ownerIdentityAuthenticated:false','actualLiveSourceAuthorityVerified:false',
    'independentRestorableBackupVerified:false',
    'originalBrowserPendingWritesReconciled:false','productionIamVerified:false',
    'productionReleaseAuthorized:false','authorizedForImport:false'
  ])assert.ok(script.includes(token));
  assert.doesNotMatch(script,/\bfirebase\b|\bgetFirestore\b|\bgoogle\.script\b/);
  assert.match(html,/Nincs hálózati kapcsolat/);
});
