import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Fail-closed structural guard. This is NOT a proof of correct Rules semantics.
const files = [
  ['depokapacitas/firestore-v1-restricted.rules', 1000, /rules_version\s*=\s*['"]2['"]/],
  ['features/firestore-bridge.js', 1000, /(?:firebase|firestore|flotta|bridge)/i],
];
for (const [path, minBytes, required] of files) {
  test(`source-integrity: ${path} is not a placeholder or truncated stub`, () => {
    const bytes = statSync(path).size;
    const source = readFileSync(path, 'utf8');
    assert.ok(bytes >= minBytes, `${path}: suspiciously short (${bytes} bytes)`);
    assert.doesNotMatch(source, /PLACEHOLDER|CONTENT_WILL_BE_REPLACED|TODO_REPLACE_ME/i);
    assert.match(source, required);
  });
}
