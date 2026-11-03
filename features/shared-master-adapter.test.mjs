import assert from 'node:assert/strict';
import { planSharedMigration, fleetVehicleToDepo, depoToFleetVehicle } from './shared-master-adapter.mjs';

const snap = {
  vehicles: [{ id: 'v1', rendszam: 'ABC-123', gyartmany: 'Ford', modell: 'Transit', status: 'Aktív', km: 45000, history: [{ type: 'atadas' }] }],
  drivers: [{ id: 'DA001', nev: 'Teszt Futár', status: 'Aktív', kapacitas: 80 }],
  fuelCards: [],
  contacts: []
};

const plan = planSharedMigration(snap);
assert.equal(plan.counts.vehicles, 1);
assert.equal(plan.counts.drivers, 1);
assert.equal(plan.preservedVehicleFields, true);
assert.equal(plan.preservedDriverFields, true);
assert.equal(plan.vehicles[0].plate, 'ABC123');
assert.equal(plan.vehicles[0].flotta.km, 45000);
assert.equal(plan.vehicles[0].flotta.history.length, 1);

const round = depoToFleetVehicle(plan.vehicles[0]);
assert.equal(round.rendszam, 'ABC-123');
assert.equal(round.km, 45000);
console.log('shared-master-adapter tests passed');
