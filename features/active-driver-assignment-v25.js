/* v25 — Only active couriers can receive a vehicle.
   Returns can still be logged when the original courier is now inactive.
   Vehicle assignments are always recorded via the handover form. */
(function(){
  const text=(hu,en)=>currentLang==='en'?en:hu;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element=id=>document.getElementById(id);
  function currentHandover(v){
    if(!v)return null;
    const events=(Array.isArray(v.history)?v.history:[])
      .map((event,index)=>({event,index}))
      .filter(x=>x.event&&['atadas','visszaadas'].includes(x.event.type));
    events.sort((a,b)=>(Date.parse(a.event.recordedAt||a.event.date||'')||0)-
      (Date.parse(b.event.recordedAt||b.event.date||'')||0)||a.index-b.index);
    if(events.length){
      const last=events[events.length-1].event;
      return last.type==='atadas'&&last.who?.trim()?last.who.trim():null;
    }
    return v.currentSince&&v.currentDriver?.trim()?v.currentDriver.trim():null;
  }
  function refreshDriverChoices(){
    const select=element('hovWho'),type=element('hovType')?.value;
    if(!select)return;
    const chosen=select.value;
    let options=[];
    if(type==='visszaadas'){
      const v=vehicles.find(car=>car.id===element('hovVehicle')?.value);
      const holder=currentHandover(v);
      if(holder)options=[{value:holder,label:holder}];
    }else{
      options=drivers.filter(d=>d.status==='aktiv'&&d.name?.trim())
        .slice().sort((a,b)=>a.name.localeCompare(b.name,'hu'))
        .map(d=>({value:d.name,label:d.name+(d.daCode?' · '+d.daCode:'')}));
    }
    select.innerHTML='<option value="">'+text('Válassz aktív futárt...','Select an active courier...')+'</option>'+
      options.map(option=>'<option value="'+esc(option.value)+'">'+esc(option.label)+'</option>').join('');
    if(options.some(o=>o.value===chosen))select.value=chosen;
    else if(type==='visszaadas'&&options.length===1)select.value=options[0].value;
  }
  const origOpen=openHandoverModal;
  openHandoverModal=function(...args){const out=origOpen(...args);refreshDriverChoices();return out;};
  const origFilter=filterHandoverVehicles;
  filterHandoverVehicles=function(...args){const out=origFilter(...args);refreshDriverChoices();return out;};
  element('hovVehicle')?.addEventListener('change',refreshDriverChoices);
  const origPopulate=populateSelects;
  populateSelects=function(...args){const out=origPopulate(...args);refreshDriverChoices();return out;};
  const origSave=saveHandover;
  saveHandover=function(event){
    const type=element('hovType')?.value,who=element('hovWho')?.value||'';
    if(type==='atadas'){
      const active=drivers.find(d=>d.name===who&&d.status==='aktiv');
      if(!active){
        event?.preventDefault?.();
        alert(text('Autót kizárólag aktív státuszú futár vehet át.','Only active couriers can receive a vehicle.'));
        return;
      }
    }
    return origSave(event);
  };
  const assignment=element('currentDriver');
  if(assignment){
    assignment.readOnly=true;
    assignment.title=text('A tényleges átvevőt az Átadás / Visszaadás részen rögzítsd.','Record vehicle holders through the handover form.');
    assignment.setAttribute('aria-readonly','true');
    assignment.style.background='#f1f5f9';
    const hint=document.createElement('small');
    hint.textContent=text('A sofőr hozzárendelése az Átadás / Visszaadás űrlapon történik.','Assign a courier in the Handover / Return form.');
    hint.style.cssText='display:block;margin-top:.35rem;color:#64748b;';
    assignment.parentElement?.appendChild(hint);
  }
  // No new assignments through the free-text car editor.
  const origSaveVehicle=saveVehicle;
  saveVehicle=function(event){
    const id=element('editId')?.value;
    const old=vehicles.find(v=>v.id===id);
    const expected=String(old?.currentDriver||'').trim();
    const entered=String(element('currentDriver')?.value||'').trim();
    if(entered!==expected){
      event?.preventDefault?.();
      alert(text('Futárt csak az Átadás / Visszaadás részen lehet autóhoz rendelni.','Assign couriers through the Handover / Return form.'));
      return;
    }
    return origSaveVehicle(event);
  };
})();