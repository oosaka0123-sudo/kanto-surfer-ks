'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const opts = {};
for (let i = 2; i < process.argv.length; i += 2) {
  assert(process.argv[i].startsWith('--') && process.argv[i+1], 'Expected --key value');
  opts[process.argv[i].slice(2)] = process.argv[i+1];
}
assert(opts.root && opts['research-dir'] && opts.config, 'Required: --root --research-dir --config');
const now = opts.now ? new Date(opts.now) : new Date();
assert(Number.isFinite(+now), 'Invalid now');
const jst = d => new Date(+d + 9*3600000).toISOString().slice(0,10);
const shift = (d,n) => new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const today = jst(now), tomorrow = shift(today,1);
const spots = JSON.parse(fs.readFileSync(opts.config,'utf8')).spots;
assert(Array.isArray(spots) && spots.length === 9, 'Expected 9 configured spots');
const ids = new Set(spots.map(s=>s.id));
assert(ids.size===9 && spots.every(s=>/^[a-z0-9_-]+$/.test(s.id) && /^[a-z0-9-]+$/.test(s.slug)), 'Invalid spots');
const str = (x, max=500) => typeof x==='string' && x.trim().length>0 && x.length<=max;
const iso = x => typeof x==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(x) && Number.isFinite(Date.parse(x));
const esc = x => String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(slot,date) {
  const file = path.join(opts['research-dir'],slot,date+'.json');
  if(!fs.existsSync(file)) return null;
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  const bad = m => {throw new Error(slot+'/'+date+': '+m);};
  if(d.schema_version!==2 || d.slot!==slot || d.date!==date || !['published','partial','held'].includes(d.status)) bad('header');
  const issuedDay = slot==='morning'?date:shift(date,-1);
  if(!iso(d.generated_at) || d.generated_at.slice(0,10)!==issuedDay || Date.parse(d.generated_at)>+now+900000) bad('generated_at');
  if(!d.reports || typeof d.reports!=='object' || Array.isArray(d.reports) || !d.missing || typeof d.missing!=='object' || Array.isArray(d.missing) || !Array.isArray(d.rankings)) bad('shape');
  const keys=Object.keys(d.reports), missing=Object.keys(d.missing);
  if(keys.length+missing.length!==9 || [...keys,...missing].some(k=>!ids.has(k)) || keys.some(k=>Object.hasOwn(d.missing,k))) bad('spot coverage');
  for(const k of missing) if(!str(d.missing[k],240)) bad('missing reason '+k);
  for(const k of keys) {
    const r=d.reports[k];
    if(!r || !str(r.title,140) || !str(r.summary,240) || !str(r.wave,90) || !str(r.wind,90) ||
       !['low','medium','high'].includes(r.confidence) || !['forecast','observed','mixed'].includes(r.basis) ||
       (slot==='evening' && r.basis!=='forecast') || !Array.isArray(r.paragraphs) || r.paragraphs.length<2 || r.paragraphs.length>5 ||
       !r.paragraphs.every(p=>str(p,800)) || !Array.isArray(r.sources) || r.sources.length<2 || r.sources.length>8) bad('report '+k);
    const domains=new Set(), upstream=new Set();
    let hasWave=false, hasObserved=false, hasForecast=false;
    for(const s of r.sources) {
      if(!s || !str(s.name,100) || !str(s.url,400) || !str(s.upstream,100) || !['spot','region'].includes(s.scope) ||
         !['forecast','observed','official_warning','tide'].includes(s.kind) || s.target_date!==date ||
         !iso(s.checked_at) || Date.parse(s.checked_at)>Date.parse(d.generated_at)+900000 ||
         Date.parse(d.generated_at)-Date.parse(s.checked_at)>86400000 ||
         (s.issued_at!==null && (!iso(s.issued_at) || Date.parse(s.issued_at)>Date.parse(s.checked_at)+900000))) bad('source '+k);
      let u; try {u=new URL(s.url);} catch {bad('url '+k);}
      if(u.protocol!=='https:' || u.username || u.password || !u.hostname.includes('.')) bad('unsafe URL '+k);
      domains.add(u.hostname.toLowerCase().replace(/^www\./,''));
      upstream.add(s.upstream.trim().toLowerCase());
      if(s.scope==='spot' && ['forecast','observed'].includes(s.kind)) hasWave=true;
      if(s.scope==='spot' && s.kind==='observed') hasObserved=true;
      if(s.kind==='forecast') hasForecast=true;
    }
    if(domains.size<2 || upstream.size<2 || !hasWave ||
       (r.basis!=='forecast' && !hasObserved) || (r.basis!=='observed' && !hasForecast) ||
       (slot==='evening' && r.sources.some(s=>s.kind==='observed'))) bad('independence or basis '+k);
    if(r.warning!==undefined && !str(r.warning,300)) bad('warning '+k);
  }
  if(d.status==='published') {
    if(keys.length!==9 || d.rankings.length!==9) bad('published requires all 9');
    const ranked=new Set(), ranks=new Set();
    for(const r of d.rankings){
      if(!r || !ids.has(r.spot_id) || ranked.has(r.spot_id) || !Number.isInteger(r.rank) || r.rank<1 || r.rank>9 || ranks.has(r.rank) || !str(r.summary,240)) bad('rank');
      ranked.add(r.spot_id); ranks.add(r.rank);
    }
  } else if(d.rankings.length || (d.status==='held' && keys.length) || (d.status==='partial' && !keys.length)) bad('partial/held consistency');
  return d;
}
const morning=read('morning',today), prior=read('evening',today), evening=read('evening',tomorrow);
const style='<style id="ks-research-v2-css">.ks-research{width:min(calc(100% - 16px),1040px);margin:18px auto;padding:14px;box-sizing:border-box;background:#092735;color:#f3faff;border:1px solid #315563;border-radius:10px;overflow-wrap:anywhere}.ks-research h2{font-size:clamp(19px,4.8vw,26px);line-height:1.5;margin:0 0 8px}.ks-research h3{font-size:18px;margin:12px 0 6px}.ks-research p,.ks-research li{font-family:system-ui,"Yu Gothic",sans-serif;font-size:14px;line-height:1.85;margin:8px 0}.ks-research a{color:#b8e9ff}.ks-research ol{padding-left:1.5em}.ks-research .ks-note{font-size:12px;color:#bdd4df}.ks-research .ks-slot+.ks-slot{border-top:1px solid #315563;margin-top:16px;padding-top:16px}</style>';
const label = d => d.slot==='morning'?'当日朝の調査':'前日夜の予報';
const stamp = d => '<p class="ks-note">'+esc(d.date)+' 対象｜'+esc(d.generated_at.slice(0,16).replace('T',' '))+' JST 更新｜'+label(d)+'</p>';
const safeNote='<p class="ks-note">海上モデル波高は現地ブレイクサイズとは異なります。予報・順位は安全性を保証しません。現地状況と最新の注意報を確認してください。</p>';
function heading(day,kind) {return '<h2>'+day+'の'+kind+'</h2>';}
function ranked(d){
  const ordered=[...d.rankings].sort((a,b)=>a.rank-b.rank);
  return '<ol>'+ordered.map(r=>{
    const s=spots.find(s=>s.id===r.spot_id), v=d.reports[r.spot_id];
    return '<li><a href="spots/'+esc(s.slug)+'/"><strong>'+esc(s.display_name)+'</strong></a> '+esc(v.wave)+'｜'+esc(v.wind)+'<p>'+esc(r.summary)+'</p></li>';
  }).join('')+'</ol>';
}
function candidates(d) {
  if (!d || !Object.keys(d.reports).length) return '';
  return '<h3>確認できたポイント（順位なし）</h3><ul class="ks-candidates">'+spots.filter(s=>d.reports[s.id]).map(s=>{
    const r=d.reports[s.id]; return '<li><a href="spots/'+esc(s.slug)+'/"><strong>'+esc(s.display_name)+'</strong></a><br>'+esc(r.wave)+'｜'+esc(r.wind)+'</li>';
  }).join('')+'</ul>';
}
function homeDay(day,d,fallback){
  // BEST9 is a verified editorial ranking, never a heading for partial or missing research.
  const full=d?.status==='published';
  let out=heading(day,full?'関東 波ランキング BEST9':'関東 波情報');
  if(full) return out+stamp(d)+ranked(d);
  if(d) {
    out+=stamp(d);
    const count=Object.keys(d.reports).length;
    out+='<p>ランキングは保留です（掲載基準を満たした地点 '+count+'/9）。'+
      (count?'確認できた地点の予報記事を掲載しています。':'比較可能な9地点の調査結果が揃っていません。')+'</p>';
    out+=candidates(d);
  } else {
    out+='<p>'+(day==='今日'?
      '今朝の調査結果が保存されていないため、当日のランキングは掲載できません。前夜の予報を参考情報として表示します。':
      '翌日の調査結果がまだ保存されていません。')+'</p>';
  }
  if(fallback?.status==='published') out+='<h3>参考：昨夜の予報ランキング</h3>'+stamp(fallback)+ranked(fallback);
  else if(fallback?.status==='partial') out+='<h3>参考：昨夜の予報（掲載可能 '+Object.keys(fallback.reports).length+'/9地点・順位なし）</h3>'+stamp(fallback)+candidates(fallback);
  return out;
}
function reportMarkup(d,s){
  const r=d.reports[s.id];
  const basis={forecast:'予報・推定',observed:'現地観測',mixed:'観測と予報を区別して掲載'}[r.basis];
  return stamp(d)+'<h3>'+esc(r.title)+'</h3><p><strong>'+esc(r.wave)+'｜'+esc(r.wind)+'</strong></p><p class="ks-note">'+basis+'｜確度 '+({low:'低',medium:'中',high:'高'}[r.confidence])+'</p><p>'+esc(r.summary)+'</p>'+
    r.paragraphs.filter(p=>p.trim()!==r.summary.trim()).map(p=>'<p>'+esc(p)+'</p>').join('')+
    (r.warning?'<p><strong>注意：</strong>'+esc(r.warning)+'</p>':'')+
    '<details><summary>出典・確認時刻</summary><ul>'+r.sources.map(s=>'<li><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.name)+'</a>（'+(s.scope==='spot'?'地点':'地域')+'・'+({forecast:'予報',observed:'実況',official_warning:'注意報・警報',tide:'潮汐'}[s.kind])+'｜発表 '+esc(s.issued_at||'不明')+'｜確認 '+esc(s.checked_at)+'）</li>').join('')+'</ul></details>';
}
function spotDay(day,d,s,fallback){
  let out=heading(day,'波情報');
  if(d?.reports[s.id]) return out+reportMarkup(d,s);
  if(d) out+=stamp(d)+'<p>地点の情報不足：'+esc(d.missing[s.id]||'確認できる情報が不足')+'</p>';
  else out+='<p>'+(day==='今日'?'今朝の調査記事は未保存です。前夜の予報があれば参考情報として表示します。':'翌日の調査記事はまだ保存されていません。')+'</p>';
  if(fallback?.reports[s.id]) out+='<h3>参考：昨夜の予報</h3>'+reportMarkup(fallback,s);
  return out;
}
const wrap=(a,b)=>'<details class="ks-editorial-details"><summary>補足：独立調査記事・出典を見る</summary><section class="ks-research" id="ks-research-v2">'+style+'<div class="ks-slot">'+a+'</div><div class="ks-slot">'+b+'</div>'+safeNote+'</section></details>';
const files=[{rel:'index.html',id:'ranking',html:wrap(homeDay('今日',morning,prior),homeDay('明日',evening))}];
for(const s of spots) files.push({rel:'spots/'+s.slug+'/index.html',id:s.id,html:wrap(spotDay('今日',morning,s,prior),spotDay('明日',evening,s))});
const rendered=files.map(f=>{
  const file=path.join(opts.root,f.rel), original=fs.readFileSync(file,'utf8');
  const start='<!-- KS-RESEARCH:'+f.id+':START -->', end='<!-- KS-RESEARCH:'+f.id+':END -->';
  const a=original.indexOf(start), b=original.indexOf(end);
  if((a<0)!==(b<0) || (a>=0 && (b<a || original.indexOf(start,a+1)>=0 || original.indexOf(end,b+1)>=0))) throw new Error('Broken marker '+f.rel);
  const clean=a<0?original:original.slice(0,a)+original.slice(b+end.length);
  if(clean.includes('<!-- KS-RESEARCH:')) throw new Error('Unexpected marker '+f.rel);
  const at=f.id==='ranking'?clean.indexOf('</main>'):clean.indexOf('<section class="forecast-section"');
  if(at<0 || (f.id!=='ranking'&&!clean.includes('data-forecast')) || !clean.includes('</main>')) throw new Error('Unexpected HTML '+f.rel);
  return {file,output:clean.slice(0,at)+start+f.html+end+clean.slice(at)};
});
for(const f of rendered) fs.writeFileSync(f.file,f.output,'utf8');
console.log('PASS research v2: '+today+' morning='+ (morning?.status||'missing')+' prior='+ (prior?.status||'missing')+' tomorrow='+ (evening?.status||'missing')+'; 10 pages staged');
