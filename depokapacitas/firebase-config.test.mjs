import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('./firebase-config.js',import.meta.url),'utf8');
const matches=[...code.matchAll(/export\s+const\s+firebaseConfig\s*=/g)];
assert.equal(matches.length,1,'A Firebase webkonfiguráció csak egyszer szerepelhet.');
const js=code.replace('export const firebaseConfig','const firebaseConfig');
const config=runInNewContext(js+'\n({ ...firebaseConfig })',{}, {timeout:1000});
assert.equal(config.projectId,'imile-management-staging');
assert.equal(config.authDomain,'imile-management-staging.firebaseapp.com');
assert.match(config.apiKey,/^AIza[A-Za-z0-9_-]{20,}$/);
assert.match(config.appId,/^1:91967139054:web:[a-z0-9]+$/);
assert.equal(config.messagingSenderId,'91967139054');
assert.ok(config.storageBucket.startsWith('imile-management-staging.'));
for(const field of ['private_key','privateKey','serviceAccount','client_secret','password','token']){
 assert.ok(!Object.hasOwn(config,field),'Titkos szerveroldali adat nem kerülhet a webkonfigurációba: '+field);
}
console.log('PASS: staging Firebase webconfig shape and project binding; NO live service check');
