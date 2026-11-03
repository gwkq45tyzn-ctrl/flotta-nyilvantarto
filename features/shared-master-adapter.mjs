/**
 * Shared master data adapter: original Flotta snapshot <-> Depó collections.
 * Preserves all detailed Flotta fields. No network, pure functions.
 * Synthetic data only.
 */
export function fleetVehicleToDepo(v) {
  if (!v || !v.rendszam) return null;
  const plate = String(v.rendszam).replace(/[\s-]/g, '').toUpperCase();
  return {
    id: plate,
    plate,
    model: [v.gyartmany, v.modell].filter(Boolean).join(' ') || '',
    status: v.status === 'Aktív' ? 'Elérhető' : (v.status || 'Elérhető'),
    // Preserve full original payload for round-trip
    flotta: { ...v }
  };
}

export function fleetDriverToDepo(d) {
  if (!d || !d.id) return null;
  const code = String(d.id).trim().toUpperCase();
  return {
    id: code,
    daCode: code,
    name: d.nev || d.name || '',
    vendor: d.vallalkozo || d.vendor || '',
    capacity: Number(d.kapacitas || d.capacity || 0),
    active: d.status !== 'Inaktív',
    flotta: { ...d }
  };
}

export function depoToFleetVehicle(doc) {
  if (!doc) return null;
  return doc.flotta ? { ...doc.flotta } : {
    rendszam: doc.plate,
    status: doc.status === 'Elérhető' ? 'Aktív' : doc.status
  };
}

export function depoToFleetDriver(doc) {
  if (!doc) return null;
  return doc.flotta ? { ...doc.flotta } : {
    id: doc.daCode || doc.id,
    nev: doc.name,
    status: doc.active ? 'Aktív' : 'Inaktív'
  };
}

export function planSharedMigration(snapshot) {
  const vehicles = (snapshot.vehicles || []).map(fleetVehicleToDepo).filter(Boolean);
  const drivers = (snapshot.drivers || []).map(fleetDriverToDepo).filter(Boolean);
  return {
    vehicles,
    drivers,
    preservedVehicleFields: vehicles.every(v => v.flotta && v.flotta.rendszam),
    preservedDriverFields: drivers.every(d => d.flotta && d.flotta.id),
    counts: { vehicles: vehicles.length, drivers: drivers.length }
  };
}
