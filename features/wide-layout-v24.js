/* v24: full width and synchronized horizontal scrollbars. */
(function(){
const css=[
'.container{max-width:none!important;width:100%!important;margin:0!important;padding:1rem clamp(.7rem,1.4vw,1.5rem)!important;}',
'.alerts-section{width:100%;min-width:0;}',
'.table-wrap{width:100%;max-width:100%;overflow-x:auto;overflow-y:auto;overscroll-behavior-x:contain;}',
'.table-wrap table{width:max-content;min-width:100%;}',
'.table-wrap th,.table-wrap td{padding:.65rem .75rem;}',
'.table-wrap td{white-space:nowrap;}',
'.table-wrap td[style*="white-space:normal"]{white-space:normal;}',
'.table-wrap th{white-space:nowrap;}',
'#filterModal .modal{width:min(98vw,1600px)!important;max-width:98vw!important;}',
'#filterModalContent{max-height:72vh!important;}',
'.table-top-scroll{height:18px;overflow-x:auto;overflow-y:hidden;width:100%;margin:.2rem 0 0;}',
'.table-top-scroll>div{height:1px;pointer-events:none;}',
'.table-top-scroll[hidden]{display:none!important;}',
'@media(max-width:700px){.container{padding:.8rem .45rem!important;}.table-wrap th,.table-wrap td{padding:.55rem;}#filterModal .modal{width:99vw!important;max-width:99vw!important;}}'
].join('\n');
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
const seen=new Set();
function sync(wrap){
  if(!wrap.isConnected){seen.delete(wrap);return;}
  let top=wrap.previousElementSibling;
  if(!top||!top.classList.contains('table-top-scroll')){
    top=document.createElement('div');top.className='table-top-scroll';
    top.setAttribute('aria-label','Vízszintes görgetés / Horizontal scroll');
    const spacer=document.createElement('div');top.appendChild(spacer);
    wrap.parentNode.insertBefore(top,wrap);
    let lock=false;
    top.addEventListener('scroll',()=>{if(!lock){lock=true;wrap.scrollLeft=top.scrollLeft;lock=false;}},{passive:true});
    wrap.addEventListener('scroll',()=>{if(!lock){lock=true;top.scrollLeft=wrap.scrollLeft;lock=false;}},{passive:true});
  }
  const table=wrap.querySelector('table');
  if(!table)return;
  const width=Math.max(table.scrollWidth,wrap.scrollWidth);
  top.firstElementChild.style.width=width+'px';
  top.hidden=width<=wrap.clientWidth+2;
  top.scrollLeft=wrap.scrollLeft;
  seen.add(wrap);
}
function refresh(){
  document.querySelectorAll('.table-wrap').forEach(sync);
  for(const w of seen){if(w.isConnected)sync(w);else seen.delete(w);}
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('resize',schedule,{passive:true});
schedule();
})();