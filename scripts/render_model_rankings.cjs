'use strict';
// Deterministic model-only ranking. Does not claim observed surf size or a calibrated surf score.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const arg={};for(let i=2;i<process.argv.length;i+=2){assert(process.argv[i]?.startsWith('--')&&process.argv[i+1]);arg[process.argv[i].slice(2)]=process.argv[i+1];}
assert(arg.root&&arg.config,'Required --root and --config');
const now=arg.now?new Date(arg.now):new Date();
assert(Number.isFinite(+now),'Invalid now');
const jstDate=d=>new Date(+d+9*3600000).toISOString().slice(0,10);
const nextDate=d=>new Date(Date.parse(d+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const today=jstDate(now),tomorrow=nextDate(today);
const spots=JSON.parse(fs.readFileSync(arg.config,'utf8')).spots;
assert(spots.length===9&&new Set(spots.map(s=>s.id)).size===9,'Expected nine unique spots');
const dataDir=arg['data-dir']||path.join(arg.root,'data');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const len=s=>Array.from(s).length;
const directions=['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];
const idealWind={kugenuma:0,yuigahama:0,oarai_onuki:315,kashima_hirai:225,katakai:315,ichinomiya:270,taito:255,onjuku:315,kamogawa_maruki:335};
const tip={
 kugenuma:['小波でも割れやすいピークを探す判断が必要','潮の変化で割れやすい場所が変わるかを見たい'],
 yuigahama:['湾内の弱い波が届くか慎重に見極めたい','湾内で波が割れる場所を確かめてから判断したい'],
 oarai_onuki:['南東向きの浜でうねりの入り方を確認したい','潮の変化とセットの入り方を見て場所を選びたい'],
 kashima_hirai:['北東向きの浜と風の相性が判断材料','北東向きの浜で流れとセットの間隔に注意したい'],
 katakai:['新堤周辺の流れや波の割れ方に注意したい','新堤の近くは流れと混雑を確かめて判断したい'],
 ichinomiya:['東向きの浜で西寄りの風を生かせるかが鍵','東向きの地形と朝の風の相性を確認したい'],
 taito:['堤防周辺の流れと波の割れ方に注意したい','堤防寄りの流れと波の入り方を確認して選びたい'],
 onjuku:['湾内でセットが入りやすい場所を探したい','湾内の場所による波の違いを確認して判断したい'],
 kamogawa_maruki:['南東向きの浜でセットの入り方を確認したい','南東向きの海岸で風と波の変化を見極めたい']
};
// Uncalibrated surf-face proxy. Never describe this as a measured wave size.
const coastBearing={kugenuma:190,yuigahama:165,oarai_onuki:135,kashima_hirai:45,
  katakai:135,ichinomiya:90,taito:70,onjuku:135,kamogawa_maruki:135};
const sizeNames=['フラット','スネ','ヒザ','モモ','コシ','ハラ','ムネ','カタ','アタマ','アタマオーバー'];
const sizeEdges=[0.12,0.26,0.43,0.60,0.78,0.98,1.20,1.48,1.87];
function surfSizeReference(row,spot,waveHeight,period){
 const bearing=row.model_wave_direction_deg;
 if(typeof bearing!=='number'||!Number.isFinite(bearing)||bearing<0||bearing>360)
   return {status:'pending',label:'判定保留',reason:'波向きのモデル値なし'};
 const coast=coastBearing[spot.id];
 if(!Number.isFinite(coast))throw Error('Unknown coast orientation '+spot.id);
 const diff=Math.abs((((bearing%360)-coast+540)%360)-180);
 // Simplified exposure factor; local bathymetry, shelter and refraction are unmodelled.
 const exposure=diff<=40?1:diff<=70?0.8:diff<=100?0.55:0.22;
 const periodFactor=Math.min(1.12,Math.max(0.72,0.78+Math.max(0,period-4)*0.052));
 const proxy=waveHeight*0.9*exposure*periodFactor;
 const bucket=v=>{const i=sizeEdges.findIndex(n=>v<n);return sizeNames[i<0?9:i]};
 const low=bucket(proxy*0.76),high=bucket(proxy*1.24);
 return {status:'experimental',label:low===high?low:low+'〜'+high,
   model_wave_direction_deg:bearing,exposure,method:'wave-height-period-direction-coast-v1',
   confidence:'low'};
}
const round=(v,n=1)=>(Math.round(v*10**n)/10**n).toFixed(n);
const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
function windInfo(samples,id){
 const rows=samples.filter(x=>directions.includes(x.wind_direction_label)&&Number.isFinite(Number(x.wind_speed_ms)));
 if(!rows.length)return null;
 const count=new Map();for(const r of rows)count.set(r.wind_direction_label,(count.get(r.wind_direction_label)||0)+1);
 const label=[...count].sort((a,b)=>b[1]-a[1]||directions.indexOf(a[0])-directions.indexOf(b[0]))[0][0];
 const speed=mean(rows.map(r=>Number(r.wind_speed_ms)));
 const dir=directions.indexOf(label)*22.5;
 const dist=Math.abs(((dir-idealWind[id]+540)%360)-180);
 let category=dist<=55?'off':dist<=115?'side':'on';
 let effect=speed>=8?'風が強く面の乱れに注意':category==='off'?'オフ寄りで面が整いやすい予想':category==='side'?'横風の影響を確認したい':'オン寄りで面が乱れる可能性';
 return {label,speed,category,effect,dist};
}
function findTide(data,date){
 const row=data.tide?.days?.find(d=>d.date===date);
 const values=row?.hourly_cm;
 if(!Array.isArray(values)||!Number.isFinite(values[7])||!Number.isFinite(values[10]))return null;
 const delta=values[10]-values[7];
 return delta>9?'近隣観測点の潮位予測は上げ方向':delta < -9?'近隣観測点の潮位予測は下げ方向':'近隣観測点の潮位予測は変化が小さめ';
}
function pickArticle(required,options){
 const suffix=['海上モデル値は実際のブレイクサイズと異なる。','現地の波と流れを見て入水を判断したい。','現地の状況も確認したい。'];
 const n=options.length;
 let candidates=[];
 for(let mask=0;mask<(1<<n);mask++){
  let s=required+options.filter((_,i)=>Boolean(mask&(1<<i))).join('');
  for(let extra=0;extra<(1<<suffix.length);extra++){
   let v=s+suffix.filter((_,i)=>Boolean(extra&(1<<i))).join('');
   if(len(v)>=90&&len(v)<=120)candidates.push({text:v,mask,extra});
  }
 }
 if(!candidates.length)throw Error('Cannot create 90–120-character grounded article: '+required);
 return candidates.sort((a,b)=>Number(Boolean(b.mask&1))-Number(Boolean(a.mask&1))||
   Number(Boolean(b.mask&2))-Number(Boolean(a.mask&2))||
   Math.abs(len(a.text)-105)-Math.abs(len(b.text)-105)||
   Number(Boolean(a.extra))-Number(Boolean(b.extra)))[0].text;
}
function compute(data,spot,date){
 if(data.spot?.id!==spot.id||!Array.isArray(data.hourly))return null;
 const dateRows=data.hourly.filter(r=>typeof r.time==='string'&&r.time.slice(0,10)===date&&Number(r.time.slice(11,13))>=7&&Number(r.time.slice(11,13))<=10);
 // Some spots publish two-hourly data (09:00, 11:00), while others use hourly data.
 // Compare the same 09:00 JST model timestamp for all nine spots; never blend incomparable windows.
 const rows=dateRows.filter(r=>r.time.slice(11,13)==='09'&&Number.isFinite(Number(r.model_wave_height_m))&&Number(r.model_wave_height_m)>=0&&Number.isFinite(Number(r.period_s))&&Number(r.period_s)>0);
 if(rows.length!==1)return null;
 const wave=rows.map(r=>Number(r.model_wave_height_m)),period=mean(rows.map(r=>Number(r.period_s)));
 const wind=windInfo(rows,spot.id);if(!wind)return null;
 const min=Math.min(...wave),max=Math.max(...wave),avg=mean(wave);
 const range=Math.abs(max-min)<0.005?round(mean(wave),2):round(min,2)+'〜'+round(max,2);
 const tide=findTide(data,date);
 const surfSize=surfSizeReference(rows[0],spot,avg,period);
 if(surfSize.status!=='experimental')return null;
 // Heuristic comparisons only; no observed break size, empirical surf-point grading, or numeric score displayed.
 const windPart=wind.category==='off'?7:wind.category==='side'?1:-8;
 const dangerPenalty=avg>2.3?24+(avg-2.3)*16:avg>1.8?(avg-1.8)*9:0;
 const value=20*Math.min(avg,2.5)+2.1*Math.min(period,13)+windPart-Math.max(0,wind.speed-4)*2-dangerPenalty
   -14*(1-surfSize.exposure);
 const requiredHome=spot.display_name+'は朝9時の海上モデル波高'+range+'m、周期'+round(period)+'秒前後。風は'+wind.label+'。'+wind.effect+'。';
 const requiredSpot=spot.display_name+'の朝9時はモデル波高'+range+'m、周期'+round(period)+'秒前後。風は'+wind.label+'。'+wind.effect+'。';
 const home=pickArticle(requiredHome,[tip[spot.id][0]+'。',tide?tide+'。':'','数字だけでなく波の割れ方も確かめたい。'].filter(Boolean));
 const detail=pickArticle(requiredSpot,[tip[spot.id][1]+'。',tide?tide+'。':'','潮と風の変化にも注意したい。'].filter(Boolean));
 return {id:spot.id,slug:spot.slug,name:spot.display_name,score:value,surf_size:surfSize,model_wave_min_m:min,model_wave_max_m:max,model_period_s:period,wind,home,detail,tide};
}
const raw=new Map();let generatedAt=null;
for(const s of spots){
 try{
  const d=JSON.parse(fs.readFileSync(path.join(dataDir,s.id+'.json'),'utf8'));
  const gen=new Date(d.generated_at);
  if(!Number.isFinite(+gen)||+gen>+now+15*60000||+now-+gen>36*3600000)continue;
  if(!generatedAt)generatedAt=d.generated_at;
  if(d.generated_at!==generatedAt)continue;
  raw.set(s.id,d);
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
function rankFor(date){
 const found=spots.map(s=>raw.get(s.id)?compute(raw.get(s.id),s,date):null);
 if(found.some(x=>!x))return {date,status:'held',missing:spots.filter((_,i)=>!found[i]).map(s=>s.display_name),entries:[]};
 const entries=found.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en')).map((r,i)=>({...r,rank:i+1}));
 return {date,status:'model_reference',entries};
}
const model={schema_version:1,kind:'KS_MODEL_REFERENCE',generated_at:generatedAt||null,updated_at:now.toISOString(),today:rankFor(today),tomorrow:rankFor(tomorrow)};
// Optional human-edited copy written by the existing ChatGPT schedule. Ranking and metrics
// remain deterministic. Reject the entire editorial file if it is stale or inconsistent.
function applyEditorial(day,slot){
 if(day.status!=='model_reference')return;
 const dir=arg['editorial-dir']||path.join(process.cwd(),'content','model-editorial');
 const file=path.join(dir,slot,day.date+'.json');
 if(!fs.existsSync(file))return;
 try{
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  const dayBefore=new Date(Date.parse(day.date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const publicationDate=slot==='morning'?day.date:dayBefore;
  if(d.schema_version!==1||d.status!=='ready'||d.slot!==slot||d.date!==day.date||
     typeof d.generated_at!=='string'||d.generated_at.slice(0,10)!==publicationDate||
     !Number.isFinite(Date.parse(d.generated_at))||Date.parse(d.generated_at)>+now+900000||
     !d.articles||Object.keys(d.articles).length!==9)throw Error('header/date/coverage');
  const substitutions=(txt,e)=>txt.replaceAll('{{wave_9_m}}',round(e.model_wave_min_m,2))
    .replaceAll('{{period_9_s}}',round(e.model_period_s,1))
    .replaceAll('{{wind_label}}',e.wind.label);
  const replacements=new Map();
  for(const e of day.entries){
   const a=d.articles[e.id];
   if(!a||typeof a.home!=='string'||typeof a.detail!=='string'||
      !Number.isFinite(a.wave_9_m)||!Number.isFinite(a.period_9_s)||
      !directions.includes(a.wind_label))throw Error('article '+e.id);
   // A numbered article without placeholders may only be published against an exact snapshot.
   const templated=a.home.includes('{{wave_9_m}}')&&a.detail.includes('{{wave_9_m}}')&&
      a.home.includes('{{period_9_s}}')&&a.detail.includes('{{period_9_s}}');
   const waveLimit=templated?0.25:0.015,periodLimit=templated?2.5:0.15;
   if(Math.abs(a.wave_9_m-e.model_wave_min_m)>waveLimit||
      Math.abs(a.period_9_s-e.model_period_s)>periodLimit||
      Math.abs(((directions.indexOf(a.wind_label)-directions.indexOf(e.wind.label))*22.5+540)%360-180)>67.5){
      throw Error('model drift '+e.id);
   }
   const home=substitutions(a.home,e),detail=substitutions(a.detail,e);
   if(home.includes('{{')||detail.includes('{{')||len(home)<90||len(home)>120||
      len(detail)<90||len(detail)>120||home===detail)throw Error('text length/tokens '+e.id);
   replacements.set(e.id,{home,detail});
  }
  for(const e of day.entries){
   const copy=replacements.get(e.id);
   e.home=copy.home;e.detail=copy.detail;e.editorial='reviewed';
  }
  console.log('PASS: applied nine validated editorial articles for '+slot+'/'+day.date);
 }catch(e){
  console.error('SKIP editorial '+slot+'/'+day.date+': '+e.message+'; using deterministic safe fallback');
 }
}
applyEditorial(model.today,'morning');
applyEditorial(model.tomorrow,'evening');
const style='<style id="ks-model-rank-css">.ks-model{width:min(calc(100% - 16px),1040px);margin:18px auto;padding:16px;box-sizing:border-box;background:#0b2c39;color:#f4fafb;border:1px solid #3d6674;border-radius:12px;overflow-wrap:anywhere}.ks-model h2{margin:0 0 10px;font-size:clamp(19px,5vw,26px);line-height:1.45}.ks-model h3{font-size:18px;margin:0 0 5px}.ks-model .ks-model-info{font-size:12px;color:#bdd5df;line-height:1.7}.ks-model-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}.ks-model-item{padding:12px;border:1px solid #335663;border-radius:9px}.ks-model-item p,.ks-model p{font:14px/1.75 system-ui,"Yu Gothic",sans-serif;margin:6px 0}.ks-surf-size{display:inline-block;margin:5px 0 7px;padding:5px 9px;border:1px solid #b3b4a4;border-radius:5px;font-size:13px;color:#fff4d3;font-weight:700}.ks-surf-disclaimer{font-size:12px;color:#c4d2d9;line-height:1.65;margin:6px 0 10px}.ks-model a{color:#bbeaff;text-decoration:underline}.ks-model .ks-model-day{--day-accent:#7dd3fc;--day-head:#075985;--day-edge:#38bdf8;--day-panel:#102f42;--day-card:#12384b;border:1px solid var(--day-edge);border-radius:12px;padding:12px;background:var(--day-panel);box-sizing:border-box}.ks-model .ks-model-day[data-day="tomorrow"]{--day-accent:#fdba74;--day-head:#9a3412;--day-edge:#fb923c;--day-panel:#362821;--day-card:#433024}.ks-model .ks-model-day+.ks-model-day{margin-top:22px}.ks-model .ks-model-day h2{background:var(--day-head);color:#fff;padding:12px 14px;border-radius:8px;border-left:5px solid var(--day-accent);margin:0 0 12px}.ks-model .ks-model-day .ks-model-item{background:var(--day-card);border-color:var(--day-edge)}.ks-model .ks-model-day a{color:var(--day-accent)}.ks-model .ks-model-day .ks-surf-size{color:var(--day-accent);border-color:var(--day-edge)}.ks-editorial-details{width:min(calc(100% - 16px),1040px);margin:8px auto;color:#d3e7ef}.ks-editorial-details summary{cursor:pointer;font-size:13px;padding:7px}.ks-editorial-details .ks-research{margin:8px auto}</style>';
// Absolute target dates and source generation timestamp survive delayed cron and cached pages.
function sourceStamp(){
 if(!model.generated_at)return '<p class="ks-model-info">予報データ生成時刻：確認できません</p>';
 const jst=new Date(Date.parse(model.generated_at)+9*3600000).toISOString().slice(0,16).replace('T',' ');
 return '<p class="ks-model-info">予報データ生成：<time datetime="'+esc(model.generated_at)+'">'+esc(jst)+' JST</time>｜対象日・時刻をご確認ください。</p>';
}
function blockDay(d,label,id){
 if(d.status!=='model_reference')return '<div class="ks-model-day" data-day="'+(label==='今日'?'today':'tomorrow')+'"><h2>'+label+'の関東 波情報（'+esc(d.date)+'）</h2><p>9地点の比較可能なモデル予報が揃っていないため、参考ランキングは保留です。</p><p class="ks-model-info">不足：'+esc(d.missing.join('、'))+'</p></div>';
 const lis=d.entries.map(e=>'<li class="ks-model-item"><h3>'+e.rank+'位 <a href="'+(id==='ranking'?'spots/'+esc(e.slug)+'/':'../../spots/'+esc(e.slug)+'/')+'">'+esc(e.name)+'</a></h3><span class="ks-surf-size">波サイズ予想：'+esc(e.surf_size.label)+'（試験推定）</span><p>'+esc(e.home)+'</p></li>').join('');
 return '<div class="ks-model-day" data-day="'+(label==='今日'?'today':'tomorrow')+'"><h2>'+label+'の関東 KSモデル参考ランキング BEST9（'+esc(d.date)+'）</h2><p class="ks-model-info">朝7〜10時の目安として、共通の9時の海上モデル波高・周期・風と海岸向きを比較。波サイズは沖の波高・周期・波向きと海岸向きからの未較正の試験推定で、実際のブレイクサイズや安全性を保証しません。</p><ol class="ks-model-list">'+lis+'</ol></div>';
}
function spotDay(d,s,label){
 const e=d.entries.find(x=>x.id===s.id);
 if(!e)return '<div class="ks-model-day" data-day="'+(label==='今日'?'today':'tomorrow')+'"><h2>'+label+'の波の狙い方（'+esc(d.date)+'）</h2><p>比較可能なモデルデータが不足しているため、この日の短文予報は保留です。</p></div>';
 return '<div class="ks-model-day" data-day="'+(label==='今日'?'today':'tomorrow')+'"><h2>'+label+'の波の狙い方（'+esc(d.date)+'）</h2><p class="ks-model-info">KSモデル参考 '+e.rank+'位／9地点・朝9時代表値</p><span class="ks-surf-size">波サイズ予想：'+esc(e.surf_size.label)+'（試験推定）</span><p>'+esc(e.detail)+'</p><p class="ks-surf-disclaimer">未較正のモデル換算目安です。現地の波サイズではありません。</p></div>';
}
function inject(file,id,body){
 let html=fs.readFileSync(file,'utf8');
 const a='<!-- KS-MODEL:'+id+':START -->',b='<!-- KS-MODEL:'+id+':END -->';
 const pos=html.indexOf(a),end=html.indexOf(b);
 if((pos<0)!==(end<0)||pos>=0&&(pos>end||html.indexOf(a,pos+1)>=0))throw Error('Broken model marker '+file);
 if(pos>=0)html=html.slice(0,pos)+html.slice(end+b.length);
 // Keep separate v2 editorial report accessible but collapsed, not competing with model headline.
 const editorial='<!-- KS-RESEARCH:'+id+':START -->';
 const at=html.indexOf(editorial)>=0?html.indexOf(editorial):
   id==='ranking'?html.indexOf('</main>'):html.indexOf('<section class="forecast-section"');
 if(at<0||(id!=='ranking'&&!html.includes('data-forecast'))||!html.includes('</main>'))throw Error('Unexpected page '+file);
 const content=a+'<section class="ks-model" id="ks-model-'+id+'">'+style+sourceStamp()+body+'</section>'+b;
 fs.writeFileSync(file,html.slice(0,at)+content+html.slice(at));
}
const pages=[{id:'ranking',rel:'index.html',body:blockDay(model.today,'今日','ranking')+blockDay(model.tomorrow,'明日','ranking')}];
for(const s of spots)pages.push({id:s.id,rel:'spots/'+s.slug+'/index.html',body:spotDay(model.today,s,'今日')+spotDay(model.tomorrow,s,'明日')});
for(const p of pages)inject(path.join(arg.root,p.rel),p.id,p.body);
fs.writeFileSync(path.join(arg.root,'data','model-ranking.json'),JSON.stringify(model,null,2)+'\n');
console.log('PASS model ranking: '+today+'='+model.today.status+' tomorrow='+model.tomorrow.status+', article lengths '+(model.today.entries.length?model.today.entries.map(e=>len(e.home)+'/'+len(e.detail)).join(', '):'none'));
