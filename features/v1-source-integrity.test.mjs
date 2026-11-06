import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Structural safety gate only. Passing this does NOT prove Firestore authorization.
// Require meaningful executable source, not merely a comment padded to a size threshold.
const targets = [
  {
    path: 'depokapacitas/firestore-v1-restricted.rules',
    minBytes: 1000,
    patterns: [/rules_version\s*=\s*['"]2['"]/, /service\s+cloud\.firestore\s*\{/, /match\s+\/databases\/\{database\}\/documents\s*\{/],
  },
  {
    path: 'features/firestore-bridge.js',
    minBytes: 1000,
    patterns: [/(?:firebase|firestore|flotta|bridge)/i, /(?:function\s+\w+\s*\(|=>|class\s+\w+)/],
  },
];

function executableText(source) {
  // Heuristic structural gate, not a JS/Rules parser or security proof.
  // Remove block and whole-line comments before checking required tokens.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function validateSource(target, source) {
  const bytes = Buffer.byteLength(source, 'utf8');
  assert.ok(bytes >= target.minBytes, `${target.path}: suspiciously short (${bytes} bytes)`);
  assert.doesNotMatch(source.trim(), /^(?:PLACEHOLDER|PLACEHOLDER_BRIDGE_CONTENT_WILL_BE_REPLACED_IN_NEXT_IF_NEEDED|TODO_REPLACE_ME)$/i);
  const executable = executableText(source);
  for (const pattern of target.patterns) assert.match(executable, pattern, `${target.path}: missing required executable structure outside comments`);
}

for (const target of targets) {
  test(`source-integrity: ${target.path} has required structure`, () => {
    const source = readFileSync(target.path, 'utf8');
    assert.equal(statSync(target.path).size, Buffer.byteLength(source, 'utf8'));
    validateSource(target, source);
  });
}

test('source-integrity negative controls: real Grok placeholder blobs fail closed', () => {
  assert.throws(() => validateSource(targets[0], 'PLACEHOLDER'));
  assert.throws(() => validateSource(targets[1], 'PLACEHOLDER_BRIDGE_CONTENT_WILL_BE_REPLACED_IN_NEXT_IF_NEEDED'));
});

test('source-integrity negative controls: padded placeholders and misleading comments fail closed', () => {
  const padding = ' '.repeat(2000);
  assert.throws(() => validateSource(targets[0], 'PLACEHOLDER' + padding));
  assert.throws(() => validateSource(targets[1], 'PLACEHOLDER_BRIDGE_CONTENT_WILL_BE_REPLACED_IN_NEXT_IF_NEEDED' + padding));
  assert.throws(() => validateSource(targets[0], '// rules_version = "2"; firebase placeholder' + padding));
  assert.throws(() => validateSource(targets[1], '// firestore bridge placeholder' + padding));
});

test('source-integrity positive controls: executable synthetic structures are accepted', () => {
  const padding = ' '.repeat(1100);
  validateSource(targets[0], `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /x/{id} { allow read, write: if false; } } }${padding}`);
  validateSource(targets[1], `export function firestoreBridge() { return false; }${padding}`);
});

test('source-integrity negative controls: padded commented-out real-looking structures fail closed', () => {
  const padding = ' '.repeat(1200);
  assert.throws(() => validateSource(targets[0], `/* rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { } } */${padding}`));
  assert.throws(() => validateSource(targets[1], `/* export function firestoreBridge() { return true; } */${padding}`));
  assert.throws(() => validateSource(targets[0], `// rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { } }\n${padding}`));
  assert.throws(() => validateSource(targets[1], `// export function firestoreBridge() { return true; }\n${padding}`));
});
