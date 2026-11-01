import {digest} from './synthetic-transaction.mjs';
export const NOW=Date.parse('2026-11-01T12:00:00Z');
export const DAY='2026-11-01';
export function event(id='QA_LOGIN',changes={}){return {id,daCode:'QA_DA_01',
 eventTime:DAY+'T09:00:00',eventDate:DAY,timeKnown:true,vehicleId:'QA0001',
 type:'Log In',status:'SYNTHETIC',photoFront:'',photoLeft:'',photoRight:'',
 photoBack:'',source:'qa_synthetic',...changes};}
export function snapshot(events=[],changes={}){return {
 mode:'synthetic-emulator-only',revision:0,sourceRevision:0,epoch:1,
 completeHistory:true,pendingSourceChanges:0,observedAt:NOW,
 drivers:[{id:'QA_DA_01',daCode:'QA_DA_01',active:true,capacity:100},
 {id:'QA_DA_02',daCode:'QA_DA_02',active:true,capacity:100}],
 vehicles:[{id:'QA0001',plate:'QA0001',status:'Elérhető'},
 {id:'QA0002',plate:'QA0002',status:'Elérhető'}],
 events,historyDigest:digest(events),...changes};}
export function request(e=event(),changes={}){return {id:'QA_MUT_FIRST',epoch:1,
 expectedRevision:0,expectedSourceRevision:0,date:DAY,vehicleId:'QA0001',
 expectedEventDigest:null,mutation:{action:'upsert',eventId:e.id,event:e},...changes};}
export const photos={photoFront:'SYNTHETIC_PHOTO',photoLeft:'SYNTHETIC_PHOTO',
 photoRight:'SYNTHETIC_PHOTO',photoBack:'SYNTHETIC_PHOTO'};
