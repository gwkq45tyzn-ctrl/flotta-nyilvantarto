/* Flotta v23 – in-use dashboard helper.
   Integration requires inclusion as a classic script after the original app JS.
   No embedded fleet records or access credentials. */
(function(){
  function activeHandover(vehicle){
    const events=(Array.isArray(vehicle.history)?vehicle.history:[])
      .map((event,index)=>({event,index}))
      .filter(x=>x.event && ['atadas','visszaadas'].includes(x.event.type));
    events.sort((a,b)=>(Date.parse(a.event.recordedAt||a.event.date||'')||0)-
      (Date.parse(b.event.recordedAt||b.event.date||'')||0)||a.index-b.index);
    if(events.length){
      const last=events[events.length-1].event;
      return last.type==='atadas'&&last.who?.trim()
        ? {who:last.who.trim(),date:last.date||last.recordedAt?.slice(0,10)||''} : null;
    }
    return vehicle.currentSince&&vehicle.currentDriver?.trim()
      ? {who:vehicle.currentDriver.trim(),date:String(vehicle.currentSince).slice(0,10)} : null;
  }
  const escapeText=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function items(){return vehicles.map(vehicle=>({vehicle,handover:activeHandover(vehicle)})).filter(x=>x.handover);}
  function label(hu,en){return currentLang==='en'?en:hu;}
  window.showInUseFleetTile=function(){
    const entries=items(),content=document.getElementById('filterModalContent');
    document.getElementById('filterModalTitle').textContent=label('Használatban lévő autók','Vehicles in use')+' ('+entries.length+')';
    content.innerHTML=entries.length
      ? '<div class="table-wrap"><table style="min-width:450px"><thead><tr><th>'+label('Rendszám','Plate')+'</th><th>'+label('Átvevő','Collected by')+'</th><th>'+label('Átvétel','Handover date')+'</th></tr></thead><tbody>'+
        entries.map(({vehicle,handover})=>'<tr><td>'+escapeText(vehicle.rendszam)+'</td><td>'+escapeText(handover.who)+'</td><td>'+escapeText(handover.date)+'</td></tr>').join('')+'</tbody></table></div>'
      : '<p>'+label('Nincs rögzített, vissza nem adott autó.','No recorded outstanding handovers.')+'</p>';
    document.getElementById('filterModal').classList.add('active');
  };
  const original=renderStats;
  renderStats=function(){
    original();
    // Operational status is not the same as a confirmed vehicle handover.
    const activeHeading=document.getElementById('stats')?.querySelector?.('.stat-card.success h3');
    if(activeHeading)activeHeading.textContent=label('Operációban (aktív)','In operations (active)');
    const entries=items();
    const card=document.createElement('div');
    card.className='stat-card';
    card.style.cssText='cursor:pointer;border-left-color:#0891b2';
    card.setAttribute('role','button');card.tabIndex=0;
    card.innerHTML='<h3>'+label('Használatban lévő autók','Vehicles in use')+'</h3><div class="value">'+entries.length+'</div>'+
      entries.slice(0,2).map(({vehicle,handover})=>'<div style="font-size:.8rem;margin-top:.4rem">'+escapeText(vehicle.rendszam)+': '+escapeText(handover.who)+'</div>').join('');
    card.onclick=window.showInUseFleetTile;
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();window.showInUseFleetTile();}};
    document.getElementById('stats').appendChild(card);
  };

  // An existing driver name may be a legacy assignment, not a handover.
  // Filter and validate against actual unmatched handovers instead.
  filterHandoverVehicles=function(){
    const type=document.getElementById('hovType').value;
    const select=document.getElementById('hovVehicle');
    if(!select)return;
    const all=vehicles;
    let available;
    if(type==='szervizbol_vissza')available=all.filter(v=>v.status==='szerviz');
    else if(type==='szerviz')available=all.filter(v=>v.status==='aktiv');
    else if(type==='atadas')available=all.filter(v=>v.status==='aktiv'&&!activeHandover(v));
    else if(type==='visszaadas')available=all.filter(v=>Boolean(activeHandover(v)));
    else available=all.filter(v=>v.status==='aktiv');
    const selected=select.value;
    select.innerHTML='<option value="">'+label('Válassz járművet...','Select a vehicle...')+'</option>'+
      available.map(v=>'<option value="'+escapeText(v.id)+'">'+escapeText(v.rendszam)+
      ' – '+escapeText(v.gyartmany||'')+' '+escapeText(v.modell||'')+'</option>').join('');
    if(selected&&available.some(v=>v.id===selected))select.value=selected;
  };
  saveHandover=function(e){
    e.preventDefault();
    const get=id=>document.getElementById(id)?.value||'';
    const vehicle=vehicles.find(v=>v.id===get('hovVehicle'));
    if(!vehicle){alert(label('Válassz járművet!','Select a vehicle!'));return;}
    const entry={
      id:uid(),type:get('hovType'),who:get('hovWho').trim(),date:get('hovDate'),
      km:get('hovKm')?Number(get('hovKm')):null,note:get('hovNote').trim(),
      recordedAt:new Date().toISOString()
    };
    if(!entry.who||!entry.date){alert(label('Válassz átvevőt és dátumot!','Select a driver and date!'));return;}
    if(entry.type==='atadas'){
      if(vehicle.status!=='aktiv'){alert(label('Az autó nincs operációban.','The vehicle is not in operations.'));return;}
      if(activeHandover(vehicle)){
        alert(label('Ez az autó még nincs visszaadva.','This car has not been returned yet.'));return;
      }
      const duplicate=vehicles.find(v=>v.id!==vehicle.id &&
        activeHandover(v)?.who.toLocaleLowerCase('hu')===entry.who.toLocaleLowerCase('hu'));
      if(duplicate){
        alert(label('Az átvevő már használja ezt az autót: ','The driver already has vehicle: ')+duplicate.rendszam);return;
      }
    }else if(entry.type==='visszaadas'&&!activeHandover(vehicle)){
      alert(label('Ehhez az autóhoz nincs nyitott átvétel.','No open handover for this vehicle.'));return;
    }
    if(!Array.isArray(vehicle.history))vehicle.history=[];
    vehicle.history.push(entry);
    if(Number.isFinite(entry.km)&&entry.km!==null)vehicle.km=entry.km;
    if(entry.type==='atadas'){
      vehicle.currentDriver=entry.who;vehicle.currentSince=entry.date;
    }else if(entry.type==='visszaadas'){
      vehicle.currentDriver=null;vehicle.currentSince=null;
    }else if(entry.type==='szerviz'){
      setVehicleOperatingStatus(vehicle,'szerviz');vehicle.statusSince=entry.date;
    }else if(entry.type==='szervizbol_vissza'){
      setVehicleOperatingStatus(vehicle,'aktiv');vehicle.statusSince=entry.date;
    }
    save();closeHandoverModal();refresh();
    alert(label('Rögzítve!','Recorded!'));
  };

  renderStats();
})();