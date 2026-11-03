import assert from 'node:assert/strict';
import {normalizedDriver,normalizedVehicle,sameRecord,fleetStatuses} from './master-data.mjs';
const goodDriver=normalizedDriver({daCode:' da-001 ',name:'Teszt Futár',vendor:'QA',capacity:'100',active:'true'});
assert.deepEqual(goodDriver,{id:'DA-001',data:{daCode:'DA-001',name:'Teszt Futár',vendor:'QA',capacity:100,active:true}});
assert.deepEqual(normalizedDriver({daCode:'ABCD',name:'  Futár  ',vendor:'',capacity:'0',active:'false'}).data,
  {daCode:'ABCD',name:'Futár',vendor:'',capacity:0,active:false});
for(const x of ['-','A B C','a','',null,'../../secret'])assert.throws(()=>normalizedDriver({daCode:x,name:'Test',vendor:'',capacity:'0',active:'true'}));
for(const x of ['-1','1.5','NaN','Infinity','10001','','1e3'])assert.throws(
  ()=>normalizedDriver({daCode:'ABCD',name:'Test',vendor:'',capacity:x,active:'true'}));
for(const x of ['yes',undefined,'',null])assert.throws(
  ()=>normalizedDriver({daCode:'ABCD',name:'Test',vendor:'',capacity:'1',active:x}));
const vehicle=normalizedVehicle({plate:' ab-c123 ',model:'Teszt Autó',status:'Elérhető'});
assert.deepEqual(vehicle,{id:'ABC123',data:{plate:'ABC123',model:'Teszt Autó',status:'Elérhető'}});
for(const status of fleetStatuses)assert.equal(normalizedVehicle({plate:'ABCD',model:'',status}).data.status,status);
for(const plate of ['?', 'A B', 'AB-', '1234567890123',null])assert.throws(
  ()=>normalizedVehicle({plate,model:'',status:'Szerviz'}));
for(const status of ['',undefined,'Foglalt'])assert.throws(
  ()=>normalizedVehicle({plate:'ABCD',model:'',status}));
assert.equal(sameRecord({plate:'ABC123',model:'',status:'Szerviz'},{plate:'ABC123',model:'',status:'Szerviz'}),true);
assert.equal(sameRecord({plate:'ABC123',model:'',status:'Szerviz',hidden:'x'},{plate:'ABC123',model:'',status:'Szerviz'}),false);
assert.equal(sameRecord({plate:'ABC123',model:'',status:'Leállított'},{plate:'ABC123',model:'',status:'Szerviz'}),false);
console.log('PASS: staging Fleet canonical driver/vehicle validation and collision checks');
