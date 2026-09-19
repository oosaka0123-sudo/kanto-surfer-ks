(()=>{"use strict";
const root=document.querySelector("[data-forecast]");if(!root)return;
const title=document.querySelector("#forecast-title"),panel=root.querySelector("#panel-forecast");
const tabs=[...root.querySelectorAll("[role=tab]")],grid=root.querySelector("[data-grid]");
const scroll=root.querySelector("[data-scroll]"),chartScroll=root.querySelector("[data-chart-scroll]"),chartInner=root.querySelector("[data-chart-inner]"),chart=root.querySelector("[data-chart]");
const chartEmpty=root.querySelector("[data-chart-empty]"),state=root.querySelector("[data-state]");
const waveLabel=root.querySelector("[data-wave-label]"),notice=document.querySelector("[data-forecast-note]");
const observationBox=root.querySelector("[data-observation]");
const menuButton=document.querySelector(".menu-button"),siteMenu=document.querySelector("#site-menu");
function setMenu(open){if(!menuButton||!siteMenu)return;menuButton.setAttribute("aria-expanded",String(open));siteMenu.hidden=!open;document.body.classList.toggle("menu-open",open)}
menuButton?.addEventListener("click",()=>setMenu(menuButton.getAttribute("aria-expanded")!=="true"));
siteMenu?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>setMenu(false)));
document.addEventListener("keydown",event=>{if(event.key==="Escape")setMenu(false)});
let source={},mode="hourly";
const tzFmt=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
const getJst=d=>{const p={};for(const x of tzFmt.formatToParts(d))p[x.type]=x.value;return p;};
const dateKey=d=>{const p=getJst(d);return`${p.year}-${p.month}-${p.day}`;};
const pad=v=>String(v).padStart(2,"0");
const numeric=v=>v===null||v===undefined||v===""?NaN:Number(v);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
const cssPx=(name,fallback)=>{const v=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));return Number.isFinite(v)&&v>0?v:fallback;};
const getColWidth=()=>cssPx("--col",96);
const getLabelWidth=()=>cssPx("--label",96);
let syncingScroll=false;
function bindScrollSync(from,to){if(!from||!to)return;from.addEventListener("scroll",()=>{if(syncingScroll)return;syncingScroll=true;to.scrollLeft=from.scrollLeft;requestAnimationFrame(()=>{syncingScroll=false;});},{passive:true});}
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
function weeklySlots(){const supplied=Array.isArray(source.weekly)?source.weekly:[];if(supplied.length)return supplied;
  const today=Date.now();return Array.from({length:8},(_,i)=>({date:dateKey(new Date(today+i*86400000)),placeholder:true}))}
const getSlots=()=>mode==="hourly"?hourlySlots():weeklySlots();
function slotDate(slot){
  let raw=mode==="hourly"?slot.time:slot.date;if(!raw)return null;
  if(mode==="weekly"&&raw.length===10)raw+="T00:00:00+09:00";
  const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
}
function currentIndex(slots){
  if(mode==="weekly"){const today=dateKey(new Date());return slots.findIndex(s=>(s.date||"").slice(0,10)===today)}
  if(!slots.length)return-1;const now=Date.now();let best=-1,delta=Infinity;  slots.forEach((s,i)=>{const d=slotDate(s);if(!d)return;const diff=Math.abs(d.getTime()-now);if(diff<delta){delta=diff;best=i}});return best;
}
const fmt=(value,digits=1)=>Number.isFinite(numeric(value))?numeric(value).toFixed(digits):"--";
function fmtTime(slot){
  const d=slotDate(slot);if(!d)return"--";
  const p=getJst(d);
  return mode==="hourly"?`${p.hour}時`:`${parseInt(p.month,10)}/${parseInt(p.day,10)}`;
}
function weather(slot){return slot.weather_label||slot.weather||"--"}
function wave(slot){const v=slot.wave_height_m??slot.model_wave_height_m??slot.wave?.height_m;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"m":""}}
function period(slot){const v=slot.period_s??slot.swell?.period_s;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"秒":""}}
function wind(slot){const v=slot.wind_speed_ms??slot.wind?.speed_ms;return{main:fmt(v),sub:Number.isFinite(numeric(v))?"m/s":"",direction:slot.wind_direction_label??slot.wind?.direction_label??""}}
function addCell(fragment,className,html,current=false,ariaCurrent=false){
  const div=document.createElement("div");div.className=`cell ${className}${current?" current":""}`;div.innerHTML=html;
  if(ariaCurrent)div.setAttribute("aria-current",mode==="hourly"?"time":"date");fragment.appendChild(div);
}
function connectionLabel(){
  if(source.status==="model_plus_verified_observation")return"モデル＋検証済み実波";
  if(source.status==="model_only")return"モデル予報";
  return getSlots().some(s=>!s.placeholder)?"公開データ接続":"データ未接続";
}
function renderGrid(){
  const slots=getSlots(),nowIndex=currentIndex(slots);grid.style.setProperty("--columns",slots.length);grid.replaceChildren();
  const waveName=source.wave_metric_label||"モデル波高";
  const rows=[{label:mode==="hourly"?"時刻":"日付",unit:"",render:s=>({main:fmtTime(s),sub:""})},{label:"天気",unit:"",render:s=>({main:weather(s),sub:""})},{label:waveName,unit:"m",render:wave},{label:"周期",unit:"秒",render:period},{label:"風",unit:"m/s",render:wind}];
  const fragment=document.createDocumentFragment();  rows.forEach((row,rowIndex)=>{addCell(fragment,"label",`${escapeHtml(row.label)}${row.unit?`<small>${escapeHtml(row.unit)}</small>`:""}`);slots.forEach((slot,index)=>{const value=row.render(slot),direction=value.direction?`<span class="wind-arrow">${escapeHtml(value.direction)}</span>`:"";addCell(fragment,"value",`${direction}<span>${escapeHtml(value.main)}</span>${value.sub?`<span class="sub">${escapeHtml(value.sub)}</span>`:""}`,index===nowIndex,rowIndex===0&&index===nowIndex)})});
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
function selectMode(next,focus=false){
  mode=next;tabs.forEach(tab=>{const selected=tab.dataset.mode===mode;tab.classList.toggle("is-active",selected);tab.setAttribute("aria-selected",String(selected));tab.tabIndex=selected?0:-1;if(selected)panel.setAttribute("aria-labelledby",tab.id)});
  title.textContent=mode==="hourly"?"時間別予報":"週間予報";renderGrid();if(focus)tabs.find(tab=>tab.dataset.mode===mode)?.focus();
}
tabs.forEach(tab=>{tab.addEventListener("click",()=>selectMode(tab.dataset.mode));tab.addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight"].includes(event.key))return;event.preventDefault();selectMode(event.key==="ArrowRight"?"weekly":"hourly",true)})});
panel.setAttribute("aria-busy","true");
selectMode("hourly");
state.textContent="読み込み中";
loadSource().then(data=>{
  source=data&&typeof data==="object"?data:{};
  if(waveLabel)waveLabel.textContent=`${source.wave_metric_label||"モデル波高"}(m)`;
  if(notice&&source.model_notice)notice.textContent=source.model_notice;
  renderObservation();
  const spotName=document.querySelector("[data-spot-name]");if(spotName&&source.spot?.name)spotName.textContent=source.spot.name;
  document.querySelectorAll("[data-spot-link]").forEach(link=>link.toggleAttribute("aria-current",link.dataset.spotLink===source.spot?.id));
  panel.setAttribute("aria-busy","false");
  selectMode("hourly");
});
})();
