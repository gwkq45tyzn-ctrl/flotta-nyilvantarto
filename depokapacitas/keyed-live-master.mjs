/**
 * Post-seal live keyed master projection for Depó.
 * After trusted seal, capacity, status and eligibility MUST come from
 * server-confirmed flottaDrivers / flottaVehicles, never from frozen
 * archived arrays or editable mirrors.
 *
 * Pure functions + listener helper. No writes.
 */
export function projectKeyedMasters(driversSnap, vehiclesSnap, sealedSource) {
  if (!sealedSource || sealedSource.sealed !== true) return null;
  if (!driversSnap || !vehiclesSnap) return null;
  // Reject cache / pending
  if (driversSnap.metadata?.fromCache || driversSnap.metadata?.hasPendingWrites) return null;
  if (vehiclesSnap.metadata?.fromCache || vehiclesSnap.metadata?.hasPendingWrites) return null;

  const normalizeDA = s => String(s || '').trim().toUpperCase();
  const normalizePlate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();

  const drivers = driversSnap.docs.map(d => {
    const data = d.data();
    const id = d.id;
    if (normalizeDA(data.daCode) !== id) return null;
    return {
      id,
      daCode: id,
      name: data.name || data.nev || '',
      capacity: Number(data.kapacitas ?? data.capacity ?? 0),
      active: ['aktiv', 'aktív'].includes(String(data.status || '').toLowerCase()),
      status: data.status,
      // preserve rich history if present
      history: data.history || []
    };
  }).filter(Boolean);

  const vehicles = vehiclesSnap.docs.map(d => {
    const data = d.data();
    const id = d.id;
    if (normalizePlate(data.rendszam || data.plate) !== id) return null;
    const st = String(data.status || '').toLowerCase();
    const status = ['aktiv', 'aktív'].includes(st) ? 'Elérhető'
      : st === 'szerviz' ? 'Szerviz' : 'Leállított';
    return {
      id,
      plate: id,
      model: data.model || [data.gyartmany, data.modell].filter(Boolean).join(' '),
      status,
      history: data.history || []
    };
  }).filter(Boolean);

  // Fail closed if any archived identity is missing from keyed
  const archivedDAs = new Set((sealedSource.drivers || []).map(d => normalizeDA(d.daCode)));
  const archivedPlates = new Set((sealedSource.vehicles || []).map(v => normalizePlate(v.rendszam)));
  const gotDAs = new Set(drivers.map(d => d.id));
  const gotPlates = new Set(vehicles.map(v => v.id));
  if ([...archivedDAs].some(id => id && !gotDAs.has(id))) return null;
  if ([...archivedPlates].some(id => id && !gotPlates.has(id))) return null;

  return { trusted: true, drivers, vehicles, source: 'keyed-live', sealed: true };
}

export function capacityFromKeyed(driver) {
  return Math.max(0, Number(driver?.capacity) || 0);
}
