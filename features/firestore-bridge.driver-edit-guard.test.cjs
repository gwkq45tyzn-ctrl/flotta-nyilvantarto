const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(new URL('./firestore-bridge.js','file://'+__filename),'utf8');
function harness(){
  const start=source.indexOf('  function patchDriverEditGuard()');
  assert.ok(start>=0,'original bridge must install driver form stale-record guard');
  const end=source.indexOf('\n  // Original Fleet',start);
  let row={id:'rich-driver',kapacitas:80,status:'aktiv',history:[{note:'keep'}]};
  let listener,closed=false,opened=null,message='';
  const storage=new Map();
  const fields=[{id:'driverCapacity',value:'75'},{id:'driverName',value:'Synthetic'}];
  const form={addEventListener(type,fn,capture){assert.equal(type,'submit');assert.equal(capture,true);listener=fn;},querySelectorAll(){return fields;}};
  const context={driverEditGuardPatched:false,openDriverEdit:null,
    STALE_DRIVER_DRAFT:'flotta_stale_driver_draft_v1',currentRevision:3,
    snapshot:()=>({drivers:[structuredClone(row)]}),
    document:{getElementById(id){return id==='driverForm'?form:id==='driverEditId'?{value:'rich-driver'}:null;}},
    localStorage:{setItem(k,v){storage.set(k,v);}},
    status:text=>{message=text;},
    window:{openDriverModal(id){opened=id;},closeDriverModal(){closed=true;}}};
  vm.runInNewContext(source.slice(start,end)+';patchDriverEditGuard();',context);
  return {context,storage,open:()=>context.window.openDriverModal('rich-driver'),
    close:()=>context.window.closeDriverModal(),change:()=>{row.kapacitas=65;},
    submit:()=>{let prevented=false,stopped=false;listener({preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});return {prevented,stopped};},
    message:()=>message};
}
test('stale driver form is blocked before original handler mutates Fleet; draft preserved separately',()=>{
  const h=harness();h.open();h.change();
  assert.deepEqual(h.submit(),{prevented:true,stopped:true});
  const draft=JSON.parse(h.storage.get('flotta_stale_driver_draft_v1'));
  assert.equal(draft.id,'rich-driver');
  assert.equal(draft.fields.driverCapacity,'75');
  assert.match(h.message(),/Ütközés/);
  assert.equal(h.storage.has('flotta_pending_v16'),false);
});
test('unchanged driver and explicit close/reopen allow current form submission',()=>{
  const h=harness();h.open();
  assert.deepEqual(h.submit(),{prevented:false,stopped:false});
  h.change();h.close();h.open();
  assert.deepEqual(h.submit(),{prevented:false,stopped:false});
});
