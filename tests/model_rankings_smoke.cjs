'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..'),config=path.join(base,'config/representative-spots.json');
const spots=JSON.parse(fs.readFileSync(config,'utf8')).spots;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ks-model-v3-')),site=path.join(tmp,'site');
const pages=[{id:'ranking',path:'index.html'},...spots.map(s=>({id:s.id,path:'spots/'+s.slug+'/index.html'}))];
const original='<html><main><section class="forecast-section" data-forecast><h2>Wave</h2></section></main></html>';
const today='2026-11-27',tomorrow='2026-11-28',gen='2026-11-27T07:20:00+09:00';
for(const p of pages){const f=path.join(site,p.path);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,original);}
for(const [i,s] of spots.entries()){
 const hourly=[];
 for(const [di,date] of [today,tomorrow].entries()){
  hourly.push({time:date+'T09:00:00+09:00',model_wave_height_m:+(0.48+i*.08+di*.1).toFixed(2),period_s:6+(i%4),wind_speed_ms:2+i*.2,wind_direction_label:['北','北西','西','西南西','東'][i%5]});
 }
 const data={spot:{id:s.id},generated_at:gen,hourly,tide:{days:[{date:today,hourly_cm:Array.from({length:24},(_,h)=>100+h*2)},{date:tomorrow,hourly_cm:Array.from({length:24},(_,h)=>90+h*3)}]}};
 fs.mkdirSync(path.join(site,'data'),{recursive:true});
 fs.writeFileSync(path.join(site,'data',s.id+'.json'),JSON.stringify(data));
}
function render(expectSuccess=true){
 const p=spawnSync(process.execPath,[path.join(base,'scripts/render_model_rankings.cjs'),'--root',site,'--config',config,'--now','2026-11-27T09:20:00+09:00'],{encoding:'utf8'});
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
   assert.ok(e.home.includes('モデル')&&e.detail.includes('モデル'));
  }
 }
 const before=snap();
 for(const [i,p] of pages.entries()){
  const html=before[i];
  assert.equal((html.match(/<!-- KS-MODEL:/g)||[]).length,1);
  assert.equal(strip(html,p.id),original);
  assert.ok(html.includes('ks-model'));
  if(i===0){assert.equal((html.match(/<li class="ks-model-item">/g)||[]).length,18);}
  else{assert.ok(html.includes('今日の波の狙い方'));assert.ok(html.includes('明日の波の狙い方'));}
 }
 render();assert.deepEqual(snap(),before,'Idempotent rendering');
 fs.rmSync(path.join(site,'data',spots[0].id+'.json'));
 render();
 const held=JSON.parse(fs.readFileSync(path.join(site,'data/model-ranking.json'),'utf8'));
 assert.equal(held.today.status,'held');assert.equal(held.tomorrow.status,'held');
 assert.ok(snap()[0].includes('ランキングは保留'));
 assert.ok(!snap()[0].includes('KSモデル参考ランキング BEST9'));
 console.log('PASS model: same-hour comparison, 18x2 ~100-char articles, 9 rankings, escaping, idempotence, held fallback');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
