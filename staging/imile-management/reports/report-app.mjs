import{initializeApp}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import{getAuth,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import{getFirestore,doc,getDocFromServer}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import{firebaseConfig}from'../../../depokapacitas/firebase-config.js';
import{allowedProfile}from'../session-policy.mjs';
import{inhub,ofd}from'./report-core.mjs';
import{generateExcel}from'./report-xlsx.mjs';
const $=id=>document.getElementById(id);
let permitted=false,run=0,ready=null,filename=null;
function clear(){run++;ready=null;filename=null;$('download').disabled=true;$('preview').hidden=true;$('stats').replaceChildren();}
$('file').onchange=clear;$('kind').onchange=clear;
function preview(report){
 $('preview').hidden=false;
 $('summary').textContent=report.kind==='inhub'
 ?'Összes csomag: '+report.total+' · Területek: '+report.rows.length+' · Dátumok: '+report.dates.length
 :'OFD: '+report.totalOfd+' · DLD: '+report.totalDelivered+' · Futárok: '+report.uniqueCouriers+' · Vállalkozói csoportok: '+report.vendors.length+' · Sikeresség: '+(report.rate*100).toFixed(2)+'%';
 const list=report.kind==='inhub'?report.rows.map(r=>[r.area,r.counts.reduce((a,n)=>a+n,0)]):report.vendors.map(r=>[r.vendor,r.delivered+'/'+r.ofd+' · '+(r.rate*100).toFixed(2)+'%']);
 for(const [area,value]of list.slice(0,40)){
  const tr=document.createElement('tr');
  for(const v of [area,value]){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}
  $('stats').append(tr);
 }
}
function readScalar(value){
 if(value===null||value===undefined)return null;
 if(value instanceof Date||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
 throw Error('Összetett cellatípus, külső hivatkozás vagy képlet található a nyers exportban. Az automatikus feldolgozás leállt.');
}
function extract(matrixBook){
 const sheet=matrixBook.getWorksheet('sheet1')||matrixBook.worksheets[0];
 if(!sheet)throw Error('A feltöltött Excel nem tartalmaz sheet1 munkalapot.');
 if(sheet.rowCount>10002||sheet.columnCount>80)throw Error('Túl nagy bemeneti táblázat.');
 const matrix=[];
 for(let i=1;i<=sheet.rowCount;i++){
  const line=[];for(let j=1;j<=sheet.columnCount;j++)line.push(readScalar(sheet.getRow(i).getCell(j).value));
  matrix.push(line);
 }
 if(!matrix.length)throw Error('Üres Excel-forrás.');return matrix;
}
$('form').onsubmit=async event=>{
 event.preventDefault();if(!permitted)return;clear();
 const revision=run,file=$('file').files?.[0],kind=$('kind').value;
 if(!file||!/\.xlsx$/i.test(file.name)||file.size>8*1024*1024){$('message').textContent='Legfeljebb 8 MB-os .xlsx export szükséges.';return;}
 if(typeof window.ExcelJS?.Workbook!=='function'){$('message').textContent='Az Excel-motor nem töltődött be. A feldolgozás tiltva.';return;}
 $('prepare').disabled=true;$('message').textContent='Ellenőrzés és helyi Excel-készítés…';
 try{
  const input=new window.ExcelJS.Workbook();
  await input.xlsx.load(await file.arrayBuffer());
  if(revision!==run||!permitted)return;
  const matrix=extract(input),result=kind==='inhub'?inhub(matrix):ofd(matrix);
  if(result.status!=='ready'){
   $('message').textContent='A riport nem készíthető el: '+result.status+'. '+(result.issues||[]).slice(0,5).map(x=>'sor '+x.line+': '+x.reason).join('; ');
   return;
  }
  const buffer=await generateExcel(window.ExcelJS,matrix,result);
  if(revision!==run||!permitted)return;
  ready=buffer;filename=kind==='inhub'?'iMile_InHub_Inventory_kesz.xlsx':'iMile_DA_OFD_Performance_kesz.xlsx';
  $('download').disabled=false;preview(result);
  $('message').textContent='Elkészült a Sheet2. A fájl helyben maradt; nincs Firestore-mentés vagy automatikus statisztikai import.';
 }catch(error){if(revision===run)$('message').textContent='A feldolgozás leállt: '+(error?.message||'Ismeretlen hiba');}
 finally{if(revision===run)$('prepare').disabled=false;}
};
$('download').onclick=()=>{
 if(!permitted||!ready)return;
 const url=URL.createObjectURL(new Blob([ready],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
if(firebaseConfig.projectId!=='imile-management-staging')$('access').textContent='Helytelen Firebase-projekt: hozzáférés tiltva.';
else{
 const fb=initializeApp(firebaseConfig),auth=getAuth(fb),db=getFirestore(fb);
 onAuthStateChanged(auth,async user=>{
  const revision=++run;permitted=false;clear();$('controls').hidden=true;$('file').value='';
  if(!user){window.location.replace('../index.html');return;}
  try{
   const profile=(await getDocFromServer(doc(db,'users',user.uid))).data();
   if(run!==revision+1)return;
   if(!allowedProfile(profile)){$('access').textContent='Nincs aktív belső jogosultság.';return;}
   permitted=true;$('controls').hidden=false;
   $('access').textContent='Belső hozzáférés: '+profile.role+' · helyi, csak olvasó feldolgozás';
  }catch{$('access').textContent='A szerveri jogosultság nem ellenőrizhető; feldolgozás tiltva.';}
 });
}
