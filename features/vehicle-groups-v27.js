/* Fleet Manager – two vehicle groups (courier / management and linehaul).
   Categories are persisted as vehicle.vehicleCategory in the existing shared state. */
(function(){
  const originalBody=document.getElementById('vehicleTable');
  const originalTable=originalBody?.closest('table');
  const originalSection=originalBody?.closest('.alerts-section');
  if(!originalBody||!originalTable||!originalSection)return;
  const en=()=>currentLang==='en';
  const label=(hu,english)=>en()?english:hu;
  const category=v=>v?.vehicleCategory==='other'?'other':'courier';

  const originalHeader=originalSection.querySelector('h2');
  const newHeader=document.createElement('th');
  newHeader.className='fleet-group-column';
  originalTable.tHead.rows[0].insertBefore(newHeader,originalTable.tHead.rows[0].lastElementChild);

  const otherSection=document.createElement('div');
  otherSection.className='alerts-section';
  otherSection.style.marginTop='1.5rem';
  const heading=document.createElement('div');
  heading.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;';
  const otherTitle=document.createElement('h2');
  otherTitle.style.margin='0';
  heading.appendChild(otherTitle);
  const newOther=document.createElement('button');
  newOther.type='button';
  newOther.addEventListener('click',()=>{
    openModal();
    const select=document.getElementById('vehicleCategory');
    if(select)select.value='other';
  });
  heading.appendChild(newOther);
  otherSection.appendChild(heading);
  const otherWrapper=document.createElement('div');
  otherWrapper.className='table-wrap';
  const otherTable=document.createElement('table');
  const otherHead=originalTable.tHead.cloneNode(true);
  otherTable.appendChild(otherHead);
  const otherBody=document.createElement('tbody');
  otherBody.id='otherVehicleTable';
  otherTable.appendChild(otherBody);
  otherWrapper.appendChild(otherTable);
  otherSection.appendChild(otherWrapper);
  originalSection.insertAdjacentElement('afterend',otherSection);

  const formStatus=document.getElementById('status');
  const categoryField=document.createElement('div');
  categoryField.className='form-group';
  const fieldLabel=document.createElement('label');
  fieldLabel.htmlFor='vehicleCategory';
  const formSelect=document.createElement('select');
  formSelect.id='vehicleCategory';
  for(const type of ['courier','other']){
    const option=document.createElement('option');
    option.value=type;
    formSelect.appendChild(option);
  }
  categoryField.append(fieldLabel,formSelect);
  formStatus?.closest('.form-group')?.insertAdjacentElement('afterend',categoryField);

  const groupName=type=>type==='other'
    ?label('Egyéb járművek – vezetői / linehaul','Other vehicles – management / linehaul')
    :label('Futárautók','Courier vehicles');
  const optionName=type=>type==='other'
    ?label('Egyéb (vezetői / linehaul)','Other (management / linehaul)')
    :label('Futárautó','Courier vehicle');

  function setCategory(id,next){
    if(next!=='other'&&next!=='courier')return;
    const vehicle=vehicles.find(v=>String(v.id)===String(id));
    if(!vehicle||category(vehicle)===next)return;
    const old=category(vehicle);
    vehicle.vehicleCategory=next;
    if(!Array.isArray(vehicle.history))vehicle.history=[];
    vehicle.history.push({
      id:uid(),type:'vehicleCategory',who:'',
      date:new Date().toISOString().slice(0,10),
      note:'Besorolás: '+(old==='other'?'Egyéb':'Futárautó')+
        ' → '+(next==='other'?'Egyéb':'Futárautó'),
      recordedAt:new Date().toISOString()
    });
    save();
    refresh();
  }
  function categorySelect(vehicle){
    const td=document.createElement('td');
    const sel=document.createElement('select');
    sel.className='fleet-category-select';
    sel.setAttribute('aria-label',label('Jármű besorolása: ','Vehicle category: ')+vehicle.rendszam);
    sel.style.cssText='padding:.4rem .5rem;border:1px solid #cbd5e1;border-radius:8px;min-width:190px;background:#f8fafc;';
    for(const key of ['courier','other']){
      const option=document.createElement('option');
      option.value=key;
      option.textContent=optionName(key);
      option.selected=category(vehicle)===key;
      sel.appendChild(option);
    }
    sel.addEventListener('change',()=>setCategory(vehicle.id,sel.value));
    td.appendChild(sel);
    return td;
  }
  const baseRenderTable=renderTable;
  renderTable=function(){
    baseRenderTable();
    newHeader.textContent=label('Besorolás','Category');
    const correspondingHead=otherTable.tHead.querySelector('.fleet-group-column');
    if(correspondingHead)correspondingHead.textContent=newHeader.textContent;
    const allRows=[...originalBody.rows];
    const visible=new Map(vehicles.map(v=>[String(v.rendszam).trim().toUpperCase(),v]));
    const groups={courier:[],other:[]};
    for(const tr of allRows){
      const plate=tr.cells[0]?.querySelector('strong')?.textContent?.trim().toUpperCase();
      const vehicle=visible.get(plate);
      if(!vehicle)continue;
      tr.insertBefore(categorySelect(vehicle),tr.lastElementChild);
      groups[category(vehicle)].push(tr);
    }
    originalBody.replaceChildren(...groups.courier);
    otherBody.replaceChildren(...groups.other);
    const nothing=body=>{
      if(body.rows.length)return;
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=14;
      td.style.cssText='text-align:center;color:#64748b;padding:1.4rem;';
      td.textContent=label('Nincs megjeleníthető autó.','No vehicles to display.');
      tr.appendChild(td);body.appendChild(tr);
    };
    nothing(originalBody);
    nothing(otherBody);
    const counts={courier:vehicles.filter(v=>category(v)==='courier').length,other:vehicles.filter(v=>category(v)==='other').length};
    const caption=(type)=>groups[type].length===counts[type]
      ?String(counts[type]):groups[type].length+' / '+counts[type];
    originalHeader.textContent=groupName('courier')+' ('+caption('courier')+')';
    otherTitle.textContent=groupName('other')+' ('+caption('other')+')';
    newOther.textContent=label('+ Új egyéb jármű','+ Add other vehicle');
    fieldLabel.textContent=label('Jármű besorolása','Vehicle category');
    for(const opt of formSelect.options)opt.textContent=optionName(opt.value);
  };

  const baseOpenModal=openModal;
  openModal=function(id=null){
    const ret=baseOpenModal(id);
    const v=id?vehicles.find(x=>String(x.id)===String(id)):null;
    formSelect.value=category(v);
    return ret;
  };
  renderTable();
})();