import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessAttendanceHeader, MOBILE_ATTENDANCE_LEGACY_HEADERS as legacy, ATTENDANCE_LOG_FORM_HEADERS as attendanceLog, REQUIRED_NEW_HEADERS} from './source-header-gate.mjs';

const candidate=[...legacy,...REQUIRED_NEW_HEADERS];
function expectSafe(headers,reason){
 const r=assessAttendanceHeader(headers);
 assert.equal(r.reason,reason);
 assert.equal(r.sourceReady,false);
 assert.equal(r.authorizedForBooking,false);
 assert.equal(r.writesAllowed,false);
 assert.equal(r.migrationApproved,false);
 assert.equal(Object.isFrozen(r),true);
 return r;
}
test('current live Mobile Attendance A1:P1 remains rejected; no inferred car or ID',()=>{
 assert.equal(legacy.length,16);
 assert.deepEqual(legacy.slice(0,5),[
  'Timestamp','Driver Name','DA Code','Vendor','Attendance Type'
 ]);
 assert.deepEqual(legacy.slice(-4),[
  'Car Photo - Front','Car Photo - Left Side',
  'Car Photo - Right Side','Car Photo - Back'
 ]);
 const r=expectSafe([...legacy],'legacy_16_column_source');
 assert.deepEqual(r.missingHeaders,['Source Event ID','Vehicle Plate']);
});
test('separate 10-column Attendance Log Google Forms destination cannot be mistaken for Mobile Attendance',()=>{
 assert.deepEqual(attendanceLog,[
  'Timestamp','Date','Employee / Driver Name','DA / Employee Code',
  'Vendor','Attendance Type','Location / Site','Remarks','Matched Time',
  'Working Hours'
 ]);
 const r=expectSafe([...attendanceLog],'attendance_log_form_response_without_identity');
 assert.equal(r.sourceTab,'Attendance Log');
 assert.equal(r.sourceOwnershipUnverified,true);
 assert.deepEqual(r.missingHeaders,['Source Event ID','Vehicle Plate']);
 expectSafe([...attendanceLog,...Array(16).fill('')],
  'attendance_log_form_response_without_identity');
});
test('wrong short form shape cannot be treated as an approved source',()=>{
 expectSafe(attendanceLog.slice(0,9),'invalid_header_input');
 expectSafe([...attendanceLog.slice(0,9),'Driver Name'],'unrecognized_short_attendance_header');
});
test('wider sheet grid trailing blanks are NOT source columns',()=>{
 expectSafe([...legacy,...Array(10).fill('')],'legacy_16_column_source');
 expectSafe([...legacy,null,undefined],'legacy_16_column_source');
});
test('proposed 18 headers do not claim owner approval or import permission',()=>{
 const r=expectSafe(candidate,'proposed_18_column_schema_only');
 assert.equal(r.requiresImmutableEventId,true);
 assert.equal(r.requiresVerifiedVehicleChoice,true);
 assert.equal(r.requiresTrustedPublisherAndOwnerApproval,true);
 assert.deepEqual(r.proposedColumns,REQUIRED_NEW_HEADERS);
});
test('column order changes after legacy prefix are harmless for header-only candidate',()=>{
 expectSafe([...legacy,'Vehicle Plate','Source Event ID'],'proposed_18_column_schema_only');
});
test('missing only one required identity header is not sufficient',()=>{
 const missingCar=expectSafe([...legacy,'Source Event ID'],'incomplete_identity_columns');
 assert.deepEqual(missingCar.missingHeaders,['Vehicle Plate']);
 const missingId=expectSafe([...legacy,'Vehicle Plate'],'incomplete_identity_columns');
 assert.deepEqual(missingId.missingHeaders,['Source Event ID']);
});
test('duplicated identity, legacy, or missing blank header fails closed',()=>{
 expectSafe([...legacy,'Vehicle Plate','Vehicle Plate'],'duplicate_header_names');
 expectSafe([...legacy,'Source Event ID','Source Event ID'],'duplicate_header_names');
 expectSafe([...legacy,'','Vehicle Plate','Source Event ID'],'header_gap_or_empty_cell');
 expectSafe([...legacy.slice(0,15),legacy[0]],'duplicate_header_names');
});
test('unknown columns never imply implicit vehicle or event identity',()=>{
 expectSafe([...legacy,'Car Plate','Source Event ID'],'unreviewed_extra_column_names');
 expectSafe([...legacy,'Source Event ID','Vehicle Plate','Driver ID'],'unreviewed_extra_column_names');
});
test('legacy names or old position must remain unchanged until approved migration',()=>{
 const swapped=[...legacy];[swapped[2],swapped[4]]=[swapped[4],swapped[2]];
 expectSafe([...swapped,...REQUIRED_NEW_HEADERS],'legacy_column_order_or_name_changed');
 const renamed=[...legacy];renamed[7]='GPS Accuracy';
 expectSafe([...renamed,...REQUIRED_NEW_HEADERS],'legacy_column_order_or_name_changed');
});
test('normalizes whitespace and unicode width, not semantically changed headers',()=>{
 expectSafe(candidate.map(x=>'  '+x+'   '),'proposed_18_column_schema_only');
 expectSafe([...legacy,'source   event id','vehicle plate'],'proposed_18_column_schema_only');
});
test('malformed headers fail closed, no Google/network/Firestore dependency',()=>{
 for(const h of [null,[],{},Array(101).fill('X'),[...legacy,42]]){
  expectSafe(h,'invalid_header_input');
 }
});
