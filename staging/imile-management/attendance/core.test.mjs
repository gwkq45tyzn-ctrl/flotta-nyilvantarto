import assert from 'node:assert/strict';
import {PHOTO_KEYS,validatePhotos,planCheckIn,planCheckOut,planReview,bulkReviewEligible,fleetSummary} from './core.mjs';
const uid='user_123456789',sessionId='session_123456789';
const paths=stage=>Object.fromEntries(PHOTO_KEYS.map(k=>[k,'attendance/'+uid+'/'+sessionId+'/'+stage+'/'+k+'.jpg']));
const access={uid,active:true,driverId:'DA1234'},vehicle={id:'ABC123',plate:'ABC-123',status:'Elérhető'};
assert.equal(PHOTO_KEYS.length,7);
assert.equal(validatePhotos(paths('in'),uid,sessionId,'in').ok,true);
assert.equal(validatePhotos({...paths('in'),cargo:''},uid,sessionId,'in').ok,false);
assert.equal(validatePhotos({...paths('in'),front:'attendance/other/session_123456789/in/front.jpg'},uid,sessionId,'in').ok,false);
const checkIn=args=>planCheckIn({uid,access,vehicle,sessionId,mileage:12345,photos:paths('in'),...args});
assert.deepEqual({ok:checkIn().ok,plate:checkIn().plate},{ok:true,plate:'ABC123'});
for(const patch of [{lock:{}},{claim:{}},{mileage:-1},{mileage:123.4},{access:{...access,active:false}},
 {vehicle:{...vehicle,status:'Szerviz'}},{photos:{...paths('in'),cargo:''}}])
 assert.equal(checkIn(patch).ok,false);
const session={id:sessionId,uid,plate:'ABC123',status:'active',startKm:12345,damageNote:''};
const out=opts=>planCheckOut({uid,session,mileage:12500,photos:paths('out'),...opts});
assert.equal(out().status,'awaiting_review');
for(const bad of [{mileage:12344},{mileage:1.5},{photos:paths('in')},{session:{...session,status:'awaiting_review'}},{uid:'otheruser'}])
 assert.equal(out(bad).ok,false);
const returned={...session,status:'awaiting_review'};
assert.equal(planReview({session:returned,carPresent:true,keyPresent:true,clean:true}).ok,true);
assert.equal(planReview({session:returned,carPresent:false,keyPresent:true,clean:true}).ok,false);
assert.equal(planReview({session:returned,carPresent:true,keyPresent:false,clean:true}).ok,false);
assert.equal(planReview({session:returned,carPresent:true,keyPresent:true,clean:false}).ok,false);
const damage={...returned,damageNote:'Törött kilincs'};
assert.equal(planReview({session:damage,carPresent:true,keyPresent:true,clean:true}).ok,false);
assert.equal(planReview({session:damage,carPresent:true,keyPresent:true,clean:true,damageReviewed:true}).ok,true);
assert.equal(bulkReviewEligible({sessions:[returned],physicallyChecked:false,keysChecked:true}).ok,false);
assert.equal(bulkReviewEligible({sessions:[returned],physicallyChecked:true,keysChecked:true}).ok,true);
assert.equal(bulkReviewEligible({sessions:[returned,damage],physicallyChecked:true,keysChecked:true}).ok,false);
assert.equal(bulkReviewEligible({sessions:[returned,{...returned,id:'session_diff123',plate:'XYZ987'}],physicallyChecked:true,keysChecked:true}).count,2);
const fleet=fleetSummary({vehicles:[vehicle,{plate:'XYZ987',status:'Elérhető'},{plate:'OFF123',status:'Szerviz'}],
 locks:[{plate:'ABC123',state:'active'}],confirmedDrivers:1});
assert.deepEqual(fleet,{operationalCars:2,confirmedDrivers:1,physicallyReady:1,missingDrivers:1,potentialCarsInUse:1});
console.log('PASS: independent check-in, check-out, seven photos, return verification and capacity');
