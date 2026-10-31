/** Staging-only Excel renderer matching the user-approved Sheet2 references.
 * All files stay in browser. Requires pinned ExcelJS browser runtime.
 * No cloud upload / Firestore changes / implicit stats persistence. */
import {COLORS} from './report-core.mjs';
const argb=hex=>'FF'+hex;
const fill=hex=>({type:'pattern',pattern:'solid',fgColor:{argb:argb(hex)}});
const border={top:{style:'thin',color:{argb:'FF888888'}},bottom:{style:'thin',color:{argb:'FF888888'}},left:{style:'thin',color:{argb:'FF888888'}},right:{style:'thin',color:{argb:'FF888888'}}};
const width=(sheet,values)=>values.forEach((w,i)=>sheet.getColumn(i+1).width=w);
const style=(cell,hex,{bold=false,white=false,percent=false,decimal=false}={})=>{
 cell.fill=fill(hex);cell.font={name:'Aptos',size:11,bold,color:{argb:white?'FFFFFFFF':'FF000000'}};
 cell.alignment={vertical:'middle'};cell.border=border;
 if(percent)cell.numFmt='0.00%';if(decimal)cell.numFmt='0.0';
};
const replace=(sheet,r,c,value)=>{sheet.getRow(r).getCell(c).value=value;return sheet.getRow(r).getCell(c)};
function rawSource(sheet,matrix){
 matrix.forEach((row,index)=>{const r=sheet.getRow(index+1);for(let i=0;i<row.length;i++){
  const v=row[i];r.getCell(i+1).value=v instanceof Date?v:(typeof v==='number'||typeof v==='boolean'||typeof v==='string'?v:v==null?null:String(v));
 }});
 sheet.views=[{state:'frozen',ySplit:1}];
 for(let i=1;i<=Math.min(matrix[0].length,45);i++)sheet.getColumn(i).width=i===1?22:20;
}
export function addReportSheet(workbook,report){
 if(report?.status!=='ready')throw Error('A riport nem hitelesíthető.');
 const existing=workbook.getWorksheet('Sheet2');if(existing)workbook.removeWorksheet(existing.id);
 const sh=workbook.addWorksheet('Sheet2');
 if(report.kind==='inhub'){
  width(sh,[25,...report.dates.map(()=>14),16]);sh.views=[{state:'frozen',ySplit:4}];
  replace(sh,3,1,'Count of Waybill Number');replace(sh,3,2,'LM Receive');
  const h=['District / Település',...report.dates.map(x=>x.slice(5,7)+'/'+x.slice(8,10)+'/'+x.slice(0,4)),'Grand Total'];
  h.forEach((v,j)=>replace(sh,4,j+1,v));
  for(let j=1;j<=h.length;j++){style(sh.getCell(3,j),COLORS.pivot,{bold:true});style(sh.getCell(4,j),COLORS.pivot,{bold:true})}
  for(let i=0;i<report.rows.length;i++){
   const row=report.rows[i],n=i+5;
   replace(sh,n,1,row.area);
   row.counts.forEach((v,j)=>{const c=replace(sh,n,j+2,v||null);c.numFmt='0;-0;;@';});
   const sum=replace(sh,n,h.length,row.counts.reduce((a,b)=>a+b,0));sum.font={bold:true};
  }
  const t=report.rows.length+5;
  replace(sh,t,1,'Grand Total');
  [...report.columnTotals,report.total].forEach((n,j)=>replace(sh,t,j+2,n));
  for(let j=1;j<=h.length;j++)style(sh.getCell(t,j),COLORS.pivot,{bold:true});
  sh.getRow(4).height=22;
 }else if(report.kind==='ofd'){
  width(sh,[15,13,17,29,19,58,13,13,14,15,16,14,16,15]);
  sh.mergeCells('A1:N1');const t=replace(sh,1,1,'iMile DA & Subcontractor Final Performance '+report.rows[0].date.slice(5));
  style(t,COLORS.navy,{bold:true,white:true});t.alignment={vertical:'middle',horizontal:'center'};sh.getRow(1).height=28;
  const h=['OFD Date','Station','District','DA','DA Code','Vendor','OFD','Delivered','Dld%','P90 Target','Total OFD','DLD','%','SPR'];
  h.forEach((v,j)=>style(replace(sh,2,j+1,v),COLORS.blue,{bold:true}));sh.getRow(2).height=25;
  const groupStarts=new Map(),groupEnds=new Map();
  report.rows.forEach((r,i)=>{
   const n=i+3,key=JSON.stringify([r.date,r.station,r.vendor]);
   if(!groupStarts.has(key))groupStarts.set(key,n);groupEnds.set(key,n);
   const a=[r.date,r.station,'—',r.name,r.code,r.vendor,r.ofd,r.delivered,r.rate,r.p90];
   a.forEach((v,j)=>style(replace(sh,n,j+1,v),j===2?COLORS.missing:COLORS.gray,{percent:j===8,decimal:j===9}));
   sh.getRow(n).height=20;
  });
  for(const [key,start]of groupStarts){
   const end=groupEnds.get(key),g=report.vendors.find(x=>JSON.stringify([x.date,x.station,x.vendor])===key);
   for(const col of 'KLMN')if(end>start)sh.mergeCells(col+start+':'+col+end);
   const values=[g.ofd,g.delivered,g.rate,g.spr];
   values.forEach((v,j)=>{
    const c=replace(sh,start,j+11,v),pct=j===2;
    const hex=!pct?COLORS.gray:g.rate<.60?COLORS.red:g.rate<.68?COLORS.yellow:g.rate<.72?COLORS.lightgreen:COLORS.green;
    style(c,hex,{percent:pct,decimal:j===3});c.alignment={horizontal:'center',vertical:'middle'};
   });
  }
  const total=report.rows.length+3;replace(sh,total,1,'Grand Total');
  replace(sh,total,7,report.totalOfd);replace(sh,total,8,report.totalDelivered);replace(sh,total,9,report.rate);
  for(let c=1;c<=14;c++)style(sh.getCell(total,c),c===9?COLORS.green:COLORS.gray,{bold:true,percent:c===9});
  sh.getRow(total).height=22;
  replace(sh,total+2,1,'District: a forrásban nem található hiteles kerület, ezért a sárga mező ellenőrizendő.');
  replace(sh,total+3,1,'Napi pillanatkép: a 10 órai export nem feltétlenül végleges napi teljesítmény.');
  sh.autoFilter={from:'A2',to:'J'+(report.rows.length+2)};
  sh.views=[{state:'frozen',ySplit:2}];
 }else throw Error('Ismeretlen riporttípus.');
 return sh;
}
export async function generateExcel(ExcelJS,matrix,report){
 if(typeof ExcelJS?.Workbook!=='function')throw Error('Nincs betöltve az ellenőrzött Excel-motor.');
 const wb=new ExcelJS.Workbook();rawSource(wb.addWorksheet('sheet1'),matrix);
 addReportSheet(wb,report);
 return wb.xlsx.writeBuffer();
}
