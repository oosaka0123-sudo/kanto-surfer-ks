'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=process.argv[2];assert(root,'Usage: node tests/sns_links_smoke.cjs SITE_DIR');
const ids=['kugenuma','yuigahama','oarai-onuki','kashima-hirai','katakai','ichinomiya','taito','onjuku','kamogawa-maruki'];
const pages=['index.html',...ids.map(x=>'spots/'+x+'/index.html'),'about/index.html','contact/index.html','privacy/index.html'];
const socials=[
 ['https://www.instagram.com/kanto_surfer_ks/','関東サーファーKS Instagram'],
 ['https://www.facebook.com/profile.php?id=61595144364123','関東サーファーKS Facebook']
];
for(const file of pages){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const header=html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
 const footer=html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1];
 assert(header&&footer,file+': missing header/footer');
 for(const [section,selector] of [[header,'sns-buttons'],[footer,'footer-sns']]){
  assert.equal(section.split('class="'+selector+'"').length-1,1,file+': '+selector+' count');
  for(const [href,label] of socials){
   assert(section.includes('href="'+href+'"'),file+': missing '+href);
   assert(section.includes('aria-label="'+label+'"'),file+': missing accessible label '+label);
  }
  assert.equal((section.match(/<svg viewBox="0 0 24 24"/g)||[]).length,2,file+': SVG icons');
 }
 assert(footer.includes('footer-spot-grid'),file+': existing 9-spot footer missing');
 const spotSegment=(footer.split('class="footer-spot-grid"')[1]||'').split('</div>')[0];
 assert.equal((spotSegment.match(/<a /g)||[]).length,9,file+': 9 spot links missing');
 assert(!html.includes('facebook.com/kansaisurfer/')&&!html.includes('instagram.com/kansaisurfer.ks'),file+': wrong Kansai SNS links');
}
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
assert(css.includes('.sns-buttons')&&css.includes('.footer-sns')&&css.includes('@media(max-width:390px)'),'SNS responsive layout missing');
console.log('PASS: all 13 Kanto pages have two accessible SNS icons in Kansai-equivalent header/footer slots; 9 footer spot links preserved');
