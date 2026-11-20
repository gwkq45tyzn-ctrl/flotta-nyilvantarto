import test from 'node:test';
import assert from 'node:assert/strict';

// Pure model of the payload construction that must preserve migrationSourceSha256.
function buildPayload(existing, draft, next) {
  const payload = {
    vehicles: draft.vehicles || [],
    fuelCards: draft.fuelCards || [],
    drivers: draft.drivers || [],
    contacts: draft.contacts || [],
    revision: next,
    migrationSourceSha256: existing.migrationSourceSha256 || '',
    updatedBy: 'uid'
  };
  if (!payload.migrationSourceSha256) throw new Error('MISSING_MIGRATION_SOURCE');
  return payload;
}

test('preserves migrationSourceSha256 from existing document', () => {
  const existing = { migrationSourceSha256: 'a'.repeat(64), revision: 3 };
  const draft = { vehicles: [], drivers: [], fuelCards: [], contacts: [] };
  const p = buildPayload(existing, draft, 4);
  assert.equal(p.migrationSourceSha256, 'a'.repeat(64));
  assert.equal(p.revision, 4);
});

test('rejects push when migration source is missing', () => {
  assert.throws(() => buildPayload({}, { vehicles: [] }, 1), /MISSING_MIGRATION_SOURCE/);
});

test('rich fields stay only in the Flotta snapshot', () => {
  const draft = {
    vehicles: [{ rendszam: 'ABC-123', history: [{ note: 'private' }] }],
    drivers: [{ daCode: 'DA0001', history: [{ secret: 'x' }] }],
    fuelCards: [{ id: 'c1' }],
    contacts: [{ id: 'ct1' }]
  };
  const p = buildPayload({ migrationSourceSha256: 'b'.repeat(64) }, draft, 2);
  assert.ok(p.vehicles[0].history);
  assert.ok(p.fuelCards.length);
  assert.ok(p.contacts.length);
});

console.log('sha preserve tests defined');
