import assert from 'node:assert/strict';
import {allowedProfile,menuEntries,loginEmailForUsername} from './session-policy.mjs';
for (const role of ['admin','editor','viewer']){
  assert.equal(allowedProfile({role,active:true}),true,role);
  assert.deepEqual(menuEntries({role,active:true}),[{id:'depo',enabled:true},{id:'fleet',enabled:true,readOnly:true}]);
}
for(const profile of [null,{}, {role:'admin',active:false},{role:'unexpected-role',active:true},{role:'viewer',active:'true'},{role:'',active:true}]){
  assert.equal(allowedProfile(profile),false);
  assert.deepEqual(menuEntries(profile),[]);
}
console.log('PASS: shared menu access and honest Fleet integration status');

assert.equal(loginEmailForUsername('imilemanagement'),'imilemanagement@imile-management-staging.firebaseapp.com');
assert.equal(loginEmailForUsername(' IMILEMANAGEMENT '),loginEmailForUsername('imilemanagement'));
for (const value of ['','admin','imilemanagement@example.com','imilemanagement@imile-management-staging.firebaseapp.com',null,undefined,{},1]) assert.equal(loginEmailForUsername(value),null);
console.log('PASS: username resolves only to dedicated staging account; unknown usernames rejected');
