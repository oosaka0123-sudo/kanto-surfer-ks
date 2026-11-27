'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=process.argv[2];
assert(root,'Usage: node tests/thank_you_smoke.cjs SITE_DIR');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('contact/thanks/index.html');
const contact=read('contact/index.html');
const sitemap=read('sitemap.xml');
const script=fs.readFileSync(path.resolve(__dirname,'../prototype/spot-forecast/thanks-helper.js'),'utf8');
const sending=fs.readFileSync(path.resolve(__dirname,'../prototype/spot-forecast/contact-helper.js'),'utf8');

assert(html.includes('お問い合わせありがとうございました。'),'Correct Japanese thank-you title');
assert(html.includes('id="ks-thankyou-confirmed" hidden'),'Only server-confirmed submissions may show success');
assert(html.includes('id="ks-thankyou-unverified" hidden'),'Direct visitors have a neutral state');
assert(html.includes('id="ks-thanks-script"'),'One-time confirmation guard is loaded');
assert(html.includes('name="robots" content="noindex,follow"'),'No indexing of transaction confirmation');
assert(html.includes('rel="canonical" href="https://kanto.rss7.net/contact/thanks/"'),'Correct canonical URL');
assert(!sitemap.includes('/contact/thanks/'),'Thank-you pages must not be indexed via sitemap');
assert(html.includes('href="../../styles.css?v='),'Nested stylesheet resolves to site root');
assert(html.includes('src="../../app.js?v='),'Nested app script resolves to site root');
assert(html.includes('class="brand" href="../../"'),'Brand points to home, not form');
for(const section of ['about','contact','privacy']){
 assert(html.includes('href="../../'+section+'/"'),'Footer navigation broken: '+section);
}
assert(html.includes('href="/"')&&html.includes('href="/contact/"'),'Return to home and form');
assert(html.includes('class="footer-spot-grid"'),'Nine spots stay in footer');
assert(html.includes('https://www.instagram.com/kanto_surfer_ks/'),'Instagram preserved');
assert(html.includes('https://www.facebook.com/profile.php?id=61595144364123'),'Facebook preserved');
assert((html.match(/href="\.\.\/\.\.\/spots\//g)||[]).length===9,'Exactly nine spot links expected');
assert(contact.includes('action="send.php"'),'Real POST form maintained');
assert(sending.includes("if(!response.ok||!data.success)throw"),'Only successful POST responses may redirect');
assert(sending.includes("window.location.assign(new URL('thanks/',window.location.href).href)"),'Redirect only on success');
assert(sending.includes("sessionStorage.setItem('ks-kanto-contact-accepted-at'"),'Confirmation marker not issued');
assert(!html.includes('name="captcha"'),'No unnecessary form on acknowledgement');

function run(marker,now=1764248000000,storageBlocked=false){
 const confirmed={hidden:true};
 const unverified={hidden:true};
 const db=new Map();
 if(marker!==null)db.set('ks-kanto-contact-accepted-at',String(marker));
 const storage={
   getItem:key=>{if(storageBlocked)throw Error('storage unavailable');return db.get(key)??null;},
   removeItem:key=>{if(storageBlocked)throw Error('storage unavailable');db.delete(key);}
 };
 const sandbox={
   document:{getElementById:id=>id==='ks-thankyou-confirmed'?confirmed:id==='ks-thankyou-unverified'?unverified:null},
   sessionStorage:storage,
   Date:{now:()=>now},
   Number,
   isFinite
 };
 vm.runInNewContext(script,sandbox);
 return {confirmed:!confirmed.hidden,unverified:!unverified.hidden,remaining:db.has('ks-kanto-contact-accepted-at')};
}
const now=1764248000000;
assert.deepEqual(run(null,now),{confirmed:false,unverified:true,remaining:false},'Direct link is not a verified submission');
assert.deepEqual(run(now-1000,now),{confirmed:true,unverified:false,remaining:false},'Recent POST receipt confirms and is consumed');
assert.deepEqual(run(now-30*60*1000,now),{confirmed:false,unverified:true,remaining:false},'Stale receipt cannot fake success');
assert.deepEqual(run(now+1000,now),{confirmed:false,unverified:true,remaining:false},'Future receipt cannot fake success');
assert.deepEqual(run(now-1000,now,true),{confirmed:false,unverified:true,remaining:true},'Storage unavailable: show neutral state');
console.log('PASS: standalone noindex acknowledgement, all correct nested links, 9 footer spots, success-only one-time redirect marker');
