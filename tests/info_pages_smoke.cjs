'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=process.argv[2];
assert(root,'Usage: node tests/info_pages_smoke.cjs SITE_DIR');
const pages=['about','contact','privacy'];
const data={};
for(const slug of pages){
  const html=fs.readFileSync(path.join(root,slug,'index.html'),'utf8');
  data[slug]=html;
  assert.match(html,/<html lang="ja">/,'language '+slug);
  assert.match(html,/<meta name="robots" content="index,follow">/,'robots '+slug);
  assert(html.includes('rel="canonical" href="https://kanto.rss7.net/'+slug+'/"'),'canonical '+slug);
  assert(html.includes('id="ks-info-styles"'),'scoped inline CSS '+slug);
  assert(html.includes('class="info-page ks-info-page"'),'page layout '+slug);
  assert(html.includes('footer-spot-grid'),'preserved nine spot links '+slug);
  assert(html.includes('https://www.instagram.com/kanto_surfer_ks/'),'Kanto Instagram '+slug);
  assert(html.includes('https://www.facebook.com/profile.php?id=61595144364123'),'Kanto Facebook '+slug);
  assert(html.includes('../privacy/')&&html.includes('../contact/')&&html.includes('../about/'),'navigation '+slug);
  assert(!html.includes('kansaisurfer/'),'wrong Facebook '+slug);
  assert(!html.includes('href="#"'),'placeholder link '+slug);
}
for(const value of ['波の恵みを','大切にする5つのこと','予報のしくみと限界','湘南','茨城','千葉','鵠沼','鹿嶋・平井','鴨川・マルキ']){
  assert(data.about.includes(value),'Missing about '+value);
}
for(const value of ['個人情報の取得と利用','アクセス記録とCookie','外部サービス','AIによる記事と波予報','著作権','2026年11月27日']){
  assert(data.privacy.includes(value),'Missing privacy '+value);
}
const contact=data.contact;
for(const value of ['id="ks-inquiry-form"','id="ks-inquiry-kind"','id="ks-inquiry-name"','id="ks-inquiry-reply"','id="ks-inquiry-message"','id="ks-inquiry-copy"','id="ks-inquiry-status"','id="ks-inquiry-output"','id="ks-contact-script"','送信機能はありません','当サイトのサーバーへ送信されません']){
  assert(contact.includes(value),'Missing contact form '+value);
}
assert(!/<form[^>]+action=/.test(contact),'Contact must never fake a backend');
assert(!data.about.includes('id="ks-contact-script"')&&!data.privacy.includes('id="ks-contact-script"'),'Contact helper should load on contact only');
assert((data.about.match(/class="ks-value-grid"/g)||[]).length===1);
assert((data.contact.match(/<option value=/g)||[]).length>=5);
console.log('PASS Kanto trust pages: 3 generated routes, Kansai-inspired sections, 9 spots, canonical/SEO, SNS and honest local-only contact');
