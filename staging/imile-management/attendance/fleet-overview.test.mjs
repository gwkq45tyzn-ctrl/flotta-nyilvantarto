import assert from 'node:assert/strict';
import {buildFleetOverview} from './fleet-overview.mjs';
const v=[{plate:'ABC-123',status:'Elérhető'},{plate:'DEF-456',status:'Elérhető'},
 {plate:'GHI-789',status:'Szerviz'},{plate:'JKL-000',status:'Elérhető'}];
const locks=[{plate:'ABC123',driverId:'DA0001',uid:'uid_one',state:'active',sessionId:'session_one'},
 {plate:'DEF456',driverId:'DA0002',uid:'uid_two',state:'awaiting_review',sessionId:'session_two'}];
const sessions=[{id:'session_one',plate:'ABC123',driverId:'DA0001',uid:'uid_one',status:'active'},
 {id:'session_two',plate:'DEF456',driverId:'DA0002',uid:'uid_two',status:'awaiting_review'}];
const driverLocks=[
 {driverId:'DA0001',plate:'ABC123',uid:'uid_one',state:'active',sessionId:'session_one'},
 {driverId:'DA0002',plate:'DEF456',uid:'uid_two',state:'awaiting_review',sessionId:'session_two'}
];
let out=buildFleetOverview({vehicles:v,locks,sessions,driverLocks});
assert.equal(out.ready,true);
assert.deepEqual(out.rows.map(x=>x.state),['active','awaiting_review','unavailable','no_active_session']);
assert.equal(out.rows[0].driverId,'DA0001');
assert.equal(out.rows[1].driverId,'DA0002');
assert.match(out.rows[3].text,/fizikai jelenlét nem igazolt/);
assert.equal(out.unmatchedLocks.length,0);
out=buildFleetOverview({vehicles:v,locks:[locks[0]],sessions:[],driverLocks});
assert.equal(out.rows[0].state,'review_required','Missing session cannot be called confirmed issue');
out=buildFleetOverview({vehicles:v,locks:[{...locks[0],state:'awaiting_review'}],sessions,driverLocks});
assert.equal(out.rows[0].state,'review_required','Conflicting lock status needs review');
out=buildFleetOverview({vehicles:v,locks:[locks[0],{...locks[0]}],sessions,driverLocks});
assert.equal(out.rows[0].state,'review_required','Duplicate claim must not become free');
out=buildFleetOverview({vehicles:v,locks:[{plate:'UNKNOWN',sessionId:'session_x',driverId:'DA0003'}],sessions,driverLocks});
assert.ok(out.unmatchedLocks.some(x=>x.plate==='UNKNOWN'),'Unknown claimed car must be surfaced');
assert.ok(out.unmatchedLocks.some(x=>/DA-kód szerinti autózár/.test(x.text)),'Unpaired DA locks must also be surfaced');
out=buildFleetOverview({vehicles:[v[0],{plate:'ABC123',status:'Elérhető'}],locks:[],sessions:[],driverLocks});
assert.ok(out.rows.some(x=>x.state==='review_required'),'Duplicate plate after normalization is unsafe');
assert.deepEqual(buildFleetOverview({vehicles:null,locks:[],sessions:[]}),{ready:false,rows:[],unmatchedLocks:[]});

out=buildFleetOverview({vehicles:v,locks,sessions,driverLocks:[driverLocks[1]]});
assert.equal(out.rows[0].state,'review_required','Missing DA lock is a security discrepancy');
out=buildFleetOverview({vehicles:v,locks,sessions,driverLocks:[driverLocks[0],{...driverLocks[1],uid:'wrong'}]});
assert.equal(out.rows[1].state,'review_required','Wrong DA account must be investigated');
out=buildFleetOverview({vehicles:v,locks:[],sessions,driverLocks});
assert.equal(out.rows[0].state,'review_required','Orphan DA lock must not display car as unclaimed');
assert.ok(out.unmatchedLocks.length>=2,'Orphan DA locks must be visible in alerts');
out=buildFleetOverview({vehicles:v,locks,sessions,driverLocks:[...driverLocks,driverLocks[0]]});
assert.equal(out.rows[0].state,'review_required','Duplicate canonical DA lock is an inconsistency');

console.log('PASS: full fleet list never infers physical presence from missing Attendance locks');
