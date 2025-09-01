/*! cloud-shape-guard.v1.js
   Ensures window.state always has { users:{}, clients:{}, tasks:[] } before any render.
   Prevents "Cannot convert undefined or null to object" in render paths.
*/
(function(){
  function ensure(){
    const s = (window.state = window.state || {});
    if (!s.users || typeof s.users !== 'object') s.users = {};
    if (!s.clients || typeof s.clients !== 'object') s.clients = {};
    if (!Array.isArray(s.tasks)) s.tasks = [];
  }
  // Ensure immediately
  try { ensure(); } catch(_){}

  // Patch render to re-ensure before each call
  const orig = window.render;
  if (typeof orig === 'function' && !orig.__shapeGuarded){
    window.render = function(){
      try { ensure(); } catch(_){}
      return orig.apply(this, arguments);
    };
    window.render.__shapeGuarded = true;
  }
})();