import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Structural safety gate only. Passing this does NOT prove Firestore authorization.
// Require meaningful executable source, not merely a comment padded to a size threshold.
const targets = [
  {
    path: 'depokapacitas/firestore-v1-restricted.rules',
    minBytes: 1000,
    minExecutableChars: 110,
    patterns: [/rules_version\s*=\s*['"]2['"]/, /service\s+cloud\.firestore\s*\{/, /match\s+\/databases\/\{database\}\/documents\s*\{/],
  },
  {
    path: 'features/firestore-bridge.js',
    minBytes: 1000,
    minExecutableChars: 80,
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
  assert.doesNotMatch(source, /^(?:<{7}|={7}|>{7})(?:\s|$)/m, `${target.path}: unresolved merge conflict marker`);
  assert.doesNotMatch(source, /[\u0000\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069]|\ufeff(?!^)/u, `${target.path}: hidden control/zero-width character`);
  const executable = executableText(source);
  const meaningfulChars = executable.replace(/\s/g, '').length;
  assert.ok(meaningfulChars >= target.minExecutableChars, `${target.path}: insufficient executable content (${meaningfulChars} chars)`);
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
  validateSource(targets[1], `export function firestoreBridge() { const flotta = { vehicles: [], drivers: [], revision: 0 }; return { firestore: flotta, bridge: true }; }${padding}`);
});

test('source-integrity negative controls: padded commented-out real-looking structures fail closed', () => {
  const padding = ' '.repeat(1200);
  assert.throws(() => validateSource(targets[0], `/* rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { } } */${padding}`));
  assert.throws(() => validateSource(targets[1], `/* export function firestoreBridge() { return true; } */${padding}`));
  assert.throws(() => validateSource(targets[0], `// rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { } }\n${padding}`));
  assert.throws(() => validateSource(targets[1], `// export function firestoreBridge() { return true; }\n${padding}`));
});

test('source-integrity negative controls: truncated executable prefixes padded to threshold fail closed', () => {
  const padding = ' '.repeat(2000);
  assert.throws(() => validateSource(targets[0], `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { } }${padding}`));
  assert.throws(() => validateSource(targets[1], `export function firestoreBridge() { return true; }${padding}`));
});


test('source-integrity negative controls: merge conflicts and hidden characters fail closed', () => {
  const padding = ' '.repeat(1200);
  const validRules = `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /x/{id} { allow read, write: if false; } } }${padding}`;
  const validBridge = `export function firestoreBridge() { const flotta = { vehicles: [], drivers: [], revision: 0 }; return { firestore: flotta, bridge: true }; }${padding}`;
  for (const marker of ['<<<<<<< HEAD', '=======', '>>>>>>> feature']) {
    assert.throws(() => validateSource(targets[0], validRules + '\n' + marker));
    assert.throws(() => validateSource(targets[1], validBridge + '\n' + marker));
  }
  for (const hidden of ['\u0000', '\u200b', '\u200c', '\u200d', '\u202e', '\u2066', '\u2069']) {
    assert.throws(() => validateSource(targets[0], validRules + hidden));
    assert.throws(() => validateSource(targets[1], validBridge + hidden));
  }
});


test('P0 regression: punctuation collision SDK cases must remain executable, not commented out', () => {
  // This guards the previously observed escaped-newline bug that made a green
  // emulator run silently skip both AAA1/aaa-1 adversarial writes.
  const source = readFileSync('staging/imile-management/fleet/v1-identity-slice-language-emulator.mjs', 'utf8');
  const executable = executableText(source);
  assert.match(executable, /punctuationCollision\.drivers\[0\]\.daCode\s*=\s*'AAA1'/);
  assert.match(executable, /punctuationCollision\.drivers\[1\]\.daCode\s*=\s*'aaa-1'/);
  assert.match(executable, /await allowed\('EXPECTED UNSAFE: AAA1 counted separately from aaa-1 \(first\)'/);
  assert.match(executable, /await allowed\('EXPECTED UNSAFE: AAA1 counted separately from aaa-1 \(second\)'/);
  assert.doesNotMatch(source, /\\\\n\s*await allowed\('EXPECTED UNSAFE:/);
});
