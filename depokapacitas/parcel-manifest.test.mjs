import assert from 'node:assert/strict';
import {previewParcelManifest} from './parcel-manifest.mjs';

const date='2026-11-02';
const rows=[
 {'Dátum':'2026-11-02','Csomagszám':'6123456789012','Kerület':'IX.','Kategória':'Új'},
 {'Dátum':'2026-11-02','Csomagszám':'6123456789012','Kerület':'IX.','Kategória':'Új'},
 {'Dátum':'2026-11-02','Csomagszám':'6123456789013','Kerület':'IX.','Kategória':'Újrakézbesítendő'},
 {'Dátum':'2026-11-02','Csomagszám':'6123456789014','Kerület':'X.','Kategória':'Új'}
];
const stored=[
 {date,district:'IX.',newCount:1,retryCount:1},
 {date,district:'X.',newCount:1,retryCount:0}
];
const calc=(input=rows,patch={})=>previewParcelManifest(input,{date,storedDemands:stored,sourceReady:true,...patch});
let r=calc();
assert.equal(r.verified,true);
assert.equal(r.uniqueCount,3);
assert.equal(r.duplicateCount,1);
assert.equal(r.comparisonStatus,'match');
assert.deepEqual(r.comparisons.map(x=>x.status),['match','match']);
assert.equal(JSON.stringify(r).includes('6123456789012'),false,'Do not leak tracking IDs to UI output');
r=calc([...rows,{...rows[1],'Kategória':'Újrakézbesítendő'}]);
assert.equal(r.verified,false);
assert.equal(r.comparisonStatus,'invalid_manifest');
assert.equal(r.invalidCount,1);
r=calc([...rows,{...rows[0],'Kategória':'nonsense'}]);
assert.equal(r.verified,false);
assert.equal(r.inputErrors.length,1);
r=calc(rows,{storedDemands:[stored[0]]});
assert.equal(r.comparisonStatus,'mismatch');
assert.equal(r.comparisons[1].status,'missing_aggregate');
r=calc(rows,{storedDemands:[...stored,{...stored[0]}]});
assert.equal(r.comparisonStatus,'mismatch');
assert.equal(r.comparisons[0].status,'duplicate_aggregate');
r=calc(rows,{sourceReady:false});
assert.equal(r.comparisonStatus,'source_unavailable');
r=calc([{...rows[0],'Dátum':'2026-11-03'}]);
assert.equal(r.verified,false);
assert.equal(r.hasRecords,false);
assert.equal(r.comparisonStatus,'invalid_manifest');
r=calc(rows,{storedDemands:[...stored,{date,district:'XI.',newCount:3,retryCount:2}]});
assert.equal(r.comparisonStatus,'mismatch');
assert.equal(r.comparisons[2].status,'missing_manifest');
assert.throws(()=>previewParcelManifest(Array(5001).fill(rows[0]),{date}));
console.log('PASS: private parcel-level dedupe, conflicting categories, category validation and aggregate parity');
