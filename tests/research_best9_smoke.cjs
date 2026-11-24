#!/usr/bin/env node
'use strict';
// All test values are synthetic fixtures, never production surf observations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const base = path.resolve(__dirname, '..');
const spots = JSON.parse(fs.readFileSync(path.join(base, 'config/representative-spots.json'), 'utf8')).spots;
const jst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+09:00';
const day = jst.slice(0, 10);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-research-test-'));
const html = '<!doctype html><html><head></head><body><main><section class="beta-intro"><h1>Current design</h1></section><section class="forecast-section" aria-label="existing"><div data-forecast>graph</div><table data-daily-body><tr><td>10-day forecast</td></tr></table></section></main></body></html>';
const make = () => ({
  schema_version: 1, date: day, generated_at: jst, status: 'test',
  rankings: spots.map((s, i) => ({
    rank: i + 1, spot_id: s.id, wave: '未検証（試験値）',
    wind: '未検証（試験値）', summary: '自動テスト用の仮データ', confidence: 'low'
  })),
  reports: Object.fromEntries(spots.map((s) => [s.id, {
    title: s.display_name + ' 自動テスト', summary: '本番公開禁止の試験データ',
    paragraphs: ['モデル波高とブレイクサイズは別です。', '二つの独立した情報源の確認が必要です。'],
    sources: [
      {name:'TEST A',url:'https://example.org/a',issued_at:jst,checked_at:jst,target_at:jst},
      {name:'TEST B',url:'https://example.com/b',issued_at:jst,checked_at:jst,target_at:jst}
    ]
  }]))
});
const site = path.join(temp,'site');
fs.mkdirSync(site);
for (const s of spots) fs.mkdirSync(path.join(site,'spots',s.slug),{recursive:true});
const files = [path.join(site,'index.html'), ...spots.map((s)=>path.join(site,'spots',s.slug,'index.html'))];
files.forEach((f)=>fs.writeFileSync(f,html));
const dataPath = path.join(temp,'data.json');
const render = () => spawnSync(process.execPath, [path.join(base,'scripts/render_daily_research.cjs'),
  '--root',site,'--data',dataPath,'--config',path.join(base,'config/representative-spots.json'),
  '--date',day,'--allow-test','true'],{encoding:'utf8'});
const data = make();
fs.writeFileSync(dataPath, JSON.stringify(data));
let result = render();
assert.equal(result.status,0,result.stderr);
assert.match(fs.readFileSync(files[0],'utf8'), /ks-research-ranking/);
assert.equal((fs.readFileSync(files[0],'utf8').match(/class="ks-rank-num"/g)||[]).length,9);
for (const f of files) {
  const s = fs.readFileSync(f,'utf8');
  assert.match(s,/data-forecast>graph/);
  assert.match(s,/10-day forecast/);
  assert.match(s,/KS-RESEARCH:/);
}
const snapshot = files.map((f)=>fs.readFileSync(f,'utf8'));
assert.equal(render().status,0,'rerender should be idempotent');
files.forEach((f,i)=>assert.equal(fs.readFileSync(f,'utf8'),snapshot[i]));
data.rankings[0].summary = '<script>alert(1)</script>';
fs.writeFileSync(dataPath, JSON.stringify(data));
assert.equal(render().status,0);
const home = fs.readFileSync(files[0],'utf8');
assert.match(home,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(home,/<script>alert/);
const bad = make();
bad.rankings[1].rank=1;
fs.writeFileSync(dataPath,JSON.stringify(bad));
assert.notEqual(render().status,0,'duplicate rank must be refused');
bad.rankings[1].rank=2;
bad.reports[spots[1].id].sources.pop();
fs.writeFileSync(dataPath,JSON.stringify(bad));
assert.notEqual(render().status,0,'one source must be refused');
bad.status='published';
fs.writeFileSync(dataPath,JSON.stringify(bad));
assert.notEqual(render().status,0,'published content still requires 2 independent sources');
fs.rmSync(temp,{recursive:true,force:true});
console.log('PASS: BEST9, nine spots, HTML escaping, stable re-run, preservation, rejected invalid research');
