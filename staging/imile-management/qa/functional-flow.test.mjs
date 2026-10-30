import assert from 'node:assert/strict';
import {
 QA_TEST_DATE,QA_DRIVER_ID,QA_CAR_ID,QA_BOOKING_ID,QA_CLAIM_ID,
 QA_DRIVER,QA_CAR,QA_BOOKING,QA_CLAIM,correctQaMaster,correctQaBooking,qaCapacity
} from './functional-flow.mjs';
assert.equal(QA_TEST_DATE,'2099-01-15');
assert.equal(QA_BOOKING_ID,QA_TEST_DATE+'__'+QA_CAR_ID);
assert.equal(QA_CLAIM_ID,QA_TEST_DATE+'__'+QA_DRIVER_ID);
assert.equal(correctQaMaster(QA_DRIVER,QA_CAR),true);
assert.equal(correctQaMaster({...QA_DRIVER,active:false},QA_CAR),false);
assert.equal(correctQaMaster(QA_DRIVER,{...QA_CAR,status:'Szerviz'}),false);
assert.equal(correctQaMaster({...QA_DRIVER,untrusted:'x'},QA_CAR),false);
assert.equal(correctQaBooking(QA_BOOKING,QA_CLAIM),true);
assert.equal(correctQaBooking({...QA_BOOKING,vehicleId:'CAR2'},QA_CLAIM),false);
assert.equal(correctQaBooking(QA_BOOKING,{...QA_CLAIM,date:'2099-01-14'}),false);
assert.equal(qaCapacity(QA_BOOKING,QA_DRIVER,QA_CAR),100);
assert.equal(qaCapacity({...QA_BOOKING,capacity:1000},QA_DRIVER,QA_CAR),0);
assert.equal(qaCapacity(QA_BOOKING,QA_DRIVER,{...QA_CAR,status:'Leállított'}),0);
console.log('PASS: 13 isolated synthetic booking, capacity and cleanup identity fixtures');
