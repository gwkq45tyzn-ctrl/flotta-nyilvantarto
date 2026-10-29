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
  renderStats();
})();