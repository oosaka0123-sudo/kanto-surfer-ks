'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..'),config=path.join(base,'config/representative-spots.json');
const spots=JSON.parse(fs.readFileSync(config,'utf8')).spots;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ks-model-v3-')),site=path.join(tmp,'site');
const pages=[{id:'ranking',path:'index.html'},...spots.map(s=>({id:s.id,path:'spots/'+s.slug+'/index.html'}))];
const editorialDir=path.join(tmp,'editorial');
const original='<html><main><section class="forecast-section" data-forecast><h2>Wave</h2></section></main></html>';
const homeOriginal='<html><main><p>Ranking only; no default spot chart.</p></main></html>';
const today='2026-11-27',tomorrow='2026-11-28',gen='2026-11-27T07:20:00+09:00';
for(const p of pages){const f=path.join(site,p.path);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,p.id==='ranking'?homeOriginal:original);}
for(const [i,s] of spots.entries()){
 const hourly=[];
 for(const [di,date] of [today,tomorrow].entries()){
  hourly.push({time:date+'T09:00:00+09:00',model_wave_height_m:+(0.48+i*.08+di*.1).toFixed(2),period_s:6+(i%4),model_wave_direction_deg:[190,165,135,45,135,90,70,135,135][i],wind_speed_ms:2+i*.2,wind_direction_label:['北','北西','西','西南西','東'][i%5]});
 }
 const data={spot:{id:s.id},generated_at:gen,hourly,tide:{days:[{date:today,hourly_cm:Array.from({length:24},(_,h)=>100+h*2)},{date:tomorrow,hourly_cm:Array.from({length:24},(_,h)=>90+h*3)}]}};
 fs.mkdirSync(path.join(site,'data'),{recursive:true});
 fs.writeFileSync(path.join(site,'data',s.id+'.json'),JSON.stringify(data));
}
function render(expectSuccess=true){
 const p=spawnSync(process.execPath,[path.join(base,'scripts/render_model_rankings.cjs'),'--root',site,'--config',config,'--editorial-dir',editorialDir,'--now','2026-11-27T09:20:00+09:00'],{encoding:'utf8'});
 assert.equal(p.status===0,expectSuccess,p.stderr||p.stdout);
}
function snap(){return pages.map(p=>fs.readFileSync(path.join(site,p.path),'utf8'));}
function strip(s,id){return s.replace(new RegExp('<!-- KS-MODEL:'+id+':START -->[\\s\\S]*?<!-- KS-MODEL:'+id+':END -->'),'');}
try{
 render();
 const ranking=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 for(const day of [ranking.today,ranking.tomorrow]){
  assert.equal(day.status,'model_reference');assert.equal(day.entries.length,9);
  assert.deepEqual(day.entries.map(e=>e.rank),[1,2,3,4,5,6,7,8,9]);
  assert.equal(new Set(day.entries.map(e=>e.id)).size,9);
  for(const e of day.entries){
   assert.ok(Array.from(e.home).length>=90&&Array.from(e.home).length<=120,e.id+' home');
   assert.ok(Array.from(e.detail).length>=90&&Array.from(e.detail).length<=120,e.id+' detail');
   assert.notEqual(e.home,e.detail);
   assert.equal(e.surf_size.status,'experimental');
   assert.match(e.surf_size.label,/^(フラット|スネ|ヒザ|モモ|コシ|ハラ|ムネ|カタ|アタマ)(〜.+)?$/);
   assert.ok(e.home.includes('モデル')&&e.detail.includes('モデル'));
  }
 }
 const before=snap();
 for(const [i,p] of pages.entries()){
  const html=before[i];
  assert.equal((html.match(/<!-- KS-MODEL:[a-z0-9_]+:START -->/g)||[]).length,1);
  assert.equal(strip(html,p.id),p.id==='ranking'?homeOriginal:original);
  if(p.id==='ranking')assert.ok(!html.includes('data-forecast')&&!html.includes('daily-forecast'));
  assert.ok(html.includes('ks-model'));
  assert.ok(html.includes('<div class="ks-model-day" data-day="today"><h2>今日') && html.includes('<div class="ks-model-day" data-day="tomorrow"><h2>明日'),'day colors on '+p.id);
  assert.ok(html.includes('--day-head:#075985')&&html.includes('--day-head:#9a3412'),'distinct palette on '+p.id);

  assert.ok(html.includes('（'+today+'）')&&html.includes('（'+tomorrow+'）'),'absolute dates on '+p.id);
  assert.ok(html.includes('<time datetime="'+gen+'">2026-11-27 07:20 JST</time>'),'JST generation time on '+p.id);
  if(i===0){assert.equal((html.match(/<li class="ks-model-item">/g)||[]).length,18);}
  else{assert.ok(html.includes('今日の波の狙い方'));assert.ok(html.includes('明日の波の狙い方'));}
 }
 render();assert.deepEqual(snap(),before,'Idempotent rendering');
 // Verified editorial should replace only the articles, never ranks or forecast metadata.
 const edited={schema_version:1,status:'ready',slot:'morning',date:today,generated_at:'2026-11-27T08:00:00+09:00',model_generated_at:gen,articles:{}};
 for(const e of ranking.today.entries){
   edited.articles[e.id]={
     home:e.home.replace('朝9時','朝の9時'),detail:e.detail.replace('朝9時','朝の9時'),
     wave_9_m:e.model_wave_min_m,period_9_s:e.model_period_s,wind_label:e.wind.label
   };
 }
 fs.mkdirSync(path.join(editorialDir,'morning'),{recursive:true});
 const editorialFile=path.join(editorialDir,'morning',today+'.json');
 fs.writeFileSync(editorialFile,JSON.stringify(edited));
 render();
 let updated=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.ok(updated.today.entries.every(e=>e.editorial==='reviewed'));
 assert.deepEqual(updated.today.entries.map(e=>e.rank),ranking.today.entries.map(e=>e.rank));
 // Drift in a single spot rejects all editorial entries and keeps verified fallback.
 edited.articles[spots[0].id].wave_9_m+=1;
 fs.writeFileSync(editorialFile,JSON.stringify(edited));render();
 updated=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.ok(updated.today.entries.every(e=>!e.editorial));
 // Human copy with numeric placeholders can survive small model revisions, with the
 // fresh model values interpolated before the 90-120 character quality gate.
 for(const e of ranking.today.entries){
   const a=edited.articles[e.id];
   a.home=e.home.replace(e.model_wave_min_m.toFixed(2),'{{wave_9_m}}').replace(e.model_period_s.toFixed(1),'{{period_9_s}}');
   a.detail=e.detail.replace(e.model_wave_min_m.toFixed(2),'{{wave_9_m}}').replace(e.model_period_s.toFixed(1),'{{period_9_s}}');
   assert.ok(a.home.includes('{{wave_9_m}}')&&a.home.includes('{{period_9_s}}'));
   a.wave_9_m=e.model_wave_min_m+0.1;a.period_9_s=e.model_period_s+0.5;
 }
 fs.writeFileSync(editorialFile,JSON.stringify(edited));render();
 updated=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.ok(updated.today.entries.every(e=>e.editorial==='reviewed'));
 assert.ok(updated.today.entries.every(e=>!e.home.includes('{{')));
 // Missing 09h wave direction must never produce a made-up surf-size estimate.
 const missingDirection=path.join(site,'data',spots[1].id+'.json');
 const existing=JSON.parse(fs.readFileSync(missingDirection,'utf8'));
 existing.hourly[0].model_wave_direction_deg=null;
 fs.writeFileSync(missingDirection,JSON.stringify(existing));
 render();
 const heldDirection=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.equal(heldDirection.today.status,'held');
 assert.equal(heldDirection.tomorrow.status,'model_reference');
 existing.hourly[0].model_wave_direction_deg=165;
 fs.writeFileSync(missingDirection,JSON.stringify(existing));
 fs.rmSync(path.join(site,'data',spots[0].id+'.json'));
 render();
 const held=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.equal(held.today.status,'held');assert.equal(held.tomorrow.status,'held');
 assert.ok(snap()[0].includes('ランキングは保留'));
 assert.ok(snap().every(html=>html.includes('（'+today+'）')&&html.includes('（'+tomorrow+'）')),'held dates remain visible');
 assert.ok(!snap()[0].includes('KSモデル参考ランキング BEST9'));
 console.log('PASS model: same-hour comparison, 18x2 ~100-char articles, 9 rankings, escaping, idempotence, held fallback');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
