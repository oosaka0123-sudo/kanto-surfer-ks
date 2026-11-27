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
 // Heuristic comparisons only; no observed break size, empirical surf-point grading, or numeric score displayed.
 const windPart=wind.category==='off'?7:wind.category==='side'?1:-8;
 const dangerPenalty=avg>2.3?24+(avg-2.3)*16:avg>1.8?(avg-1.8)*9:0;
 const value=20*Math.min(avg,2.5)+2.1*Math.min(period,13)+windPart-Math.max(0,wind.speed-4)*2-dangerPenalty;
 const requiredHome=spot.display_name+'は朝9時の海上モデル波高'+range+'m、周期'+round(period)+'秒前後。風は'+wind.label+'。'+wind.effect+'。';
 const requiredSpot=spot.display_name+'の朝9時はモデル波高'+range+'m、周期'+round(period)+'秒前後。風は'+wind.label+'。'+wind.effect+'。';
 const home=pickArticle(requiredHome,[tip[spot.id][0]+'。',tide?tide+'。':'','数字だけでなく波の割れ方も確かめたい。'].filter(Boolean));
 const detail=pickArticle(requiredSpot,[tip[spot.id][1]+'。',tide?tide+'。':'','潮と風の変化にも注意したい。'].filter(Boolean));
 return {id:spot.id,slug:spot.slug,name:spot.display_name,score:value,model_wave_min_m:min,model_wave_max_m:max,model_period_s:period,wind,home,detail,tide};
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
const style='<style id="ks-model-rank-css">.ks-model{width:min(calc(100% - 16px),1040px);margin:18px auto;padding:16px;box-sizing:border-box;background:#0b2c39;color:#f4fafb;border:1px solid #3d6674;border-radius:12px;overflow-wrap:anywhere}.ks-model h2{margin:0 0 10px;font-size:clamp(19px,5vw,26px);line-height:1.45}.ks-model h3{font-size:18px;margin:0 0 5px}.ks-model .ks-model-info{font-size:12px;color:#bdd5df;line-height:1.7}.ks-model-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}.ks-model-item{padding:12px;border:1px solid #335663;border-radius:9px}.ks-model-item p,.ks-model p{font:14px/1.75 system-ui,"Yu Gothic",sans-serif;margin:6px 0}.ks-model a{color:#bbeaff;text-decoration:underline}.ks-model .ks-model-day+.ks-model-day{border-top:1px solid #3d6674;margin-top:18px;padding-top:18px}.ks-editorial-details{width:min(calc(100% - 16px),1040px);margin:8px auto;color:#d3e7ef}.ks-editorial-details summary{cursor:pointer;font-size:13px;padding:7px}.ks-editorial-details .ks-research{margin:8px auto}</style>';
function blockDay(d,label,id){
 if(d.status!=='model_reference')return '<div class="ks-model-day"><h2>'+label+'の関東 波情報</h2><p>9地点の比較可能なモデル予報が揃っていないため、参考ランキングは保留です。</p><p class="ks-model-info">不足：'+esc(d.missing.join('、'))+'</p></div>';
 const lis=d.entries.map(e=>'<li class="ks-model-item"><h3>'+e.rank+'位 <a href="'+(id==='ranking'?'spots/'+esc(e.slug)+'/':'../../spots/'+esc(e.slug)+'/')+'">'+esc(e.name)+'</a></h3><p>'+esc(e.home)+'</p></li>').join('');
 return '<div class="ks-model-day"><h2>'+label+'の関東 KSモデル参考ランキング BEST9</h2><p class="ks-model-info">朝7〜10時の目安として、共通の9時の海上モデル波高・周期・風と海岸向きを比較。実際のブレイクサイズや安全性の順位ではありません。</p><ol class="ks-model-list">'+lis+'</ol></div>';
}
function spotDay(d,s,label){
 const e=d.entries.find(x=>x.id===s.id);
 if(!e)return '<div class="ks-model-day"><h2>'+label+'の波の狙い方</h2><p>比較可能なモデルデータが不足しているため、この日の短文予報は保留です。</p></div>';
 return '<div class="ks-model-day"><h2>'+label+'の波の狙い方</h2><p class="ks-model-info">KSモデル参考 '+e.rank+'位／9地点・朝9時代表値</p><p>'+esc(e.detail)+'</p></div>';
}
function inject(file,id,body){
 let html=fs.readFileSync(file,'utf8');
 const a='<!-- KS-MODEL:'+id+':START -->',b='<!-- KS-MODEL:'+id+':END -->';
 const pos=html.indexOf(a),end=html.indexOf(b);
 if((pos<0)!==(end<0)||pos>=0&&(pos>end||html.indexOf(a,pos+1)>=0))throw Error('Broken model marker '+file);
 if(pos>=0)html=html.slice(0,pos)+html.slice(end+b.length);
 // Keep separate v2 editorial report accessible but collapsed, not competing with model headline.
 const editorial='<!-- KS-RESEARCH:'+id+':START -->';
 const at=html.indexOf(editorial)>=0?html.indexOf(editorial):html.indexOf('<section class="forecast-section"');
 if(at<0||!html.includes('data-forecast')||!html.includes('</main>'))throw Error('Unexpected page '+file);
 const content=a+'<section class="ks-model" id="ks-model-'+id+'">'+style+body+'</section>'+b;
 fs.writeFileSync(file,html.slice(0,at)+content+html.slice(at));
}
const pages=[{id:'ranking',rel:'index.html',body:blockDay(model.today,'今日','ranking')+blockDay(model.tomorrow,'明日','ranking')}];
for(const s of spots)pages.push({id:s.id,rel:'spots/'+s.slug+'/index.html',body:spotDay(model.today,s,'今日')+spotDay(model.tomorrow,s,'明日')});
for(const p of pages)inject(path.join(arg.root,p.rel),p.id,p.body);
fs.writeFileSync(path.join(arg.root,'data','model-ranking.json'),JSON.stringify(model,null,2)+'\n');
console.log('PASS model ranking: '+today+'='+model.today.status+' tomorrow='+model.tomorrow.status+', article lengths '+(model.today.entries.length?model.today.entries.map(e=>len(e.home)+'/'+len(e.detail)).join(', '):'none'));
