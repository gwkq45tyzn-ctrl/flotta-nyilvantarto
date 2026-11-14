import assert from 'node:assert/strict';
import {cityOrDistrict,inhub,ofd} from './report-core.mjs';
let passed=0;const test=(name,fn)=>{try{fn();passed++}catch(e){throw Error(name+': '+e.message,{cause:e})}};
const h=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode'];
const row=(id,d,city='Budapest',zip='1097')=>[id,d,city,zip];
const ho=['OFD Date','DA','DA Code','Vendor','OFD','Delivered','Station'];
const o=(code,n,d,vendor='V',date='2026-10-30',station='DS(AKE)')=>[date,'Futár '+code,code,vendor,n,d,station];
test('Budapest kerület',()=>assert.equal(cityOrDistrict('Budapest','1117'),'11'));
test('Vidék település neve',()=>assert.equal(cityOrDistrict('Szigetszentmiklós','2310'),'Szigetszentmiklós'));
test('Dunaharaszti nem numerikus kerület',()=>assert.equal(cityOrDistrict('Dunaharaszti','2330'),'Dunaharaszti'));
test('Hibás Budapest irányítószám nem megtippelt',()=>assert.equal(cityOrDistrict('Budapest','9999'),null));
test('In-Hub Pivot helyes összegek',()=>{const r=inhub([h,row('001','2026-10-30 10:00'),row('002','2026-10-30','Dunaharaszti','2330'),row('003','2026-10-29')]);assert.equal(r.total,3);assert.deepEqual(r.columnTotals,[1,2]);assert.equal(r.rows.length,2)});
test('Duplikált waybill tiltva',()=>{
  const r=inhub([h,row('001','2026-10-30'),row('001','2026-10-30')]);
  assert.equal(r.status,'blocked');
  assert.equal(r.total,null);
  assert.equal(r.issues.some(x=>x.reason==='duplicate_waybill'),true);
});
test('Excel dátumszéria naptári nap marad, nem UTC előző nap',()=>{
  const serial=25569+Math.round((Date.parse('2026-11-14T00:00:00Z')-Date.UTC(1970,0,1))/86400000);
  const r=inhub([h,row('WB100',serial+0.75,'Budapest','1097')]);
  assert.equal(r.status,'ready');
  assert.deepEqual(r.dates,['2026-11-14']);
  assert.equal(r.total,1);
});
test('Hibás nap tiltva',()=>assert.equal(inhub([h,row('001','2026-02-30')]).status,'blocked'));
test('Üres input nem hiteles nulla',()=>assert.equal(inhub([h]).total,null));
test('Ismeretlen mezőt nem találgat',()=>assert.throws(()=>inhub([['Tracking ID']])));
test('OFD azonos DA kód összevonás',()=>{const r=ofd([ho,o('D1',5,4),o('D1',7,3)]);assert.equal(r.totalOfd,12);assert.equal(r.uniqueCouriers,1);assert.equal(r.totalDelivered,7);assert.equal(r.vendors[0].spr,12)});
test('Vállalkozói mutató súlyozott',()=>{const r=ofd([ho,o('D1',5,5),o('D2',95,45)]);assert.equal(r.vendors[0].rate,.5);assert.equal(r.vendors[0].spr,50)});
test('Kézbesített nem lehet több OFD-nél',()=>assert.equal(ofd([ho,o('D1',4,5)]).status,'blocked'));
test('Eltérő nap külön csoport',()=>assert.equal(ofd([ho,o('D1',5,4,'V','2026-10-29'),o('D1',5,4)]).vendors.length,2));
test('Üres OFD nem nulla',()=>assert.equal(ofd([ho]).totalOfd,null));
test('Azonos DA ismétlődő, egyenként safe sorok unsafe összege tiltva',()=>{
  const r=ofd([ho,o('D1',Number.MAX_SAFE_INTEGER,0),o('D1',1,0)]);
  assert.equal(r.status,'blocked');
  assert.equal(r.totalOfd,null);
  assert.ok(r.issues.some(x=>x.reason==='metric_total_overflow'));
});
test('Külön futárok, azonos vállalkozó unsafe csoportösszege tiltva',()=>{
  const r=ofd([ho,o('D1',Number.MAX_SAFE_INTEGER,0),o('D2',1,0)]);
  assert.equal(r.status,'blocked');
  assert.equal(r.totalDelivered,null);
  assert.ok(r.issues.some(x=>x.reason==='metric_total_overflow'));
});
test('Eltérő vállalkozók unsafe napi globális összesítése tiltva',()=>{
  const r=ofd([ho,o('D1',Number.MAX_SAFE_INTEGER,0,'V1'),
    o('D2',1,0,'V2')]);
  assert.equal(r.status,'blocked');
  assert.equal(r.totalOfd,null);
  assert.ok(r.issues.some(x=>x.reason==='metric_total_overflow'));
});
test('Határértéken még pontos egész OFD megmarad, normalizálás nem veszít sort',()=>{
  const r=ofd([ho,o('D1',Number.MAX_SAFE_INTEGER,0,'V1')]);
  assert.equal(r.status,'ready');
  assert.equal(r.totalOfd,Number.MAX_SAFE_INTEGER);
  assert.equal(r.rows[0].ofd,Number.MAX_SAFE_INTEGER);
});
console.log('PASS: '+passed+' In-Hub/DA OFD report contracts and safe metrics');
