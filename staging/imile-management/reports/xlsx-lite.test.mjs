import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inhub,ofd} from './report-core.mjs';
import {writeReportXlsx} from './xlsx-lite.mjs';
const h=['Waybill Number','LM Receive Date','Consignee city','Consignee zipcode'];
const inv=[h,['001','2026-10-30','Budapest','1117'],['002','2026-10-31','Dunaharaszti','2330']];
const raw=['OFD Date','DA','DA Code','Vendor','OFD','Delivered','Station'];
const daily=[raw,['2026-10-30','A','D1','V',60,30,'DS(AKE)'],['2026-10-30','B','D2','V',40,30,'DS(AKE)']];
const parseEntries=bytes=>{
 const d=Buffer.from(bytes),entries=new Map();
 let p=0;while(p+30<d.length&&d.readUInt32LE(p)===0x04034b50){
  const nameLen=d.readUInt16LE(p+26),extra=d.readUInt16LE(p+28);
  const len=d.readUInt32LE(p+18),name=d.subarray(p+30,p+30+nameLen).toString('utf8');
  assert.equal(d.readUInt16LE(p+8),0,'writer must produce standard uncompressed XLSX');
  entries.set(name,d.subarray(p+30+nameLen+extra,p+30+nameLen+extra+len).toString('utf8'));
  p+=30+nameLen+extra+len;
 }return entries;
};
const invReport=inhub(inv),ofdReport=ofd(daily);
assert.equal(invReport.total,2);assert.equal(ofdReport.totalOfd,100);
for(const [matrix,report] of [[inv,invReport],[daily,ofdReport]]){
 const b=writeReportXlsx(matrix,report);assert.equal(b[0],0x50);assert.equal(b[1],0x4b);
 const z=parseEntries(b);
 for(const path of ['[Content_Types].xml','xl/workbook.xml','xl/styles.xml',
  'xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'])
  assert.ok(z.has(path),'Missing '+path);
 assert.match(z.get('xl/workbook.xml'),/name="sheet1"/);
 assert.match(z.get('xl/workbook.xml'),/name="Sheet2"/);
 assert.ok(!z.get('xl/worksheets/sheet2.xml').includes('https://'));
 assert.match(z.get('xl/styles.xml'),/002060/);assert.match(z.get('xl/styles.xml'),/DDEBF7/);
}
const z=parseEntries(writeReportXlsx(daily,ofdReport));
const xml=z.get('xl/worksheets/sheet2.xml');
assert.match(xml,/iMile DA &amp; Subcontractor Final Performance/);
assert.match(xml,/mergeCell ref="A1:N1"/);
assert.match(xml,/mergeCell ref="K3:K4"/);
assert.match(xml,/Grand Total/);
assert.match(xml,/100/);
const original=parseEntries(writeReportXlsx(inv,invReport)).get('xl/worksheets/sheet2.xml');
assert.match(original,/Dunaharaszti/);assert.match(original,/11/);
assert.throws(()=>writeReportXlsx(inv,{status:'blocked',kind:'inhub'}));
console.log('PASS: standalone XLSX ZIP, workbook, colors, merged vendor cells, city labels and source preservation');
