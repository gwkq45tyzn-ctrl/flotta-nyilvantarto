/** Minimal, dependency-free XLSX reader/writer for the two iMile report templates.
 * Handles typical ZIP-stored and DEFLATE-compressed .xlsx exports, shared strings
 * and scalar worksheet cells. Does not evaluate formulas, execute code or upload.
 * Rejects unexpected workbook structure; NOT a full OOXML implementation. */
import {completePhysicalExcelRows} from './physical-excel-rows.mjs';
const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
const cv=x=>x==null?'':x instanceof Date?x.toISOString().slice(0,10):String(x);
const i16=(d,p)=>d.getUint16(p,true),i32=(d,p)=>d.getUint32(p,true);
const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
const cellText=(ref,v,style=0)=>{
 if(v==null)return '';
 const st=style?` s="${style}"`:'';
 if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"${st}><v>${v}</v></c>`;
 return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(cv(v))}</t></is></c>`;
};
const rowXml=(r,cells,styles=[],height=null)=>`<row r="${r}"${height?` ht="${height}" customHeight="1"`:''}>${cells.map((v,j)=>cellText(col(j+1)+r,v,styles[j]||0)).join('')}</row>`;
const xmlHeader='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const status=(list,key,value)=>Object.prototype.hasOwnProperty.call(list,key)?list[key]:value;
const stylesXml=()=>`${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="0.0"/><numFmt numFmtId="167" formatCode="0;-0;;@"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${['002060','8AB8E6','E6E6E6','DDEBF7','FFF2CC','D45D60','E7D67B','5AAC6F','A8C375'].map(x=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${x}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF888888"/></left><right style="thin"><color rgb="FF888888"/></right><top style="thin"><color rgb="FF888888"/></top><bottom style="thin"><color rgb="FF888888"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14">${[
 [0,0,0,0],[2,2,0,0],[1,3,1,0],[0,4,1,0],[1,5,0,0],[0,6,1,0],
 [0,7,1,165],[0,8,1,165],[0,9,1,165],[0,4,1,165],[1,4,1,0],[1,9,1,165],[0,4,1,166],[0,10,1,165]
].map(([font,fill,border,num])=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${font===2?' horizontal="center"':''}/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
// Style ids: 1 navy title, 2 blue header, 3 grey row, 4 pivot header, 5 missing, 6 red %, 7 yellow %, 8 green %, 9 grey %, 10 grey bold, 11 green bold %, 12 grey decimal, 13 pale green %.
const sheetXml=(rows,{widths=[],merges=[],freeze=0,autoFilter=null}={})=>{
 const maxCol=Math.max(1,...rows.map(x=>x.values.length)),maxRow=rows.length||1;
 const cols=widths.length?`<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
 const merged=merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'';
 const pane=freeze?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
 return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${col(maxCol)}${maxRow}"/>${pane}<sheetFormatPr defaultRowHeight="17"/>${cols}<sheetData>${rows.map((x,i)=>rowXml(i+1,x.values,x.styles,x.height)).join('')}</sheetData>${autoFilter?`<autoFilter ref="${autoFilter}"/>`:''}${merged}</worksheet>`;
};
const buf=(n)=>new Uint8Array(n);
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let b=0;b<8;b++)c=(c&1)?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcTable[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
const put16=(dv,p,n)=>dv.setUint16(p,n,true),put32=(dv,p,n)=>dv.setUint32(p,n,true);
function pack(entries){
 const parts=[],central=[];let offset=0;
 for(const [name,contents] of entries){
  const nameBytes=te.encode(name),data=te.encode(contents),crc=crc32(data);
  const h=buf(30+nameBytes.length),d=new DataView(h.buffer);
  put32(d,0,0x04034b50);put16(d,4,20);put16(d,6,0x0800);put16(d,8,0);put32(d,14,crc);put32(d,18,data.length);put32(d,22,data.length);put16(d,26,nameBytes.length);h.set(nameBytes,30);
  parts.push(h,data);
  const c=buf(46+nameBytes.length),cd=new DataView(c.buffer);
  put32(cd,0,0x02014b50);put16(cd,4,20);put16(cd,6,20);put16(cd,8,0x0800);put32(cd,16,crc);put32(cd,20,data.length);put32(cd,24,data.length);put16(cd,28,nameBytes.length);put32(cd,42,offset);c.set(nameBytes,46);central.push(c);
  offset+=h.length+data.length;
 }
 const centralLen=central.reduce((a,x)=>a+x.length,0),end=buf(22),ev=new DataView(end.buffer);
 put32(ev,0,0x06054b50);put16(ev,8,central.length);put16(ev,10,central.length);put32(ev,12,centralLen);put32(ev,16,offset);
 const total=offset+centralLen+22,out=buf(total);let pos=0;
 for(const p of [...parts,...central,end]){out.set(p,pos);pos+=p.length;}return out;
}
export function writeReportXlsx(sourceRows,report){
 if(!Array.isArray(sourceRows)||!Array.isArray(sourceRows[0])||sourceRows.length>10002)throw Error('Túl nagy forrás.');
 if(report?.status!=='ready'||!['inhub','ofd'].includes(report.kind))throw Error('Csak ellenőrzött riport exportálható.');
 const raw=sourceRows.map(r=>({values:r.map(v=>v==null?'':v),styles:[]}));
 const out=[];const widths=[];const merges=[];
 if(report.kind==='inhub'){
  out.push({values:[]},{values:[]});
  out.push({values:['Count of Waybill Number','LM Receive'],styles:[4,4],height:20});
  const dates=report.dates.map(d=>`${d.slice(5,7)}/${d.slice(8,10)}/${d.slice(0,4)}`);
  out.push({values:['District / Település',...dates,'Grand Total'],styles:Array(dates.length+2).fill(4),height:21});
  for(const r of report.rows)out.push({values:[r.area,...r.counts.map(x=>x||null),r.counts.reduce((x,v)=>x+v,0)],styles:[0,...r.counts.map(()=>0),10]});
  out.push({values:['Grand Total',...report.columnTotals,report.total],styles:Array(dates.length+2).fill(4),height:21});
  widths.push(25,...dates.map(()=>14),16);
 }else{
  const dateStr=report.rows[0].date.slice(5).replace('-','-');
  out.push({values:[`iMile DA & Subcontractor Final Performance ${dateStr}`],styles:[1],height:27});merges.push('A1:N1');
  out.push({values:['OFD Date','Station','District','DA','DA Code','Vendor','OFD','Delivered','Dld%','P90 Target','Total OFD','DLD','%','SPR'],styles:Array(14).fill(2),height:24});
  const firstRows=new Map(),lastRows=new Map();
  for(const [i,r] of report.rows.entries()){
   const key=JSON.stringify([r.date,r.station,r.vendor]);
   if(!firstRows.has(key))firstRows.set(key,i+3);lastRows.set(key,i+3);
  }
  const groups=new Map(report.vendors.map(v=>[JSON.stringify([v.date,v.station,v.vendor]),v]));
  for(const [i,r] of report.rows.entries()){
   const n=i+3,key=JSON.stringify([r.date,r.station,r.vendor]),group=groups.get(key);
   const first=firstRows.get(key)===n;
   const rateStyle=!first?3:(group.rate<.60?6:group.rate<.68?7:group.rate<.72?13:8);
   const vals=[r.date,r.station,'—',r.name,r.code,r.vendor,r.ofd,r.delivered,r.rate,r.p90,first?group.ofd:null,first?group.delivered:null,first?group.rate:null,first?group.spr:null];
   const sts=[3,3,5,3,3,3,3,3,9,12,3,3,rateStyle,3];
   out.push({values:vals,styles:sts,height:20});
  }
  for(const [key,from] of firstRows){const to=lastRows.get(key);if(to>from)for(const c of ['K','L','M','N'])merges.push(`${c}${from}:${c}${to}`);}
  out.push({values:['Grand Total',null,null,null,null,null,report.totalOfd,report.totalDelivered,report.rate],styles:[10,3,3,3,3,3,10,10,11],height:23});
  out.push({values:[]});
  out.push({values:['District: a nyers riportban nincs hiteles kerület; a sárga mezők ellenőrzést igényelnek.']});
  out.push({values:['A 10 óra körüli riport pillanatkép; nem tekinthető automatikusan végleges napi teljesítménynek.']});
  widths.push(15,13,17,30,19,58,13,13,15,16,16,14,16,15);
 }
 const contentTypes=`${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
 const rootRel=`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
 const wbXml=`${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="sheet1" sheetId="1" r:id="rId1"/><sheet name="Sheet2" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
 const wbRel=`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
 return pack([['[Content_Types].xml',contentTypes],['_rels/.rels',rootRel],['xl/workbook.xml',wbXml],['xl/_rels/workbook.xml.rels',wbRel],['xl/styles.xml',stylesXml()],['xl/worksheets/sheet1.xml',sheetXml(raw,{widths:sourceRows[0].map((x,i)=>i===0?22:20),freeze:1})],['xl/worksheets/sheet2.xml',sheetXml(out,{widths,merges,freeze:report.kind==='inhub'?4:2,autoFilter:report.kind==='ofd'?`A2:J${report.rows.length+2}`:null})]]);
}
export async function readXlsxFirstSheet(data){
 if(!(data instanceof ArrayBuffer)||data.byteLength>8*1024*1024)throw Error('Legfeljebb 8 MB méretű .xlsx fájl támogatott.');
 const d=new DataView(data),bytes=new Uint8Array(data);let end=-1;
 for(let p=data.byteLength-22;p>=Math.max(0,data.byteLength-65557);p--)if(i32(d,p)===0x06054b50){end=p;break;}
 if(end<0)throw Error('Érvénytelen XLSX/ZIP fájl.');
 const n=i16(d,end+10),offset=i32(d,end+16);if(n>500||offset>=data.byteLength)throw Error('Nem támogatott Excel-archívum.');
 const files=new Map();let p=offset;
 for(let i=0;i<n;i++){
  if(i32(d,p)!==0x02014b50)throw Error('Hibás ZIP-tartalom.');
  const compressed=i32(d,p+20),uncompressed=i32(d,p+24),method=i16(d,p+10),nameLen=i16(d,p+28),extra=i16(d,p+30),comment=i16(d,p+32),local=i32(d,p+42);
  const name=td.decode(bytes.subarray(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(uncompressed>25*1024*1024||compressed>8*1024*1024)throw Error('Túl nagy Excel-munkalap.');
  files.set(name,{compressed,uncompressed,method,local});
 }
 async function file(name){
  const ent=files.get(name);if(!ent)throw Error('Hiányzó XLSX-összetevő: '+name);
  const q=ent.local;if(i32(d,q)!==0x04034b50)throw Error('Érvénytelen ZIP-fejléc.');
  const start=q+30+i16(d,q+26)+i16(d,q+28);
  const compressed=bytes.slice(start,start+ent.compressed);let raw;
  if(ent.method===0)raw=compressed;
  else if(ent.method===8){raw=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
  else throw Error('Nem támogatott ZIP-tömörítés.');
  if(raw.length!==ent.uncompressed)throw Error('Sérült XLSX-tartalom.');return td.decode(raw);
 }
 const readXml=x=>{if(/<!DOCTYPE/i.test(x))throw Error('Nem támogatott XML-tartalom.');const xml=new DOMParser().parseFromString(x,'application/xml');if(xml.querySelector('parsererror'))throw Error('Hibás XML-munkalap.');return xml;};
 const strings=[];if(files.has('xl/sharedStrings.xml')){
  const xml=readXml(await file('xl/sharedStrings.xml'));
  for(const si of xml.getElementsByTagName('si'))strings.push([...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
 }
 let sheetPath='xl/worksheets/sheet1.xml';
 if(!files.has(sheetPath)){
  // Historical exports may have different worksheet names, so read first relationship.
  const candidates=[...files.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if(!candidates.length)throw Error('Nincs munkalap az exportban.');sheetPath=candidates.sort()[0];
 }
 const xml=readXml(await file(sheetPath)),sheetData=xml.getElementsByTagName('sheetData')[0];
 if(!sheetData)throw Error('Nincs feldolgozható Excel-adat.');
 const result=[];
 for(const row of sheetData.getElementsByTagName('row')){
  const ri=Number(row.getAttribute('r'))-1;if(!Number.isInteger(ri)||ri<0||ri>10001)throw Error('Túl nagy Excel-tábla.');
  if(Object.hasOwn(result,ri))throw Error('Ismételt Excel-sorszám.');
  const values=[];
  for(const c of row.getElementsByTagName('c')){
   const ref=c.getAttribute('r')||'',m=/^([A-Z]+)\d+$/.exec(ref);if(!m)continue;
   let ci=0;for(const letter of m[1])ci=ci*26+letter.charCodeAt(0)-64;ci--;
   if(ci>80)throw Error('Túl sok Excel-oszlop.');
   if(c.getElementsByTagName('f').length)throw Error('Képletet tartalmazó nyers fájl nem fogadható el automatikusan.');
   const ty=c.getAttribute('t'),v=c.getElementsByTagName('v')[0];let value=null;
   if(ty==='inlineStr')value=[...c.getElementsByTagName('t')].map(t=>t.textContent).join('');
   else if(ty==='s')value=strings[Number(v?.textContent)]??null;
   else if(ty==='b')value=v?.textContent==='1';
   else if(v)value=ty==='str'||ty==='e'?v.textContent:Number(v.textContent);
   values[ci]=value;
  }
  result[ri]=values;
 }
 if(!result.length||!result[0])throw Error('Üres Excel-export.');
 return completePhysicalExcelRows(result);
}
