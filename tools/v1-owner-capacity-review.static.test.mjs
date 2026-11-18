/**
 * Original Fleet owner review: static security contract.
 * The real browser File API path is exercised by the Chromium E2E below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const path=new URL('./v1-owner-capacity-review.html',import.meta.url);
const html=readFileSync(path,'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/);
test('self-contained offline UI includes inline working JS and strict CSP',()=>{
  assert.ok(script&&script[1].length>5000);
  assert.doesNotThrow(()=>new Script(script[1],{filename:'v1-owner-capacity-review-inline.js'}));
  assert.match(html,/lang="hu"/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.doesNotMatch(html,/<script[^>]+\bsrc=/i);
  assert.doesNotMatch(html,/<link[^>]+\bhref=/i);
  assert.doesNotMatch(html,/<iframe|<img|<form\b/i);
});
test('does not persist, transmit or load private Fleet data over a network',()=>{
  assert.doesNotMatch(script[1],/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/);
  assert.doesNotMatch(script[1],/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
  assert.doesNotMatch(script[1],/\bnavigator\.sendBeacon\b|\bserviceWorker\b/);
  assert.doesNotMatch(script[1],/\.innerHTML\s*=|\beval\s*\(|\bnew Function\b/);
  assert.match(script[1],/file\.arrayBuffer\(\)/);
  assert.match(script[1],/new TextDecoder\('utf-8',\{fatal:true,ignoreBOM:true\}\)/);
  assert.doesNotMatch(script[1],/await file\.text\(\)/);
  assert.match(script[1],/new Blob\(/);
  assert.match(script[1],/URL\.createObjectURL/);
  assert.match(script[1],/crypto\.subtle\.digest\('SHA-256'/);
});
test('never auto-applies 70 and requires explicit review for every active courier',()=>{
  assert.match(script[1],/number\.placeholder='70 \(javaslat\)'/);
  assert.match(script[1],/checkbox\.type='checkbox'/);
  assert.match(script[1],/r\.checkbox\.checked/);
  assert.match(script[1],/cap\(Number\(r\.number\.value\)\)/);
  assert.match(script[1],/MAX_DRIVERS=30/);
  assert.match(script[1],/L E Z Á R T|LEZÁRT_VAGY_IMPORTÁLT_FORRÁS/);
  assert.match(script[1],/this\.chunks|TÚL_NAGY_ADATÁLLOMÁNY|MAX_CANONICAL_BYTES/);
});
test('candidate summary is unlocked ONLY after disk roundtrip full-content and SHA-256 equality',()=>{
  assert.match(html,/id="savedFile"/);
  assert.match(html,/id="verificationPanel"/);
  assert.match(script[1],/const actualCanonical=canonicalBytes\(candidate\)/);
  assert.match(script[1],/const expectedCanonical=canonicalBytes\(expectedCandidate\)/);
  assert.match(script[1],/actualCanonical!==expectedCanonical/);
  assert.match(script[1],/actualSha!==expectedSummary\.candidateLocalSha256/);
  assert.match(script[1],/savedCandidateRoundtripVerified:true|savedCandidateRoundtripVerified=false/);
  assert.match(script[1],/savedCandidateRoundtripVerified/);
  assert.match(script[1],/candidateVersion\+\+/);
  assert.match(script[1],/expectedSummary!==savedSummary/);
  assert.match(script[1],/checkVersion!==verificationVersion/);
  assert.match(script[1],/sourceRef!==original/);
  assert.match(script[1],/version!==candidateVersion/);
  assert.match(script[1],/nodes\.summary\.disabled=true/);
  assert.match(script[1],/nodes\.summary\.disabled=false/);
});
test('private GUI uses the same 8-pair receipt and 120-owned read admission bound, never imports',()=>{
  assert.match(script[1],/MIGRATION_PAIR_CHUNK=8,MAX_ATOMIC_OWNED_READS=120/);
  assert.match(script[1],/migrationOwnedReads=2\*keyedPairs/);
  assert.match(script[1],/Math\.ceil\(keyedPairs\/MIGRATION_PAIR_CHUNK\)/);
  assert.match(script[1],/migrationWithinAtomicBound/);
  assert.match(script[1],/migrationWithinAtomicReadBound/);
  assert.match(script[1],/az import TILOS|Az import TILOS|Éles import TILOS/);
});
test('review tool cannot itself authorize privileged production import',()=>{
  assert.match(script[1],/authorizedForImport:false/);
  assert.match(script[1],/productionIamVerified:false/);
  assert.match(script[1],/independentSourcePinVerified:false/);
  assert.match(script[1],/firestoreEncodedSizeVerified:false/);
  assert.match(html,/NEM ÉLES IMPORT/);
  assert.doesNotMatch(html,/\bfirebase\.initializeApp\b|\bgetFirestore\b/);
});
