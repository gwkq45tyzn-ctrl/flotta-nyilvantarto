/**
 * Independently corrected review of Grok #185 boundary test on the exact
 * unified source. An estimator MAY return an oversize byte count; it must
 * not mislabel that count as a valid import or confuse it with wire encoding.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sizeGate,estimateStorageSize} from './v1-firestore-size-estimator.mjs';
import {FIRESTORE_DOC_LIMIT} from './v1-firestore-size-gate.mjs';
const raw=()=>({
  drivers:[],vehicles:[],fuelCards:[],contacts:[]
});
test('small valid source passes advisory only, never import authorization',()=>{
  const result=sizeGate(raw(),{'flottaDrivers/DA0001':{
    daCode:'DA0001',sourceIndex:0,revision:1,status:'aktiv',kapacitas:10
  }});
  assert.equal(result.advisoryOk,true);
  assert.equal(result.ok,false);
  assert.equal(result.authorizedForImport,false);
  assert.equal(result.firestoreEncodedSizeVerified,false);
});
test('a giant but structurally valid field may be estimated but is denied',()=>{
  const large={message:'á'.repeat(540000)};
  const size=estimateStorageSize('flottaDrivers/DA0001',large);
  // A measured storage estimate is not permission; do not require the
  // estimator to return null merely because the estimate exceeds a limit.
  assert.ok(size===null||size>FIRESTORE_DOC_LIMIT);
  const result=sizeGate({...raw(),extra:large},{});
  assert.equal(result.advisoryOk,false);
  assert.equal(result.ok,false);
  assert.equal(result.authorizedForImport,false);
});
test('UTF8 path and nested-depth schema errors fail closed',()=>{
  const tooLongName={['á'.repeat(800)]:true};
  assert.equal(estimateStorageSize('flottaDrivers/DA0001',tooLongName),null);
  let nested={value:1};
  for(let i=0;i<25;i++)nested={child:nested};
  assert.equal(estimateStorageSize('flottaDrivers/DA0001',nested),null);
  const disallowed=sizeGate(raw(),{'flottaDrivers/DA/0001':{value:1}});
  assert.equal(disallowed.advisoryOk,false);
  assert.equal(disallowed.ok,false);
});
