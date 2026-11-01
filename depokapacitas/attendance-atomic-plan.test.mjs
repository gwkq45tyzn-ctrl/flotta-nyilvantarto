import assert from 'node:assert/strict';
import {planAttendanceAtomicGuard} from './attendance-atomic-plan.mjs';

const now=Date.parse('2026-11-02T10:00:00Z'),date='2026-11-02';
const vehicleId='QACAR100',otherCar='QACAR200';
const drivers=[
 {id:'QA-DA001',daCode:'QA-DA001',active:true},
 {id:'QADA0002',daCode:'QADA0002',active:true}
];
const vehicles=[
 {id:vehicleId,plate:vehicleId,status:'Elérhető'},
 {id:otherCar,plate:otherCar,status:'Elérhető'}
];
const proof={
 fullVehicleEventHistory:true,
 includesOpenPriorDayHandovers:true,
 allIamAndBrowserWritersFenced:true,
 consistentReadWithinTransaction:true,
 sourceGenerationVerified:true,
 sourceRevision:9,pendingSourceChanges:0
};
const base={now,date,vehicleId,drivers,vehicles,proof,events:[]};
const plan=updates=>planAttendanceAtomicGuard({...base,...updates});
const input=(id,daCode,type,car=vehicleId,eventTime=date+'T08:00:00',overrides={})=>({
 id,daCode,type,vehicleId:car,eventTime,eventDate:eventTime.slice(0,10),
 timeKnown:true,source:'synthetic-test',status:'',
 photoFront:'',photoLeft:'',photoRight:'',photoBack:'',...overrides
});
const photos={photoFront:'a',photoLeft:'b',photoRight:'c',photoBack:'d'};
const login=input('QA_EVT1','QA-DA001','Log In');
const logout=input('QA_EVT2','QA-DA001','Log Out',vehicleId,date+'T09:00:00',photos);
let count=0;
function scenario(name,patch,reason,eligible=false){
 const r=plan(patch);
 assert.equal(r.reason,reason,name);
 assert.equal(r.eligible,eligible,name);
 assert.equal(r.authorizedForBooking,false,name+' must never enable browser writes');
 count++;return r;
}
const clear=scenario('empty but provably full history',{},'provisional_only',true);
assert.deepEqual(clear.guardIntent,{
 date,vehicleId,state:'clear',driverId:'',
 source:'trusted-attendance-projection-v1'
});
assert.equal('confirmedAt' in clear.guardIntent,false);
assert.equal(clear.writeIntent,null);
const assigned=scenario('today pickup',{events:[login]},'provisional_only',true);
assert.equal(assigned.guardIntent.state,'assigned');
assert.equal(assigned.guardIntent.driverId,'QA-DA001');
scenario('same event retry is deduplicated',{events:[login,{...login}]},'provisional_only',true);
const returned=scenario('complete photographic return',{events:[login,logout]},'provisional_only',true);
assert.equal(returned.guardIntent.state,'clear');
const incomplete=scenario('photo incomplete stays blocked',{
 events:[login,{...logout,photoBack:''}]
},'attendance_requires_review',false);
assert.equal(incomplete.guardIntent.state,'blocked');
scenario('car claimed by another courier',{
 events:[login,input('QA_EVT3','QADA0002','Log In',vehicleId,date+'T08:02:00')]
},'attendance_requires_review');
scenario('duplicate source id different payload',{
 events:[login,{...login,daCode:'QADA0002'}]
},'event_id_collision');
scenario('out of order event source still yields returned',{
 events:[logout,login]
},'provisional_only',true);
scenario('old checkout can close old pickup',{
 events:[
  input('QA_OLD1','QA-DA001','Log In',vehicleId,'2026-11-01T23:30:00'),
  input('QA_OLD2','QA-DA001','Log Out',vehicleId,date+'T06:30:00',photos)
 ]
},'provisional_only',true);
scenario('old pickup open now remains assigned',{
 events:[input('QA_OLD3','QA-DA001','Log In',vehicleId,'2026-11-01T23:30:00')]
},'provisional_only',true);
scenario('future event not trusted',{
 events:[input('QA_FUT','QA-DA001','Log In',vehicleId,'2026-11-03T08:00:00')]
},'future_attendance_event');
scenario('same-day event after current clock not trusted',{
 events:[input('QA_FUTTODAY','QA-DA001','Log In',vehicleId,date+'T23:00:00')]
},'future_attendance_event');
scenario('eventDate disagrees with eventTime',{
 events:[{...login,eventDate:'2026-11-01'}]
},'inconsistent_event_day');
scenario('DST fallback repeats the 02:00 wall-clock hour',{
 events:[input('QA_DST1','QA-DA001','Log In',vehicleId,'2026-10-25T02:30:00')]
},'ambiguous_dst_attendance_time');
scenario('source completeness missing',{proof:{...proof,fullVehicleEventHistory:false}},
 'unverified_authoritative_history');
scenario('IAM writers not fenced',{proof:{...proof,allIamAndBrowserWritersFenced:false}},
 'unverified_authoritative_history');
scenario('pending Google source edits',{proof:{...proof,pendingSourceChanges:1}},
 'unverified_authoritative_history');
scenario('source revision invalid',{proof:{...proof,sourceRevision:-1}},
 'unverified_authoritative_history');
scenario('source revision overflow',{proof:{...proof,sourceRevision:Number.MAX_SAFE_INTEGER}},
 'unverified_authoritative_history');
scenario('missing snapshot',{events:null},'missing_event_snapshot');
scenario('bad date',{date:'2026-02-30'},'invalid_parameters');
scenario('wrong local day',{date:'2026-11-01'},'not_current_budapest_day');
scenario('unavailable vehicle',{vehicles:[{id:vehicleId,plate:vehicleId,status:'Szerviz'}]},
 'vehicle_unavailable');
scenario('invalid unknown event',{events:[{...login,timeKnown:false}]},'invalid_event');
const added=scenario('single upsert plans event and guard in same commit',{
 events:[login],originalEvents:[],
 mutation:{action:'upsert',eventId:'QA_EVT1'}
},'provisional_only',true);
assert.deepEqual(added.writeIntent,{
 eventPath:'attendance/QA_EVT1',eventAction:'upsert',
 projectionPath:'attendanceVehicleGuards/'+date+'__'+vehicleId,
 revisionBefore:9,revisionAfter:10,bothWritesInOneCommitRequired:true,
 serverTimestampRequired:true,committableWithoutAuthorizedPublisher:false
});
scenario('upsert with missing proposed event',{events:[],originalEvents:[],
 mutation:{action:'upsert',eventId:'QA_GONE'}
},'multiple_or_missing_event_changes');
scenario('delete stale missing source',{events:[],originalEvents:[],
 mutation:{action:'delete',eventId:'QA_GONE'}
},'multiple_or_missing_event_changes');
const deleted=scenario('authoritative deletion needs projection update',{
 events:[],originalEvents:[login],mutation:{action:'delete',eventId:'QA_EVT1'}
},'provisional_only',true);
assert.equal(deleted.writeIntent.eventAction,'delete');
scenario('wrong vehicle in original needs multi-car projection',{
 events:[input('QA_EVT1','QA-DA001','Log In',otherCar)],
 originalEvents:[login],mutation:{action:'upsert',eventId:'QA_EVT1'}
},'multi_vehicle_reprojection_required');
scenario('two source events mutated at once',{
 events:[login,input('QA_EVT4','QADA0002','Log In',otherCar)],
 originalEvents:[],mutation:{action:'upsert',eventId:'QA_EVT1'}
},'multiple_or_missing_event_changes');
scenario('idempotent no-op not a new mutation',{
 events:[login],originalEvents:[login],
 mutation:{action:'upsert',eventId:'QA_EVT1'}
},'multiple_or_missing_event_changes');
scenario('invalid mutation',{mutation:{action:'invent',eventId:'QA_EVT1'},originalEvents:[]},
 'invalid_mutation');
scenario('no original snapshot',{events:[login],mutation:{action:'upsert',eventId:'QA_EVT1'}},
 'original_snapshot_missing');
assert.doesNotMatch(JSON.stringify(clear),/Bearer|OAuth|ScriptApp|firestore\.googleapis/);
console.log('PASS: '+count+' offline Attendance projection and atomic mutation intent cases; zero live writes');
