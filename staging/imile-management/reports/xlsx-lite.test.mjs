import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {inhub,ofd} from './report-core.mjs';
import {writeReportXlsx,inflateRawXlsxBounded,readXlsxFirstSheet} from './xlsx-lite.mjs';
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


// The reader must reject a malicious ZIP entry BEFORE accumulating its
// expanded 32MiB payload. The compressed input is small (<64KiB).
const sample=new TextEncoder().encode('Budapest – In-Hub 📦');
const packed=deflateRawSync(sample);
const unpacked=await inflateRawXlsxBounded(new Uint8Array(packed),sample.byteLength);
assert.deepEqual(unpacked,sample);
await assert.rejects(
 ()=>inflateRawXlsxBounded(new Uint8Array(packed),3),
 /XLSX_DEFLATE_SIZE_DENIED/
);
await assert.rejects(
 ()=>inflateRawXlsxBounded(new Uint8Array(packed),sample.byteLength+1),
 /XLSX_DEFLATE_SIZE_MISMATCH/
);
const bomb=deflateRawSync(Buffer.alloc(32*1024*1024,65));
assert.ok(bomb.byteLength<100000);
await assert.rejects(
 ()=>inflateRawXlsxBounded(new Uint8Array(bomb),25*1024*1024),
 /XLSX_DEFLATE_SIZE_DENIED/
);
await assert.rejects(
 ()=>inflateRawXlsxBounded(new Uint8Array(bomb),32*1024*1024),
 /XLSX_DEFLATE_SIZE_DENIED/
);
console.log('PASS: bounded streaming XLSX inflate refuses zip bomb, forged size and size mismatch');


// Malformed workbook ZIPs must fail BEFORE any worksheet XML is parsed.
// Every test mutates the actual writer's byte-valid ZIP directory, so no
// third-party archive parser or browser DOM implementation is required.
function zipCentralEntry(bytes,name){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const end=bytes.byteLength-22;
 assert.equal(d.getUint32(end,true),0x06054b50);
 let pos=d.getUint32(end+16,true);
 const n=d.getUint16(end+10,true);
 for(let i=0;i<n;i++){
  assert.equal(d.getUint32(pos,true),0x02014b50);
  const len=d.getUint16(pos+28,true),extra=d.getUint16(pos+30,true),
   comment=d.getUint16(pos+32,true);
  const actual=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+len));
  if(actual===name)return pos;
  pos+=46+len+extra+comment;
 }
 throw Error('TEST_ZIP_ENTRY_NOT_FOUND');
}
const validZip=writeReportXlsx(inv,invReport);
const zipSheet1='xl/worksheets/sheet1.xml',zipSheet2='xl/worksheets/sheet2.xml';
{
 const changed=Uint8Array.from(validZip),pos=zipCentralEntry(changed,zipSheet2);
 changed.set(new TextEncoder().encode(zipSheet1),pos+46);
 await assert.rejects(()=>readXlsxFirstSheet(changed.buffer),
  /Duplikált XLSX ZIP-összetevő/);
}
{
 const changed=Uint8Array.from(validZip),dir=zipCentralEntry(changed,zipSheet1);
 const dv=new DataView(changed.buffer),local=dv.getUint32(dir+42,true);
 assert.equal(dv.getUint16(local+26,true),zipSheet1.length);
 changed.set(new TextEncoder().encode(zipSheet2),local+30);
 await assert.rejects(()=>readXlsxFirstSheet(changed.buffer),
  /XLSX ZIP-összetevő eltérés/);
}
{
 // Corrupt workbook.xml CRC, which must be checked BEFORE its XML DOM parse
 // (Node test runner intentionally has no browser DOMParser).
 const changed=Uint8Array.from(validZip),dir=zipCentralEntry(changed,'xl/workbook.xml');
 new DataView(changed.buffer).setUint32(dir+16,0,true);
 await assert.rejects(()=>readXlsxFirstSheet(changed.buffer),
  /hibás CRC/);
}
{
 const changed=Uint8Array.from(validZip),dir=zipCentralEntry(changed,zipSheet1);
 new DataView(changed.buffer).setUint16(dir+8,1,true);
 await assert.rejects(()=>readXlsxFirstSheet(changed.buffer),
  /Titkosított ZIP-munkalap/);
}
console.log('PASS: duplicate ZIP part, mismatched local filename, bad CRC and encryption denied before XML');
