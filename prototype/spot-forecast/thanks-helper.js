/* One-time, short-lived client navigation marker only; never stores message or identity. */
(()=>{
  'use strict';
  const verified=document.getElementById('ks-thankyou-confirmed');
  const unverified=document.getElementById('ks-thankyou-unverified');
  if(!verified||!unverified)return;
  let accepted=false;
  try{
    const raw=sessionStorage.getItem('ks-kanto-contact-accepted-at');
    sessionStorage.removeItem('ks-kanto-contact-accepted-at');
    const ts=raw?Number(raw):NaN;
    const age=Date.now()-ts;
    accepted=Number.isFinite(ts)&&age>=0&&age<10*60*1000;
  }catch{/* Storage can be disabled; avoid reporting success without proof. */}
  verified.hidden=!accepted;
  unverified.hidden=accepted;
})();
