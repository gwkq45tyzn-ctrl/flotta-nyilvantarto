import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join, resolve} from 'node:path';

const root = resolve(process.cwd(), 'depokapacitas');
const files = ['index.html','style.css','app.js','firebase-config.js','firestore.rules','TELEPITES.md'];
for (const file of files) assert.ok(existsSync(join(root,file)), 'Hiányzó fájl: '+file);
const html=readFileSync(join(root,'index.html'),'utf8');
const js=readFileSync(join(root,'app.js'),'utf8');
const cfg=readFileSync(join(root,'firebase-config.js'),'utf8');
const rules=readFileSync(join(root,'firestore.rules'),'utf8');
assert.ok(html.includes('type="module" src="./app.js"'),'Hiányzó app.js behívás.');
assert.ok(html.includes('id="loginForm"')&&html.includes('id="denied"'),'Bejelentkezési / hozzáférési képernyő hiányzik.');
for (const route of ['overview','planning','alerts','drivers','vehicles','demands','results','attendance','import','admin'])
  assert.ok(html.includes('data-view="'+route+'"') || (route==='admin' && html.includes('id="adminNav"')), 'Hiányzó modul: '+route);
assert.ok(js.includes('onAuthStateChanged') && js.includes("doc(db,'users',user.uid)"),'Hiányzó Firebase-jogosultságellenőrzés.');
assert.ok(js.includes('runTransaction') && js.includes('vehicleLocks'), 'Hiányzó saját Attendance járműállapot.');
assert.ok(js.includes("get('vehicleSessions')"),'Hiányzó saját Attendance-megjelenítés.');
assert.ok(js.includes('writeBatch'), 'Hiányzó tömeges import.');
assert.ok(!cfg.includes('-----BEGIN PRIVATE KEY-----'), 'Titkos privát kulcs került a publikus konfigurációba!');
assert.ok(!cfg.includes('service_account'), 'Service account kulcs került a publikus konfigurációba!');
assert.ok(rules.includes('allow read, write: if false') || rules.includes('allow read, write: if false;'), 'Hiányzó alapértelmezett adattiltás.');
assert.ok(rules.includes("request.auth.uid") && rules.includes('getAfter('),'Hiányzó szerepkör vagy foglalásvédelmi szabály.');

const check = path => {
  const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(r.status,0, 'JavaScript syntax: '+path+'\n'+r.stderr);
};
check(join(root,'app.js'));
check(join(root,'firebase-config.js'));
console.log('DepóKapacitás: minden kód- és alapbiztonsági ellenőrzés sikeres.');
