/**
 * V1 GO-first policy: the CI may verify and package staging artifacts but may
 * NOT deploy Firebase Hosting or Firestore Rules automatically. Any future
 * release requires a separate independently reviewed, user-approved process.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const deploy=read('./deploy-preview.mjs');
const workflow=read('../../.github/workflows/imile-staging.yml');
const builder=read('./build-preview.mjs');

// Explicitly manual staging helper is retained, but it is not invoked by CI.
assert.match(deploy,/branch='staging\/imile-management-integration'/);
assert.match(deploy,/project='imile-management-staging'/);
assert.match(deploy,/channel='imile-qa'/);
assert.match(deploy,/hosting:channel:deploy/);
assert.doesNotMatch(deploy,/firebase\s+deploy\s+--only\s+hosting/);
assert.doesNotMatch(deploy,/channel='live'/);

// CI can build an ephemeral archive, never a published web endpoint or Rules.
assert.match(workflow,/actions\/upload-artifact@v4/);
assert.match(workflow,/name: imile-staging-preview/);
assert.match(workflow,/no automatic Firebase publish or Rules deploy/i);
assert.match(workflow,/NO-GO/);
assert.doesNotMatch(workflow,/secrets\.FIREBASE_SERVICE_ACCOUNT_/);
assert.doesNotMatch(workflow,/FIREBASE_HOSTING_SA|FIREBASE_SERVICE_ACCOUNT_STAGING/);
assert.doesNotMatch(workflow,/FirebaseExtended\/action-hosting-deploy/);
assert.doesNotMatch(workflow,/firebase-tools[^\n]*deploy\s+--only/);
assert.doesNotMatch(workflow,/--only\s+firestore:rules/);
assert.doesNotMatch(workflow,/channelId:/);
assert.doesNotMatch(workflow,/hosting:channel:deploy/);
assert.match(builder,/No legacy production Fleet application/);
assert.doesNotMatch(builder,/^\s*'index\.html',/m);

// Fail closed for any newly added automatic iMile release workflow too.
const workflowRoot=new URL('../../.github/workflows/',import.meta.url);
for(const name of readdirSync(workflowRoot).filter(n=>/^imile.*\.ya?ml$/i.test(n))){
  const src=read('../../.github/workflows/'+name);
  assert.doesNotMatch(src,/FirebaseExtended\/action-hosting-deploy|--only\s+firestore:rules|npx[^\n]*firebase[^\n]*\sdeploy\b|hosting:channel:deploy/,
    'iMile workflow must not auto-deploy: '+name);
}
console.log('PASS: all iMile CI jobs are validation/artifact-only; no auto Firebase deployment');
