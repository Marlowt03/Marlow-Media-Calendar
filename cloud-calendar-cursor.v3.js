/*! cloud-calendar-cursor.v3.js
   Sticky month for all re-renders:
   - Captures currently visible month after each render.
   - Re-applies the saved month 3 times (0/120/240ms) to win against subsequent renders.
   - Works without modifying index.html internals.
*/
(function(){
  const KEY = 'ui.calendar.cursor3'; // stores ISO first-of-month
  const LOG = (...a)=>{ try{ console.log('[cursor.v3]', ...a);}catch(_){}};

  function isoMonthStart(d){
    const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0);
    return x.toISOString().slice(0,10);
  }
  function monthIndex(d){ const x=new Date(d); return x.getFullYear()*12 + x.getMonth(); }

  function readVisibleMonth(){
    const title = document.getElementById('calTitle') || Array.from(document.querySelectorAll('.cal-header .title'))[0];
    if (!title) return null;
    const t = (title.textContent||'').trim();
    const m = t.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
    if (!m) return null;
    const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mm = MONTHS.indexOf(m[1].toLowerCase());
    if (mm<0) return null;
    return isoMonthStart(new Date(Number(m[2]), mm, 1));
  }
  function saveCursorFromDOM(){
    const vis = readVisibleMonth();
    if (vis){ try{ sessionStorage.setItem(KEY, vis); }catch(_){ } }
  }
  function loadCursor(){ try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; } }

  function clickNav(toFuture){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    const prev = all.find(el => (el.textContent||'').trim()==='‹' || /prev|previous/i.test(el.getAttribute('aria-label')||''));
    const next = all.find(el => (el.textContent||'').trim()==='›' || /next/i.test(el.getAttribute('aria-label')||''));
    const btn = toFuture ? next : prev;
    try{ btn && btn.click(); }catch(_){}
  }

  function setVisibleMonth(targetISO){
    const visISO = readVisibleMonth();
    if (!targetISO || !visISO) return;
    const diff = monthIndex(targetISO) - monthIndex(visISO);
    if (diff === 0) return;
    const toFuture = diff > 0;
    const steps = Math.abs(diff);
    for (let i=0;i<steps;i++) setTimeout(()=>clickNav(toFuture), i*28);
  }

  function afterRenderAdjust(){
    // 1) Save what user is currently seeing (if any)
    saveCursorFromDOM();
    // 2) Re-apply saved month a few times to beat subsequent renders
    const target = loadCursor();
    [0,120,240].forEach(ms => setTimeout(()=> setVisibleMonth(target), ms));
  }

  // Patch render()
  const orig = window.render;
  if (!orig || orig.__cursorPatchedV3) return;
  window.render = function(){
    const r = orig.apply(this, arguments);
    try{ afterRenderAdjust(); }catch(_){}
    return r;
  };
  window.render.__cursorPatchedV3 = true;

  // Initial run
  setTimeout(afterRenderAdjust, 200);
})();