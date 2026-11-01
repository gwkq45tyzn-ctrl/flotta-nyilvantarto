/**
 * OFFLINE source-header contract for iMile's existing Mobile Attendance tab.
 *
 * Accepts ONLY header text supplied by caller. Never opens Google Sheets,
 * reads personal rows, generates IDs, authorizes an IAM publisher, writes to
 * Firebase, or issues booking clearance. A matching 18-column layout is only
 * a proposed *schema candidate*, not a source-of-truth certification.
 */
export const MOBILE_ATTENDANCE_LEGACY_HEADERS=Object.freeze([
 'Timestamp','Driver Name','DA Code','Vendor','Attendance Type',
 'Latitude','Longitude','GPS Accuracy (m)','Distance from Warehouse (m)',
 'Warehouse','Remarks','Status',
 'Car Photo - Front','Car Photo - Left Side','Car Photo - Right Side',
 'Car Photo - Back'
]);
export const REQUIRED_NEW_HEADERS=Object.freeze(['Source Event ID','Vehicle Plate']);
const canonical=x=>typeof x==='string'?x.trim().normalize('NFKC').replace(/\s+/g,' ').toLowerCase():null;
const result=(reason,details={})=>Object.freeze({
  reason,
  sourceReady:false,
  authorizedForBooking:false,
  writesAllowed:false,
  migrationApproved:false,
  ...details
});
export function assessAttendanceHeader(header){
 if(!Array.isArray(header)||header.length<16||header.length>100||
   header.some(v=>v!==null&&v!==undefined&&typeof v!=='string'))
  return result('invalid_header_input');
 // Sheets can report a wider grid than the 16-column form. Ignore trailing
 // empty cell values but not gaps or changed names in the actual header.
 const raw=header.map(x=>canonical(x)??'');
 const stop=raw.reduce((pos,value,i)=>value?i+1:pos,0);
 const cells=raw.slice(0,stop);
 if(cells.some(x=>x===''))return result('header_gap_or_empty_cell');
 if(new Set(cells).size!==cells.length)return result('duplicate_header_names');
 if(MOBILE_ATTENDANCE_LEGACY_HEADERS.some((name,i)=>cells[i]!==canonical(name)))
  return result('legacy_column_order_or_name_changed');
 const extras=cells.slice(16);
 const approvedNames=REQUIRED_NEW_HEADERS.map(canonical);
 if(extras.some(x=>!approvedNames.includes(x)))
  return result('unreviewed_extra_column_names');
 if(!extras.includes(approvedNames[0])||!extras.includes(approvedNames[1]))
  return result(extras.length?'incomplete_identity_columns':'legacy_16_column_source',
   {missingHeaders:REQUIRED_NEW_HEADERS.filter(x=>!extras.includes(canonical(x)))});
 if(cells.length!==18)return result('unexpected_identity_column_count');
 return result('proposed_18_column_schema_only',{
  proposedColumns:Object.freeze([...REQUIRED_NEW_HEADERS]),
  requiresImmutableEventId:true,
  requiresVerifiedVehicleChoice:true,
  requiresTrustedPublisherAndOwnerApproval:true
 });
}
