/* v28 – Service/oil-change warnings based on odometer kilometres.
   The existing 'Next service (km)' field is the only source for the threshold.
   Never clear these warnings because the operating status was changed. */
(function () {
  const LIMIT_KM = 1000;
  const originalRenderAlerts = renderAlerts;

  function km(value, allowZero) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= (allowZero ? 0 : 1) ? parsed : null;
  }
  function translate(hu, en) { return currentLang === 'en' ? en : hu; }
  function formatKm(n) {
    return Number(n).toLocaleString(currentLang === 'en' ? 'en-GB' : 'hu-HU');
  }
  function serviceWarnings() {
    return vehicles.map(v => {
      const actual = km(v.km, true);
      const deadline = km(v.kovetkezoSzervizKm, false);
      return actual !== null && deadline !== null
        ? { vehicle: v, actual, deadline, remaining: deadline - actual } : null;
    }).filter(x => x && x.remaining <= LIMIT_KM)
      .sort((a,b) => a.remaining - b.remaining || String(a.vehicle.rendszam).localeCompare(String(b.vehicle.rendszam)));
  }
  function node(tag, text, style) {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = text;
    if (style) el.style.cssText = style;
    return el;
  }
  function createServiceWarning(entry) {
    const {vehicle, actual, deadline, remaining} = entry;
    const overdue = remaining <= 0;
    const row = node('div', null,
      'background:'+(overdue?'#fff1f2':'#fffbeb')+';border-left:4px solid '+(overdue?'#dc2626':'#d97706')+';');
    row.className = 'alert-item';
    row.setAttribute('data-service-km-vehicle', String(vehicle.id));

    const details = node('div', null, 'flex:1;min-width:225px;');
    const plate = node('strong', String(vehicle.rendszam || '—'));
    const title = node('span', ' — '+(overdue
      ?translate('Olajcsere / kötelező szerviz esedékes','Oil change / scheduled service overdue')
      :translate('Olajcsere / szerviz közeleg','Oil change / service approaching')));
    const severity = node('span', overdue
      ?translate('Túllépés: ','Over by ')+formatKm(Math.max(0, -remaining))+' km'
      :translate('Hátralévő: ','Remaining: ')+formatKm(remaining)+' km');
    severity.className = 'badge ' + (overdue ? 'overdue' : 'soon');
    severity.style.marginLeft = '.6rem';
    const readings = node('div',
      translate('Aktuális: ','Current: ')+formatKm(actual)+' km  |  '+
      translate('Következő szerviz: ','Next service: ')+formatKm(deadline)+' km',
      'font-size:.86rem;color:#475569;margin-top:.3rem;');
    details.append(plate,title,severity,readings);

    const controls = node('div',null,'display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;');
    const select = node('select');
    select.setAttribute('aria-label', translate('Jármű állapota: ','Vehicle status: ')+String(vehicle.rendszam));
    select.style.cssText='padding:.5rem;border:1px solid #cbd5e1;border-radius:8px;max-width:190px;';
    const options = [
      ['aktiv', translate('Operáció (aktív)','Operations (active)')],
      ['szerviz',translate('Szerviz (inaktív)','Service (inactive)')]
    ];
    if (vehicle.status && !options.some(x=>x[0]===vehicle.status)) {
      options.unshift([vehicle.status,String(vehicle.status)]);
    }
    options.forEach(([value,label])=>{
      const opt=node('option',label);
      opt.value=value;
      opt.selected=value===vehicle.status;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => quickStatusChange(vehicle.id, select.value));
    const edit=node('button',translate('Szerviz km módosítása','Edit service mileage'));
    edit.type='button';
    edit.className='secondary';
    edit.addEventListener('click', () => editVehicle(vehicle.id));
    controls.append(select,edit);
    row.append(details, controls);
    return row;
  }
  renderAlerts = function () {
    originalRenderAlerts();
    const host = document.getElementById('alerts');
    if (!host) return;
    const due = serviceWarnings();
    if (!due.length) return;
    // Original renderer displays a no-alerts paragraph if it has no date warnings.
    if (!host.querySelector('.alert-item')) host.replaceChildren();
    host.prepend(...due.map(createServiceWarning));
  };
  renderAlerts();
})();