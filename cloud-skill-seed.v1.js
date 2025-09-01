/*! cloud-skill-seed.v1.js
   Helper: quickly assign skills per user (edit as needed), then save().
*/
(async function(){
  const S = window.state || (window.state={});
  S.users = S.users || {};
  // EDIT HERE to match who does what:
  if (S.users['u-OWNER']) S.users['u-OWNER'].skills = ['script','edit','website'];
  if (S.users['u-RYAN'])  S.users['u-RYAN'].skills  = ['film','photo','ops'];
  if (typeof window.save === 'function') await window.save();
  if (typeof window.render === 'function') window.render();
  console.log('[skills.seed] applied');
})();