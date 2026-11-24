#!/usr/bin/env node
'use strict';
/*
 * Render independently checked surf reports into a copy of the public site.
 * Only HTML between KS-RESEARCH markers is managed. No forecast graph files
 * or model payloads are changed. Reject stale or incomplete data.
 */
const fs = require('node:fs');
const path = require('node:path');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw new Error('Use --key value arguments');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!args.root || !args.data || !args.config) throw new Error('Required: --root --data --config');

const spots = JSON.parse(fs.readFileSync(args.config, 'utf8')).spots;
const daily = JSON.parse(fs.readFileSync(args.data, 'utf8'));
const now = new Date();
const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (key) => parts.find((part) => part.type === key).value;
  return get('year') + '-' + get('month') + '-' + get('day');
};
const runDate = args.date || today();
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const text = (v, label, max = 500) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('Invalid ' + label);
  return v.trim();
};
const validIso = (v, label) => {
  text(v, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(v) ||
      Number.isNaN(Date.parse(v))) throw new Error('Invalid timestamp ' + label);
  return Date.parse(v);
};
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
if (!validDate(runDate) || daily.schema_version !== 1 || daily.date !== runDate) {
  throw new Error('Missing or stale research date: ' + daily.date + ', expected ' + runDate);
}
if (daily.status !== 'published' && !(daily.status === 'test' && args['allow-test'] === 'true')) {
  throw new Error('Research not authorized for publication: ' + daily.status);
}
if (!Array.isArray(spots) || spots.length !== 9 ||
    !Array.isArray(daily.rankings) || daily.rankings.length !== 9 ||
    !daily.reports || Array.isArray(daily.reports) || typeof daily.reports !== 'object') {
  throw new Error('Expected exactly nine rankings and nine reports');
}
const generated = validIso(daily.generated_at, 'generated_at');
if (!daily.generated_at.startsWith(runDate) || generated > now.getTime() + 15 * 60 * 1000 ||
    (args['allow-test'] !== 'true' && now.getTime() - generated > 12 * 60 * 60 * 1000)) {
  throw new Error('Research timestamp must be recent and on target date');
}
const spotById = new Map(spots.map((s) => [s.id, s]));
const rankById = new Map();
const ranks = new Set();
for (const r of daily.rankings) {
  if (!r || !spotById.has(r.spot_id) || rankById.has(r.spot_id) ||
      !Number.isInteger(r.rank) || r.rank < 1 || r.rank > 9 || ranks.has(r.rank)) {
    throw new Error('Invalid or duplicate rank/spot');
  }
  text(r.wave, 'wave', 90);
  text(r.wind, 'wind', 90);
  text(r.summary, 'ranking summary', 240);
  if (!['low', 'medium', 'high'].includes(r.confidence)) throw new Error('Missing rank confidence');
  rankById.set(r.spot_id, r);
  ranks.add(r.rank);
}
if (rankById.size !== 9 || Object.keys(daily.reports).length !== 9) {
  throw new Error('Nine reports and rankings must match configured spots');
}
for (const s of spots) {
  const report = daily.reports[s.id];
  if (!report || !rankById.has(s.id) ||
      !Array.isArray(report.paragraphs) || report.paragraphs.length < 2 ||
      report.paragraphs.length > 5 ||
      !Array.isArray(report.sources) || report.sources.length < 2 || report.sources.length > 8) {
    throw new Error('Missing/insufficient report for ' + s.id);
  }
  text(report.title, 'title', 140);
  text(report.summary, 'summary', 240);
  report.paragraphs.forEach((p) => text(p, 'paragraph', 800));
  const domains = new Set();
  for (const source of report.sources) {
    text(source.name, 'source name', 100);
    const raw = text(source.url, 'source URL', 400);
    const uri = new URL(raw);
    if (uri.protocol !== 'https:' || uri.username || uri.password || !uri.hostname.includes('.')) {
      throw new Error('Untrusted source URL ' + s.id);
    }
    domains.add(uri.hostname.replace(/^www\./, ''));
    const issue = validIso(source.issued_at, 'source issued_at');
    const checked = validIso(source.checked_at, 'source checked_at');
    const target = validIso(source.target_at, 'source target_at');
    if (checked > generated + 15 * 60 * 1000 || generated - checked > 24 * 60 * 60 * 1000 ||
        issue > generated + 15 * 60 * 1000 || !source.target_at.startsWith(runDate) || target < issue - 7 * 24 * 60 * 60 * 1000) {
      throw new Error('Source time mismatch for ' + s.id);
    }
  }
  if (domains.size < 2) throw new Error('Two independent source domains required for ' + s.id);
}
const visibleDate = daily.date.replace(/-/g, '/');
const updated = daily.generated_at.slice(11, 16) + ' JST';
const headline = '<div class="ks-r-title"><h2>関東 波ランキング BEST9</h2><p>' +
  esc(visibleDate) + '｜' + esc(updated) + ' 更新｜公開情報を比較した暫定予想</p></div>';
const sharedStyle = String.raw`<style id="ks-research-css">
  .ks-research{width:min(calc(100% - 36px),1040px);margin:22px auto 28px;padding:18px;border:1px solid rgba(120,175,195,.28);background:#092735;color:#f3faff;border-radius:10px}
  .ks-research *{box-sizing:border-box}
  .ks-research a{color:#b8e9ff}
  .ks-r-title h2{font-size:clamp(19px,4.8vw,26px);line-height:1.5;margin:0 0 5px}
  .ks-r-title p,.ks-r-note{font-size:12px;line-height:1.7;color:#b8d4df}
  .ks-rank-list{list-style:none;margin:12px 0;padding:0;display:grid;gap:8px}
  .ks-rank-list li{background:#103644;padding:12px;border:1px solid #315563;border-radius:6px;min-width:0}
  .ks-rank-list a{text-decoration:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  .ks-rank-num{font-weight:800;font-size:19px;color:#f6db83;min-width:2.5em}
  .ks-rank-name{font-weight:700;font-size:16px;color:#fff}
  .ks-rank-size{font-size:13px;color:#dfedf4}
  .ks-rank-list p{font-size:13px;line-height:1.7;margin:6px 0 0}
  .ks-report h3{font-size:clamp(18px,4.8vw,24px);line-height:1.5;margin:14px 0}
  .ks-report p{font-size:14px;line-height:1.9;margin:0 0 12px;overflow-wrap:anywhere}
  .ks-report details{font-size:12px;line-height:1.8;margin:12px 0}
  .ks-report li{margin:5px 0;overflow-wrap:anywhere}
  @media(max-width:600px){.ks-research{width:calc(100% - 16px);margin:14px 8px;padding:14px}.ks-rank-list a{gap:5px}.ks-rank-name{font-size:15px}}
  </style>`;
const notes = '<p class="ks-r-note">※ 海上の予報波高と実際のブレイクサイズは異なります。現地状況・流れ・最新の注意報を確認してください。予測順位は実測の保証ではありません。</p>';
const ordered = [...daily.rankings].sort((a, b) => a.rank - b.rank);
const rankMarkup = ordered.map((r) => {
  const s = spotById.get(r.spot_id);
  return '<li><a href="spots/' + esc(s.slug) + '/"><span class="ks-rank-num">' + r.rank +
    '位</span><span class="ks-rank-name">' + esc(s.display_name) + '</span><span class="ks-rank-size">' +
    esc(r.wave) + '｜' + esc(r.wind) + '</span></a><p>' + esc(r.summary) + '</p></li>';
}).join('');
const home = '<section class="ks-research" id="ks-research-ranking" aria-labelledby="ks-research-ranking-heading">' +
  sharedStyle + headline.replace('<h2>', '<h2 id="ks-research-ranking-heading">') +
  '<ol class="ks-rank-list">' + rankMarkup + '</ol>' + notes + '</section>';
function reportMarkup(s) {
  const report = daily.reports[s.id];
  const rank = rankById.get(s.id);
  const sources = report.sources.map((src) => '<li><a href="' + esc(src.url) +
    '" target="_blank" rel="noopener noreferrer">' + esc(src.name) + '</a>（発表 ' +
    esc(src.issued_at) + '／対象 ' + esc(src.target_at) + '／確認 ' +
    esc(src.checked_at) + '）</li>').join('');
  return '<section class="ks-research ks-report" id="ks-research-spot" aria-labelledby="ks-research-spot-heading">' +
    sharedStyle + '<div class="ks-r-title"><h2 id="ks-research-spot-heading">' + esc(s.display_name) +
    ' 今日の波情報</h2><p>' + esc(visibleDate) + '｜' + esc(updated) +
    ' 更新｜暫定ランキング ' + rank.rank + '位（確度 ' +
    esc(rank.confidence) + '）</p></div><h3>' + esc(report.title) + '</h3><p><strong>' +
    esc(report.summary) + '</strong></p>' + report.paragraphs.map((p) => '<p>' + esc(p) + '</p>').join('') +
    '<details><summary>出典・発表時刻を確認</summary><ul>' + sources + '</ul></details>' + notes + '</section>';
}
function patchFile(file, id, html) {
  if (!fs.existsSync(file)) throw new Error('Missing live file: ' + file);
  const original = fs.readFileSync(file, 'utf8');
  const startTag = '<!-- KS-RESEARCH:' + id + ':START -->';
  const endTag = '<!-- KS-RESEARCH:' + id + ':END -->';
  const p1 = original.indexOf(startTag);
  const p2 = original.indexOf(endTag);
  let without = original;
  if (p1 !== -1 || p2 !== -1) {
    if (p1 < 0 || p2 < p1 || original.indexOf(startTag, p1 + 1) !== -1 ||
        original.indexOf(endTag, p2 + 1) !== -1) throw new Error('Broken research markers ' + file);
    without = original.slice(0, p1) + original.slice(p2 + endTag.length);
  }
  const anchor = '<section class="forecast-section"';
  const at = without.indexOf(anchor);
  if (at < 0 || without.indexOf('data-forecast') < 0 || without.indexOf('</main>') < 0) {
    throw new Error('Unexpected HTML structure: ' + file);
  }
  const output = without.slice(0, at) + startTag + html + endTag + without.slice(at);
  fs.writeFileSync(file, output, 'utf8');
  return output;
}
const root = path.resolve(args.root);
const files = [{file: path.join(root, 'index.html'), id: 'ranking', html: home}];
for (const spot of spots) {
  files.push({file: path.join(root, 'spots', spot.slug, 'index.html'), id: spot.id, html: reportMarkup(spot)});
}
for (const item of files) {
  patchFile(item.file, item.id, item.html);
}
console.log('PASS: current-day, source-backed BEST9 and 9 articles installed into 10 HTML files: ' + daily.date);
