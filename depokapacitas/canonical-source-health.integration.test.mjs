import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('./firestore-v1-restricted.rules',import.meta.url),'utf8');

test('driver and car tables must use verified original Fleet, NEVER independent raw mirrors',()=>{
  assert.match(src,/import \{assessCanonicalMasterDisplay\} from '\.\/canonical-source-health\.mjs'/);
  assert.match(src,/const get=name=>\['drivers','vehicles'\]\.includes\(name\)/);
  assert.match(src,/state\.canonicalMaster\?\.trusted\?state\.canonicalMaster\[name\]:\[\]/);
  assert.match(src,/function refreshCanonicalMaster\(\)/);
  assert.match(src,/driverMirrors:state\.data\.drivers/);
  assert.match(src,/vehicleMirrors:state\.data\.vehicles/);
  assert.match(src,/fleet:state\.canonicalFleetRaw/);
  assert.match(src,/approval:state\.canonicalApproval/);
});
test('both original Fleet and immutable migration approval must be server confirmed',()=>{
  assert.match(src,/onSnapshot\(doc\(db,'flottaSharedState','current'\),\{includeMetadataChanges:true\}/);
  assert.match(src,/onSnapshot\(doc\(db,'flottaMigrationApproval','current'\),\{includeMetadataChanges:true\}/);
  assert.match(src,/state\.canonicalFleetRaw=confirmed&&exists\?snap\.data\(\):null/);
  assert.match(src,/state\.canonicalApproval=confirmed&&exists\?snap\.data\(\):null/);
  assert.match(src,/const liveSources=\[\.\.\.watchedCollections,'flottaSharedState','flottaMigrationApproval'\]/);
  assert.match(src,/const trusted=label\.trusted&&canonical\.trusted/);
});
test('read-only preview cannot be mistaken for a privileged cutover or write permission',()=>{
  const text=readFileSync(new URL('./flotta-master-readonly.mjs',import.meta.url),'utf8');
  assert.match(text,/Operatív törzsadatként csak külön jóváhagyott migráció/);
  assert.doesNotMatch(text,/\b(?:setDoc|updateDoc|deleteDoc|runTransaction)\s*\(/);
  assert.match(rules,/match \/flottaMigrationApproval\/\{id\}/);
  assert.match(rules,/allow list, create, update, delete: if false/);
});
