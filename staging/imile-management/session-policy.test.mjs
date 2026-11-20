import assert from 'node:assert/strict';
import {allowedProfile,menuEntries,loginEmailForUsername,isSharedFirebaseUser,SHARED_LOGIN_EMAIL} from './session-policy.mjs';
for (const role of ['admin','editor','viewer']){
  assert.equal(allowedProfile({role,active:true}),true,role);
  assert.deepEqual(menuEntries({role,active:true}),[{id:'depo',enabled:true},{id:'fleet',enabled:true,editableByAdmin:true},{id:'reports',enabled:true}]);
}
for(const profile of [null,{}, {role:'admin',active:false},{role:'unexpected-role',active:true},{role:'viewer',active:'true'},{role:'',active:true}]){
  assert.equal(allowedProfile(profile),false);
  assert.deepEqual(menuEntries(profile),[]);
}
console.log('PASS: shared menu access and honest Fleet integration status');

assert.equal(loginEmailForUsername('imilemanagement'),'imilemanagement@imile-management-staging.firebaseapp.com');
assert.equal(loginEmailForUsername(' IMILEMANAGEMENT '),loginEmailForUsername('imilemanagement'));
assert.equal(loginEmailForUsername('editor@example.com'),null);
assert.equal(loginEmailForUsername(' ADMIN@EXAMPLE.COM '),null);
for (const value of ['','admin','user@','user@invalid','a b@example.com','user@@domain.com',null,undefined,{},1]) assert.equal(loginEmailForUsername(value),null);
assert.equal(loginEmailForUsername(SHARED_LOGIN_EMAIL),SHARED_LOGIN_EMAIL);
assert.equal(isSharedFirebaseUser({email:SHARED_LOGIN_EMAIL}),true);
assert.equal(isSharedFirebaseUser({email:'unauthorized@example.com'}),false);
assert.equal(isSharedFirebaseUser(null),false);
console.log('PASS: only existing shared Firebase login is accepted at unified V1 entry');
