import {previewGoogleDemoExport,MAX_GOOGLE_DEMO_BYTES} from './google-demo-preview.mjs';

// Standalone read-only viewer. No auth, no network, no storage, no backend.
const $=id=>document.getElementById(id);
const status=$('demoStatus'),output=$('demoOutput');
const fmt=value=>value===null?'—':Number(value).toLocaleString('hu-HU');
const signed=value=>value===null?'—':(value>0?'+':'')+fmt(value);
function setStatus(value,bad=false){
 status.textContent=value;status.classList.toggle('error',bad);
}
function stat(label,value,hint){
 const box=document.createElement('div');box.className='stat';
 const title=document.createElement('span');title.textContent=label;
 const figure=document.createElement('strong');figure.textContent=fmt(value);
 const note=document.createElement('small');note.textContent=hint;
 box.append(title,figure,note);return box;
}
function cell(value,diff=false){
 const td=document.createElement('td');
 td.textContent=diff?signed(value):fmt(value);
 if(diff&&value!==null)td.className=value<0?'negative':'positive';
 return td;
}
function show(plan){
 $('demoTitle').textContent='Szintetikus munkanap: '+plan.date+' · export revízió: '+plan.revision;
 const summary=$('demoStats');summary.replaceChildren(
  stat('Új csomag',plan.totalNew,'Kézi becslés'),
  stat('Újrakézbesítés',plan.totalRetry,'Kézi becslés'),
  stat('Összes igény',plan.totalDemand,'Nem hitelesített'),
  stat('Tervezett kapacitás',plan.plannedCapacity,'Kézi becslés'),
  stat('Megerősített kapacitás',plan.confirmedCapacity,'Nem jelenléti igazolás')
 );
 const tbody=$('demoRows');tbody.replaceChildren();
 for(const item of plan.rows){
  const tr=document.createElement('tr');
  const district=document.createElement('th');district.scope='row';district.textContent=item.district;
  tr.append(district,cell(item.newCount),cell(item.retryCount),cell(item.demand),
   cell(item.plannedCapacity),cell(item.confirmedCapacity),
   cell(item.plannedGap,true),cell(item.confirmedGap,true));
  tbody.appendChild(tr);
 }
 output.hidden=false;
 setStatus('A szintetikus terv feldolgozva, nincs adatmentés vagy hálózati feltöltés.');
}
function clear(){
 output.hidden=true;$('demoRows').replaceChildren();$('demoStats').replaceChildren();
 $('demoFile').value='';setStatus('Az előnézet törölve a böngészőből.');
}
$('demoForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const file=$('demoFile').files?.[0];
 if(!file){setStatus('Válassz JSON-fájlt.',true);return;}
 try{
  if(file.size>MAX_GOOGLE_DEMO_BYTES)throw Error('A fájl meghaladja a 128 KiB-os korlátot.');
  const plan=previewGoogleDemoExport(await file.text());
  show(plan);
 }catch{
  clear();setStatus('A fájl nem érvényes szintetikus iMile DEMÓ export. Nem történt adatmentés.',true);
 }
});
$('demoSample').addEventListener('click',()=>{
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const data={schema:'imile.demo-demand.v2',source:'synthetic-google-sheet',date,revision:1,
  verifiedByTrackingId:false,authoritative:false,estimatedOnly:true,
  demands:[
   {id:date+'__XII',date,district:'XII',newCount:80,retryCount:20},
   {id:date+'__XIII',date,district:'XIII',newCount:120,retryCount:30}
  ],
  draftCapacities:[
   {district:'XII',plannedCapacity:110,confirmedCapacity:95},
   {district:'XIII',plannedCapacity:160,confirmedCapacity:140}
  ]};
 try{show(previewGoogleDemoExport(JSON.stringify(data)));}catch{clear();setStatus('A helyi szintetikus minta nem tölthető be.',true);}
});
$('demoClear').addEventListener('click',clear);
