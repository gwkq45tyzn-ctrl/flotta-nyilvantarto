import test from 'node:test';
import assert from 'node:assert/strict';
import {qaAssetAllowed} from './v1-qa-asset-routes.mjs';

test('Depot parcel preview and cutover HTML are served; report HTML is not',()=>{
  assert.equal(qaAssetAllowed('/index.html'),true);
  assert.equal(qaAssetAllowed('/depokapacitas/index.html'),true);
  assert.equal(qaAssetAllowed('/depokapacitas/app.js'),true);
  assert.equal(qaAssetAllowed('/depokapacitas/style.css'),true);
  assert.equal(qaAssetAllowed('/depokapacitas/parcel-preview.html'),true);
  assert.equal(qaAssetAllowed('/staging/imile-management/cutover.html'),true);
  assert.equal(qaAssetAllowed('/staging/imile-management/reports/index.html'),false);
  assert.equal(qaAssetAllowed('/depokapacitas/../firestore.rules'),false);
  assert.equal(qaAssetAllowed('/features/firestore-bridge.js'),true);
});
