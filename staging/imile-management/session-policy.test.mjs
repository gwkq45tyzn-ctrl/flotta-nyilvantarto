import assert from 'node:assert/strict';
import {allowedProfile,menuEntries} from './session-policy.mjs';
for (const role of ['admin','editor','viewer']){
  assert.equal(allowedProfile({role,active:true}),true,role);
  assert.deepEqual(menuEntries({role,active:true}),[{id:'depo',enabled:true},{id:'fleet',enabled:false}]);
}
for(const profile of [null,{}, {role:'admin',active:false},{role:'unexpected-role',active:true},{role:'viewer',active:'true'},{role:'',active:true}]){
  assert.equal(allowedProfile(profile),false);
  assert.deepEqual(menuEntries(profile),[]);
}
console.log('PASS: shared menu access and honest Fleet integration status');
