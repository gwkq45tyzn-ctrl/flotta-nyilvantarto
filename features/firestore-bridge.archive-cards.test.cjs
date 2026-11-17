const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('features/firestore-bridge.js','utf8');
function harness(){
  const start=source.indexOf('  function patchArchiveAuxiliaryGuard()');
  const end=source.indexOf('\n  // Original Fleet',start);
  assert.ok(start>=0&&end>start,'immutable card archive needs a pre-mutation guard');
  let originalCalls=0,listener,message='';
  const context={archiveAuxiliaryGuardPatched:false,
    document:{getElementById:id=>id==='cardForm'?{
      addEventListener(type,fn,capture){assert.equal(type,'submit');assert.equal(capture,true);listener=fn;}
    }:null},status:text=>{message=text;},window:{}};
  for(const name of ['openCardModal','editCard','saveCard','deleteCard','exportData'])
    context.window[name]=()=>{originalCalls++;};
  vm.runInNewContext(source.slice(start,end)+';patchArchiveAuxiliaryGuard();',context);
  return {context,message:()=>message,calls:()=>originalCalls,submit:()=>{
    let stopped=false,prevented=false;
    listener({preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
    return {stopped,prevented};
  }};
}
test('immutable card archive create/edit/save/delete cannot reach original mutation handlers',()=>{
  const h=harness();
  for(const name of ['openCardModal','editCard','saveCard','deleteCard'])h.context.window[name]('synthetic-card');
  assert.equal(h.calls(),0);
  assert.match(h.message(),/írásvédett/);
});
test('card inline submit is cancelled in capture phase before replacing rich in-memory row',()=>{
  const h=harness();assert.deepEqual(h.submit(),{stopped:true,prevented:true});assert.equal(h.calls(),0);
});
test('private original export remains callable for complete backup',()=>{
  const h=harness();h.context.window.exportData();assert.equal(h.calls(),1);
});
