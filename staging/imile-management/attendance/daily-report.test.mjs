import assert from 'node:assert/strict';
import {attendanceDailyReport} from './daily-report.mjs';
const moment=s=>({toDate:()=>new Date(s)});
const s=(id,driverId,status,startKm,endKm,startedAt,endedAt,plate='ABC123')=>({
 id,driverId,status,startKm,endKm,startedAt:moment(startedAt),
 endedAt:endedAt?moment(endedAt):null,plate
});
const today='2026-11-02';
const sessions=[
 s('a','DA001','reviewed',1200,1275,'2026-11-01T19:30:00Z','2026-11-02T07:15:00Z'),
 s('b','DA001','awaiting_review',1275,1310,'2026-11-02T07:30:00Z','2026-11-02T16:30:00Z'),
 s('c','DA002','active',1400,null,'2026-11-02T05:30:00Z',null,'XYZ789'),
 s('d','DA002','reviewed',100,140,'2026-11-01T18:00:00Z','2026-11-01T23:30:00Z','XYZ789'),
 s('e','DA003','reviewed',400,300,'2026-11-02T04:00:00Z','2026-11-02T13:00:00Z'),
 s('a','DA001','reviewed',1200,1275,'2026-11-01T19:30:00Z','2026-11-02T07:15:00Z')
];
let r=attendanceDailyReport({date:today,sessions});
assert.equal(r.ready,true);
assert.equal(r.checkins,3,'The overnight shift started on the previous local date');
assert.equal(r.checkouts,3,'Previous UTC day ending after midnight in Budapest is included');
assert.equal(r.activeNow,1);
assert.equal(r.awaitingReviewNow,1);
assert.equal(r.reviewedToday,2);
assert.equal(r.reportedKm,150);
assert.equal(r.reviewedKm,115);
assert.deepEqual(r.couriers.map(x=>({id:x.driverId,km:x.reportedKm,verified:x.reviewedKm})),[
 {id:'DA001',km:110,verified:75},{id:'DA002',km:40,verified:40}]);
assert.equal(r.issues.length,2,'Invalid mileage and duplicate events must be flagged');
const night=attendanceDailyReport({date:'2026-11-01',sessions});
assert.equal(night.checkouts,0,'DST-independent local date attribution');
assert.equal(attendanceDailyReport({date:'2026-11-31',sessions}).ready,false);
assert.equal(attendanceDailyReport({date:today}).ready,false);
const invalid=attendanceDailyReport({date:today,sessions:[
 s('broken','DA004','reviewed',0,15,'2026-11-02T10:00:00Z','nonsense'),
 s('wrong','DA005','active',0,15,'2026-11-02T10:00:00Z','2026-11-02T10:30:00Z'),
 s('bad-driver','?', 'reviewed',0,12,'2026-11-02T10:00:00Z','2026-11-02T10:30:00Z')
]});
assert.equal(invalid.checkouts,0);
assert.equal(invalid.issues.length,2,'Do not count active checkout or unknown driver');
assert.equal(invalid.reportedKm,0);
console.log('PASS: Budapest-time courier daily km reporting, unverified mileage and anomaly reporting');
