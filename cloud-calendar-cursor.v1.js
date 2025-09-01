/*! cloud-calendar-cursor.v1.js
   Keeps the calendar on the month you're viewing (no jump back to Today after edits).
   - Tracks the visible month/year when you click ‹ or ›
   - Restores that month after any re-render (e.g., after save/adopt)
   - Persists the cursor per-tab via sessionStorage
*/
(function(){
  const KEY = 'ui.calendar.cursor'; // e.g., '2025-09-01'
  const LOG = (...a)=>{ try{ console.log('[cursor]', ...a);}catch(_){}};

  function ym(date){ const d=new Date(date); return [d.getFullYear(), d.getMonth()]; }
  function isoMonthStart(date){
    const d=new Date(date); d.setDate(1); d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  }
  function monthDiff(a,b){ const [ay,am]=ym(a), [by,bm]=ym(b); return (ay-by)*12 + (am-bm); }

  function saveCursor(dt){
    try{ sessionStorage.setItem(KEY, isoMonthStart(dt)); }catch(_){}
  }
  function loadCursor(){
    try{ return sessionStorage.getItem(KEY)||''; }catch(_){ return ''; }
  }

  // Try to read the month title element text (e.g., "September 2025")
  function readVisibleMonth(){
    const header = Array.from(document.querySelectorAll('*')).find(el => {
      const t = (el.textContent||'').trim();
      // Matches "September 2025", "Aug 2025", etc.
      return /^[A-Za-z]{3,9}\s+\d{4}$/.test(t) && el.closest && el.closest('.calendar, [data-cal], [role="grid"]');
    });
    if (!header) return null;
    const t = header.textContent.trim();
    const [name, year] = t.split(/\s+/);
    const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const m = MONTHS.indexOf(name.toLowerCase());
    if (m<0) return null;
    return isoMonthStart(new Date(Number(year), m, 1));
  }

  // Find the prev/next month buttons by their glyphs
  function navButtons(){
    const all = Array.from(document.querySelectorAll('button, [role="button"]'));
    let prev = all.find(el => (el.textContent||'').trim()==='‹');
    let next = all.find(el => (el.textContent||'').trim()==='›');
    // Fallback: data-attrs
    if (!prev) prev = all.find(el => /prev|previous/i.test(el.getAttribute('aria-label')||''));
    if (!next) next = all.find(el => /next/i.test(el.getAttribute('aria-label')||''));
    return {prev, next};
  }

  // Programmatically navigate to target month by clicking prev/next a few times
  function setVisibleMonth(targetISO){
    const vis = readVisibleMonth();
    if (!targetISO || !vis) return;
    const diff = monthDiff(targetISO, vis); // positive => target after vis -> click next
    if (diff === 0) return;
    const {prev, next} = navButtons();
    if (!prev && !next) return;

    const clickMany = (el, n, step) => new Promise(resolve => {
      let i=0;
      const timer = setInterval(() => {
        if (i>=n){ clearInterval(timer); resolve(); return; }
        try{ el.click(); }catch(_){}
        i+=1;
      }, 30);
    });

    if (diff > 0 && next){ return clickMany(next, diff, +1); }
    if (diff < 0 && prev){ return clickMany(prev, -diff, -1); }
  }

  // Remember cursor when user navigates
  function wireNavTracking(){
    const {prev, next} = navButtons();
    if (prev && !prev.__cursor_wired){
      prev.addEventListener('click', () => {
        const vis = readVisibleMonth();
        if (vis) saveCursor(new Date(vis));
      });
      prev.__cursor_wired = true;
    }
    if (next && !next.__cursor_wired){
      next.addEventListener('click', () => {
        const vis = readVisibleMonth();
        if (vis) saveCursor(new Date(vis));
      });
      next.__cursor_wired = true;
    }
  }

  // Restore after each render
  (function patchRender(){
    const orig = window.render;
    if (!orig || orig.__cursorPatched) return;
    window.render = async function(){
      const target = loadCursor();     // what month we want
      const r = orig.apply(this, arguments);  // run original render
      try{
        // After render, re-wire listeners and jump back if needed
        wireNavTracking();
        if (target) await setVisibleMonth(target);
      }catch(_){}
      return r;
    };
    window.render.__cursorPatched = true;
    LOG('installed');
  })();

  // On boot, default cursor to current visible month (or this month)
  setTimeout(() => {
    const vis = readVisibleMonth();
    saveCursor(vis || new Date());
    wireNavTracking();
  }, 200);
})();