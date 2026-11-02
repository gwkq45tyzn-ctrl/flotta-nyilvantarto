import assert from 'node:assert/strict';
import {attendanceDailyReport,attendanceReportCsv} from './daily-report.mjs';
const moment=s=>({toDate:()=>new Date(s)});
const s=(id,driverId,status,startKm,endKm,startedAt,endedAt,plate='ABC123')=>({
 id,driverId,status,startKm,endKm,startedAt:moment(startedAt),
 endedAt:endedAt?moment(endedAt):null,plate
});
const today='2026-11-02';
const sessions=[
 {...s('a','DA001','reviewed',1200,1275,'2026-11-01T19:30:00Z','2026-11-02T07:15:00Z'),damageNote:'Apró sérülés a bal oldalon'},
 {...s('b','DA001','awaiting_review',1275,1310,'2026-11-02T07:30:00Z','2026-11-02T16:30:00Z'),cleanlinessNote:'Szemetes csomagtér'},
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
assert.equal(r.damageReports,1);
assert.equal(r.cleanlinessReports,1);
assert.equal(r.conditionFlags.length,2);
assert.deepEqual(r.couriers[0].damageReports,1);
assert.deepEqual(r.couriers[0].cleanlinessReports,1);
assert.equal(r.conditionFlags[0].status,'reviewed');
assert.equal(r.conditionFlags[1].status,'awaiting_review');
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

const csv=attendanceReportCsv(r);
assert.ok(csv.includes('"Sérülésjelzések"')&&csv.includes('"Tisztasági jelzések"'),'CSV must report flagged interior/exterior vehicle conditions');
assert.ok(csv.includes('"110";"75";"1";"1"'),'Courier report flags must follow verified mileage');

assert.ok(csv.startsWith('\uFEFF'),'Excel export must be UTF-8 BOM');
assert.ok(csv.includes('"Nap";"Futár DA"'),'Expected semicolon-separated quoted header fields');
assert.match(csv,/'?"DA001"/,'Actual daily courier report must be exportable');
assert.ok(csv.includes('"110";"75"')&&csv.includes('"40";"40"'),'Reported and reviewed kilometers must be preserved per courier');
assert.throws(()=>attendanceReportCsv({ready:false}),/ellenőrzött/);
const injection=attendanceReportCsv({...r,couriers:[{
 driverId:'=HYPERLINK("danger")',checkouts:1,reviewed:1,reportedKm:4,reviewedKm:4,
 plates:['@IMPORT','+BAD','-BAD','A;"B']
}]});
assert.ok(injection.includes("'=HYPERLINK"),'Spreadsheet formula must be prefixed with an apostrophe');
assert.ok(injection.includes("'@IMPORT"),'Plate formula-like content must be escaped');
const spaced=attendanceReportCsv({...r,couriers:[{
 driverId:'DA0999',checkouts:1,reviewed:1,reportedKm:0,reviewedKm:0,
 plates:['   =IMPORTXML("unsafe")']
}]});
assert.ok(spaced.includes("'   =IMPORTXML"),'CSV formula with leading spaces must be neutralized');
assert.ok(injection.includes('""'),'CSV quotes must be escaped');

console.log('PASS: Budapest-time courier daily km reporting, unverified mileage and anomaly reporting');
