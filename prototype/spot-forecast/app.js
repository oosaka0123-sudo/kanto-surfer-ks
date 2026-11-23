(()=>{"use strict";
const root=document.querySelector("[data-forecast]");
const menuButton=document.querySelector(".menu-button"),siteMenu=document.querySelector("#site-menu");
function setMenu(open){if(!menuButton||!siteMenu)return;menuButton.setAttribute("aria-expanded",String(open));siteMenu.hidden=!open;document.body.classList.toggle("menu-open",open)}
menuButton?.addEventListener("click",()=>setMenu(menuButton.getAttribute("aria-expanded")!=="true"));
siteMenu?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>setMenu(false)));
document.addEventListener("keydown",event=>{if(event.key==="Escape")setMenu(false)});
if(!root)return;
const title=document.querySelector("#forecast-title"),panel=root.querySelector("#panel-forecast");
const grid=root.querySelector("[data-grid]");
const scroll=root.querySelector("[data-scroll]"),chartScroll=root.querySelector("[data-chart-scroll]"),chartInner=root.querySelector("[data-chart-inner]"),chart=root.querySelector("[data-chart]");
const chartEmpty=root.querySelector("[data-chart-empty]"),state=root.querySelector("[data-state]");
const waveLabel=root.querySelector("[data-wave-label]"),notice=document.querySelector("[data-forecast-note]");
const observationBox=root.querySelector("[data-observation]");

let source={};
const tzFmt=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
const getJst=d=>{const p={};for(const x of tzFmt.formatToParts(d))p[x.type]=x.value;return p;};
const dateKey=d=>{const p=getJst(d);return`${p.year}-${p.month}-${p.day}`;};
const pad=v=>String(v).padStart(2,"0");
const numeric=v=>v===null||v===undefined||v===""?NaN:Number(v);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
const cssPx=(name,fallback)=>{const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));return Number.isFinite(v)&&v>0?v:fallback;};
const getColWidth=()=>cssPx("--col",96);
const getLabelWidth=()=>cssPx("--label",96);
let scrollOwner=null,scrollOwnerTimer=0;
function markScrollOwner(el){
  scrollOwner=el;
  clearTimeout(scrollOwnerTimer);
}
function bindScrollSync(from,to){
  if(!from||!to)return;
  ["pointerdown","touchstart","wheel"].forEach(type=>from.addEventListener(type,()=>markScrollOwner(from),{passive:true}));
  from.addEventListener("scroll",()=>{
    if(scrollOwner&&scrollOwner!==from)return;
    markScrollOwner(from);
    if(Math.abs(to.scrollLeft-from.scrollLeft)>.5)to.scrollLeft=from.scrollLeft;
    clearTimeout(scrollOwnerTimer);
    scrollOwnerTimer=setTimeout(()=>{if(scrollOwner===from)scrollOwner=null;},180);
  },{passive:true});
}
bindScrollSync(scroll,chartScroll);bindScrollSync(chartScroll,scroll);
function requestedSpot(){
  const requested=new URLSearchParams(location.search).get("spot");
  return requested&&/^[a-z0-9_-]+$/.test(requested)?requested:(root.dataset.defaultSpot||"kugenuma");
}
async function loadSource(){
  if(window.KANTO_FORECAST_DATA&&typeof window.KANTO_FORECAST_DATA==="object")return window.KANTO_FORECAST_DATA;
  const base=root.dataset.dataBase;
  const url=base?`${base}${requestedSpot()}.json`:root.dataset.src;if(!url)return{};
  try{const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(String(response.status));return await response.json()}
  catch(error){console.warn("Forecast payload unavailable",error);return{}}
}
function hourlySlots(){const supplied=Array.isArray(source.hourly)?source.hourly:[];if(supplied.length)return supplied;
  const now=new Date(),start=Math.floor(now.getHours()/2)*2;return Array.from({length:10},(_,i)=>{const d=new Date(now);d.setHours(start+i*2,0,0,0);return{time:d.toISOString(),placeholder:true}})}
const getSlots=hourlySlots;
function slotDate(slot){
  const raw=slot.time;if(!raw)return null;
  const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
}
function currentIndex(slots){
  if(!slots.length)return-1;const now=Date.now();let best=-1,delta=Infinity;  slots.forEach((s,i)=>{const d=slotDate(s);if(!d)return;const diff=Math.abs(d.getTime()-now);if(diff<delta){delta=diff;best=i}});return best;
}
const fmt=(value,digits=1)=>Number.isFinite(numeric(value))?numeric(value).toFixed(digits):"--";
function fmtTime(slot){
  const d=slotDate(slot);if(!d)return"--";
  const p=getJst(d);
  return `${p.hour}時`;
}
function weather(slot){
  const label=String(slot.weather_label||slot.weather||"--");
  const v=label.toLowerCase();
  let icon="•";
  if(/雷|thunder/.test(v))icon="⛈️";
  else if(/雪|snow|sleet/.test(v))icon="🌨️";
  else if(/霧|fog|mist/.test(v))icon="🌫️";
  else if(/小雨|霧雨|drizzle|light rain/.test(v))icon="🌦️";
  else if(/雨|rain|shower/.test(v))icon="🌧️";
  else if(/曇|くもり|cloud|overcast/.test(v))icon="☁️";
  else if(/晴|clear|sunny/.test(v))icon="☀️";
  return{icon,label};
}
function wave(slot){const v=slot.wave_height_m??slot.model_wave_height_m??slot.wave?.height_m;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"m":""}}
function period(slot){const v=slot.period_s??slot.swell?.period_s;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"秒":""}}
function wind(slot){const v=slot.wind_speed_ms??slot.wind?.speed_ms;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"m/s":"",direction:slot.wind_direction_label??slot.wind?.direction_label??""}}
function addCell(fragment,className,html,current=false,ariaCurrent=false){
  const div=document.createElement("div");div.className=`cell ${className}${current?" current":""}`;div.innerHTML=html;
  if(ariaCurrent)div.setAttribute("aria-current","time");fragment.appendChild(div);
}
function connectionLabel(){
  if(source.status==="model_plus_verified_observation")return"モデル＋検証済み実波";
  if(source.status==="model_only")return"モデル予報";
  return getSlots().some(s=>!s.placeholder)?"公開データ接続":"データ未接続";
}
function renderGrid(){
  const slots=getSlots(),nowIndex=currentIndex(slots);grid.style.setProperty("--columns",slots.length);grid.replaceChildren();
  const waveName=source.wave_metric_label||"モデル波高";
  const rows=[{label:"時刻",unit:"",render:s=>({main:fmtTime(s),sub:""})},{label:"天気",unit:"",render:s=>{const w=weather(s);return{main:w.icon,sub:w.label,weather:true}}},{label:waveName,unit:"m",render:wave},{label:"周期",unit:"秒",render:period},{label:"風",unit:"m/s",render:wind}];
  const fragment=document.createDocumentFragment();  rows.forEach((row,rowIndex)=>{addCell(fragment,"label",`${escapeHtml(row.label)}${row.unit?`<small>${escapeHtml(row.unit)}</small>`:""}`);slots.forEach((slot,index)=>{const value=row.render(slot),direction=value.direction?`<span class="wind-arrow">${escapeHtml(value.direction)}</span>`:"";addCell(fragment,"value",`${direction}<span${value.weather?` class="weather-icon" aria-hidden="true"`:""}>${escapeHtml(value.main)}</span>${value.sub?`<span class="sub${value.weather?" weather-text":""}">${escapeHtml(value.sub)}</span>`:""}`,index===nowIndex,rowIndex===0&&index===nowIndex)})});
  grid.appendChild(fragment);
  requestAnimationFrame(()=>{if(nowIndex>=0){const col=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--col"))||96;scroll.scrollLeft=Math.max(0,(nowIndex-1)*col)}});
  renderChart(slots);state.textContent=connectionLabel();
}
function renderChart(slots){
  const ns="http://www.w3.org/2000/svg";chart.replaceChildren();
  const waves=slots.map(s=>numeric(s.wave_height_m??s.model_wave_height_m??s.wave?.height_m)),winds=slots.map(s=>numeric(s.wind_speed_ms??s.wind?.speed_ms));
  const hasWave=waves.some(Number.isFinite),hasWind=winds.some(Number.isFinite);chartEmpty.hidden=hasWave||hasWind;if(!hasWave&&!hasWind)return;
  const col=getColWidth(),label=getLabelWidth(),slotCount=Math.max(slots.length,1),width=Math.max(label+slotCount*col,(chartScroll?.clientWidth||scroll?.clientWidth||320)),height=240,top=22,bottom=32,usable=height-top-bottom;
  chart.setAttribute("viewBox",`0 0 ${width} ${height}`);chart.setAttribute("width",String(width));chart.setAttribute("height",String(height));if(chartInner)chartInner.style.width=`${width}px`;
  const xAt=i=>label+i*col+col/2,maxWave=Math.max(1,...waves.filter(Number.isFinite)),maxWind=Math.max(6,...winds.filter(Number.isFinite));
  for(let i=0;i<slotCount;i++){const x=xAt(i),guide=document.createElementNS(ns,"line");guide.setAttribute("x1",String(x));guide.setAttribute("x2",String(x));guide.setAttribute("y1",String(top));guide.setAttribute("y2",String(top+usable));guide.setAttribute("stroke","rgba(255,255,255,.08)");guide.setAttribute("stroke-width","1");chart.appendChild(guide)}
  if(hasWind)winds.forEach((v,i)=>{if(!Number.isFinite(v))return;const rect=document.createElementNS(ns,"rect"),barW=Math.min(28,Math.max(10,col*.28)),x=xAt(i)-barW/2,y=top+usable*(1-v/maxWind);rect.setAttribute("x",String(x));rect.setAttribute("y",String(y));rect.setAttribute("width",String(barW));rect.setAttribute("height",String(usable*v/maxWind));rect.setAttribute("rx","2");rect.setAttribute("fill","#2d7281");rect.setAttribute("opacity",".75");chart.appendChild(rect)});
  if(hasWave){const points=waves.map((v,i)=>Number.isFinite(v)?`${xAt(i)},${top+usable*(1-v/maxWave)}`:null).filter(Boolean);if(points.length>1){const poly=document.createElementNS(ns,"polyline");poly.setAttribute("points",points.join(" "));poly.setAttribute("fill","none");poly.setAttribute("stroke","#f45d43");poly.setAttribute("stroke-width","4");poly.setAttribute("vector-effect","non-scaling-stroke");chart.appendChild(poly)}waves.forEach((v,i)=>{if(!Number.isFinite(v))return;const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",String(xAt(i)));dot.setAttribute("cy",String(top+usable*(1-v/maxWave)));dot.setAttribute("r","3.5");dot.setAttribute("fill","#f45d43");chart.appendChild(dot)})}
}
function renderObservation(){
  const list=Array.isArray(source.verified_observations)?[...source.verified_observations].sort((a,b)=>String(b.observed_at||"").localeCompare(String(a.observed_at||""))):[];
  if(!observationBox||!list.length){if(observationBox)observationBox.hidden=true;return}
  const latest=list[0],when=latest.observed_at?new Date(latest.observed_at):null;
  const parts=[latest.wave_size_label||"サイズ記録なし"];
  if(latest.wind_direction_label)parts.push(`風 ${latest.wind_direction_label}${Number.isFinite(numeric(latest.wind_speed_ms))?` ${fmt(latest.wind_speed_ms)}m/s`:""}`);  if(Number.isFinite(numeric(latest.source_count)))parts.push(`独立ソース ${latest.source_count}件`);
  const heading=document.createElement("strong");heading.textContent="検証済み実波";
  const detail=document.createElement("span");detail.textContent=`${when&&!Number.isNaN(when.getTime())?when.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})+" / ":""}${parts.join(" / ")}`;
  observationBox.replaceChildren(heading,detail);observationBox.hidden=false;
}
// 10日間の波・風予報。payload.daily（バックエンド集約済み）を描画するだけで、値の生成・補完はしない。
const dailyRoot=document.querySelector("[data-daily]");
const DAILY_DAYS=10,WEEKDAYS=["日","月","火","水","木","金","土"];
const DIR_LABELS=["北","北東","東","南東","南","南西","西","北西"],DIR_ARROWS=["↑","↗","→","↘","↓","↙","←","↖"];
const finiteOrNull=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
const fixed1=v=>(Math.round(v*10+1e-9)/10).toFixed(1);
function dailyIcon(code){if(code===null)return"—";if(code<=1)return"☀️";if(code===2)return"🌤️";if(code===3)return"☁️";if(code<=48)return"🌫️";if(code<=57)return"🌦️";if(code<=67)return"🌧️";if(code<=77)return"🌨️";if(code<=82)return"🌧️";if(code<=86)return"🌨️";if(code>=95)return"⛈️";return"☁️";}
function dailyTrack(kind,value,max,text){
  if(value===null)return'<div class="daily-track"><span class="daily-val">—</span></div>';
  const pct=max>0?Math.min(100,Math.max(0,100*value/max)):0;
  return`<div class="daily-track"><span class="daily-fill daily-${kind}" style="--daily-fill:${pct.toFixed(1)}%"></span><span class="daily-val">${escapeHtml(text)}</span></div>`;
}
function dailyJudgmentHtml(judgment){
  const status=judgment&&typeof judgment.status==="string"?judgment.status:"pending";
  const label=judgment&&typeof judgment.label==="string"?judgment.label:"検証中";
  const emoji=judgment&&typeof judgment.emoji==="string"?judgment.emoji:"";
  const stars=judgment&&Number.isInteger(judgment.stars)&&judgment.stars>=1&&judgment.stars<=5?judgment.stars:null;
  if(status!=="provisional"||stars===null)return '<span class="daily-judge-label">検証中</span>';
  const starText="★".repeat(stars)+"☆".repeat(5-stars);
  return '<span class="daily-judge-label">'+(emoji?escapeHtml(emoji)+" ":"")+escapeHtml(label)+'</span><span class="daily-stars" aria-label="'+stars+'つ星">'+starText+'</span>';
}
function renderDaily(){
  if(!dailyRoot)return;
  const body=dailyRoot.querySelector("[data-daily-body]"),updated=dailyRoot.querySelector("[data-daily-updated]");
  const daily=source.daily&&typeof source.daily==="object"?source.daily:null;
  const rows=daily&&Array.isArray(daily.rows)?daily.rows.slice(0,DAILY_DAYS):[];
  if(!rows.length){body.innerHTML='<tr><td colspan="6" class="daily-empty">データ取得不可</td></tr>';updated.textContent="データ取得不可";return}
  const today=dateKey(new Date());
  const view=rows.map(r=>({date:String(r.date||""),weekday:Number.isInteger(r.weekday)&&r.weekday>=0&&r.weekday<=6?r.weekday:null,min:finiteOrNull(r.model_wave_height_min_m),max:finiteOrNull(r.model_wave_height_max_m),wind:finiteOrNull(r.wind_speed_mean_ms),label:typeof r.wind_direction_label==="string"?r.wind_direction_label:null,code:Number.isInteger(r.weather_code)?r.weather_code:null,weather:typeof r.weather_label==="string"?r.weather_label:"",judgment:r.judgment&&typeof r.judgment==="object"?r.judgment:{status:"pending",label:"検証中",emoji:null,stars:null}}));
  const maxWave=Math.max(0,...view.map(r=>r.max??0)),maxWind=Math.max(0,...view.map(r=>r.wind??0));
  body.innerHTML=view.map(r=>{
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date),dateText=m?`${parseInt(m[2],10)}/${parseInt(m[3],10)}`:"—";
    const week=r.weekday===null?"":`(${WEEKDAYS[r.weekday]})`,weekCls=r.weekday===6?"daily-sat":r.weekday===0?"daily-sun":"";
    const wave=r.min!==null&&r.max!==null?`${fixed1(r.min)}-${fixed1(r.max)}m`:"—";
    const wind=r.wind!==null?`${fixed1(r.wind)}m/s`:"—",sector=r.label===null?-1:DIR_LABELS.indexOf(r.label);
    const dir=sector<0?"—":`<span class="daily-arrow" aria-hidden="true">${DIR_ARROWS[sector]}</span>${escapeHtml(r.label)}`;
    const isToday=r.date===today;
    return`<tr${isToday?' class="is-today" aria-current="date"':""}><td class="daily-date">${dateText} <span class="${weekCls}">${week}</span></td>`+
      `<td class="daily-weather"${r.weather?` title="${escapeHtml(r.weather)}" aria-label="${escapeHtml(r.weather)}"`:' aria-label="天気データなし"'}>${dailyIcon(r.code)}</td>`+
      `<td>${dailyTrack("wave",r.max===null||r.min===null?null:r.max,maxWave,wave)}</td>`+
      `<td>${dailyTrack("wind",r.wind,maxWind,wind)}</td>`+
      `<td><span class="daily-dir">${dir}</span></td>`+
      `<td><span class="daily-judgment">${dailyJudgmentHtml(r.judgment)}</span></td></tr>`;
  }).join("");
  const stamp=daily.source_generated_at?new Date(daily.source_generated_at):null;
  const stale=!view.some(r=>r.date===today);
  updated.textContent=(stamp&&!Number.isNaN(stamp.getTime())?`更新：${stamp.toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})} JST`:"更新時刻不明")+(stale?"（データ更新が遅れています。今日の行が含まれていません）":"");
  updated.classList.toggle("is-stale",stale);
  if(source.spot?.name){const spotLabel=dailyRoot.querySelector("[data-daily-spot]");if(spotLabel)spotLabel.textContent=source.spot.name;dailyRoot.querySelector("table")?.setAttribute("aria-label",`${source.spot.name} 10日間の波と風の予報`)}
}
function selectMode(){title.textContent="時間別予報";renderGrid()}
panel.setAttribute("aria-busy","true");
selectMode();
state.textContent="読み込み中";
loadSource().then(data=>{
  source=data&&typeof data==="object"?data:{};
  if(waveLabel)waveLabel.textContent=`${source.wave_metric_label||"モデル波高"}(m)`;
  if(notice&&source.model_notice)notice.textContent=source.model_notice;
  renderObservation();
  const spotName=document.querySelector("[data-spot-name]");if(spotName&&source.spot?.name)spotName.textContent=source.spot.name;
  document.querySelectorAll("[data-spot-link]").forEach(link=>link.toggleAttribute("aria-current",link.dataset.spotLink===source.spot?.id));
  panel.setAttribute("aria-busy","false");
  selectMode();renderDaily();
});
})();
