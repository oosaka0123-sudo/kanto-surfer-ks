'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..'), config=path.join(base,'config/representative-spots.json');
const spots=JSON.parse(fs.readFileSync(config,'utf8')).spots;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ks-v2-'));
const site=path.join(root,'site'), research=path.join(root,'research');
const pages=['index.html',...spots.map(s=>'spots/'+s.slug+'/index.html')];
const html='<!doctype html><html><body><main><section class="forecast-section" data-forecast>ORIGINAL</section></main></body></html>';
for(const p of pages){const f=path.join(site,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,html);}
function fixture(slot,date,generated,count,rank=true) {
 const reports={},missing={},rankings=[];
 for(const [i,s] of spots.entries()){
   if(i>=count){missing[s.id]='Insufficient independent evidence';continue;}
   reports[s.id]={title:'TEST ONLY '+s.id,summary:'Synthetic <script> only',wave:'Model forecast, not observed',wind:'Test wind',confidence:'medium',basis:'forecast',paragraphs:['Test paragraph A','Test paragraph B'],sources:[
     {name:'Test A',url:'https://example.com/'+s.id,upstream:'A',scope:'spot',kind:'forecast',target_date:date,issued_at:null,checked_at:generated},
     {name:'Test B',url:'https://example.org/'+s.id,upstream:'B',scope:'region',kind:'forecast',target_date:date,issued_at:generated,checked_at:generated}
   ]};
   if(count===9&&rank) rankings.push({spot_id:s.id,rank:i+1,summary:'Synthetic rank only'});
 }
 return {schema_version:2,slot,date,generated_at:generated,status:count===9&&rank?'published':count?'partial':'held',reports,missing,rankings};
}
function write(d){const p=path.join(research,d.slot,d.date+'.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(d));}
function run(now,ok=true){const p=spawnSync(process.execPath,[path.join(base,'scripts/render_research_v2.cjs'),'--root',site,'--research-dir',research,'--config',config,'--now',now],{encoding:'utf8'});assert.equal(p.status===0,ok,p.stderr||p.stdout);}
const snapshot=()=>pages.map(p=>fs.readFileSync(path.join(site,p),'utf8'));
const strip=s=>s.replace(/<!-- KS-RESEARCH:[a-z0-9_]+:START -->[\s\S]*?<!-- KS-RESEARCH:[a-z0-9_]+:END -->/g,'');
try{
 const evening=fixture('evening','2026-11-26','2026-11-25T19:40:00+09:00',9);
 const morning=fixture('morning','2026-11-25','2026-11-25T07:40:00+09:00',3);
 write(morning);write(evening);
 run('2026-11-25T20:00:00+09:00');
 let out=snapshot(); assert(out[0].includes('3/9'));assert(out[0].includes('2026-11-26'));assert(out[1].includes('TEST ONLY'));assert(out[5].includes('Insufficient independent evidence'));assert(!out[1].includes('<script>'));assert(out[1].includes('&lt;script&gt;'));
 assert(out.every(s=>strip(s)===html));run('2026-11-25T20:00:00+09:00');assert.deepEqual(snapshot(),out);
 run('2026-11-26T00:01:00+09:00');out=snapshot();assert(out[0].includes('参考：昨夜の予報ランキング'));assert(out[1].includes('2026-11-26'));assert(!out[0].includes('3/9'));assert(out[0].includes('今日の関東 波情報'));assert(!out[0].includes('今日の関東 波ランキング BEST9'));assert(out[0].includes('今朝の調査結果が保存されていない'));
 const next=fixture('morning','2026-11-26','2026-11-26T07:40:00+09:00',9);
 write(next);run('2026-11-26T08:00:00+09:00');out=snapshot();assert(!out[0].includes('参考：昨夜の予報ランキング'));assert(out[0].includes('当日朝の調査'));
 next.rankings[1].rank=1;write(next);run('2026-11-26T08:00:00+09:00',false);assert.deepEqual(snapshot(),out);
 next.rankings[1].rank=2;next.reports[spots[0].id].sources[1].upstream='A';write(next);run('2026-11-26T08:00:00+09:00',false);assert.deepEqual(snapshot(),out);
 // Distinct domains and spelling variants must not manufacture independent sources.
 const cases=[
  [{url:'https://kanto.rss7.net/data/kugenuma.json',upstream:'Open-Meteo'},{url:'https://surf-ok.jp/forecast/kugenuma/',upstream:'Surf-OK'}],
  [{url:'https://surf-ok.jp/test',upstream:'Open-Meteo'},{url:'https://surf-ok.jp./test',upstream:'Surf-OK'}],
  [{url:'https://www.jma.go.jp/test',upstream:'JMA'},{url:'https://www6.kaiho.mlit.go.jp/test/alternate-forecast.html',upstream:'海上保安庁'}],
  [{url:'https://example.com/test',upstream:'A'},{url:'https://example.org/test',upstream:'B',kind:'official_warning'}],
  [{url:'https://kanto.rss7.net/data/kugenuma.json',upstream:'Open Meteo'},{url:'https://surfarea.info/forecast/kugenuma/',upstream:'SURFAREA'}],
  [{url:'https://www.surfline.com/surf-report/test',upstream:'Surfline'},{url:'https://liff.namiaru.com/test',upstream:'なみある？'}],
  [{url:'https://m.bc01.com/test',upstream:'BCM A'},{url:'https://www.bc01.com/test',upstream:'BCM B'}],
  [{url:'https://www.data.jma.go.jp/test',upstream:'気象庁'},{url:'https://www7.kaiho.mlit.go.jp/micsmail/dtl/uyh/3000.html',upstream:'海上保安庁'}],
  [{url:'https://example.com/test',upstream:'未確認'},{url:'https://example.org/test',upstream:'B'}],
  [{url:'https://example.com/test',upstream:'A'},{url:'https://example.org/test',upstream:'B',kind:'tide'}]
 ];
 for(const pair of cases){
   const sample=fixture('morning','2026-11-26','2026-11-26T07:40:00+09:00',9);
   const sources=sample.reports[spots[0].id].sources;
   pair.forEach((s,i)=>Object.assign(sources[i],s));
   write(sample);run('2026-11-26T08:00:00+09:00',false);assert.deepEqual(snapshot(),out);
 }
 // Independent official forecast plus a point forecast remains eligible.
 const valid=fixture('morning','2026-11-26','2026-11-26T07:40:00+09:00',9);
 const sources=valid.reports[spots[0].id].sources;
 Object.assign(sources[0],{url:'https://kanto.rss7.net/data/kugenuma.json',upstream:'Open-Meteo'});
 Object.assign(sources[1],{url:'https://www.data.jma.go.jp/test',upstream:'JMA'});
 write(valid);run('2026-11-26T08:00:00+09:00');out=snapshot();
 // A point forecast and a separate official warning can support a partial report, not a full ranking.
 const partial=fixture('morning','2026-11-26','2026-11-26T07:40:00+09:00',1);
 partial.reports[spots[0].id].sources[1].kind='official_warning';
 partial.reports[spots[0].id].warning='Synthetic safety warning';
 write(partial);run('2026-11-26T08:00:00+09:00');
 assert(snapshot()[0].includes('1/9'));assert(snapshot()[1].includes('Synthetic safety warning'));assert(snapshot()[1].includes('TEST ONLY'));
 // Independent local observation may reference a model comparison without sharing its origin.
 const mixed=fixture('morning','2026-11-26','2026-11-26T07:40:00+09:00',1);
 const m=mixed.reports[spots[0].id];m.basis='mixed';
 Object.assign(m.sources[0],{url:'https://example.org/observation',upstream:'Local observers (Surfline comparison)',kind:'observed'});
 Object.assign(m.sources[1],{url:'https://www.surfline.com/forecast',upstream:'Surfline',kind:'forecast'});
 write(mixed);run('2026-11-26T08:00:00+09:00');
 assert(snapshot()[1].includes('観測と予報を区別して掲載'));assert(snapshot()[0].includes('1/9'));
 const held=fixture('morning','2026-11-26','2026-11-26T08:10:00+09:00',0);write(held);run('2026-11-26T08:20:00+09:00');assert(snapshot()[0].includes('0/9'));assert(snapshot()[0].includes('今日の関東 波情報'));assert(!snapshot()[0].includes('今日の関東 波ランキング BEST9'));assert(snapshot()[1].includes('参考：昨夜の予報'));
 run('2026-11-27T00:01:00+09:00');out=snapshot();assert(!out[0].includes('2026-11-26'));assert(out.every(s=>strip(s)===html));
 console.log('PASS: partial, held, evening, rollover, ranking replacement, no duplicate ranks, independence, escaping, idempotency, original HTML, expiry');
}finally{fs.rmSync(root,{recursive:true,force:true});}
