(()=>{"use strict";
const root=document.querySelector("[data-forecast]");if(!root)return;
const title=document.querySelector("#forecast-title"),panel=root.querySelector("#panel-forecast");
const grid=root.querySelector("[data-grid]");
const scroll=root.querySelector("[data-scroll]"),chartScroll=root.querySelector("[data-chart-scroll]"),chartInner=root.querySelector("[data-chart-inner]"),chart=root.querySelector("[data-chart]");
const chartEmpty=root.querySelector("[data-chart-empty]"),state=root.querySelector("[data-state]");
const compactTest=root.dataset.compactTest==="1";
let compactDay=0,compactSelected=null;
const waveLabel=root.querySelector("[data-wave-label]"),notice=document.querySelector("[data-forecast-note]");
const observationBox=root.querySelector("[data-observation]");

let source={};
const tzFmt=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
const getJst=d=>{const p={};for(const x of tzFmt.formatToParts(d))p[x.type]=x.value;return p;};
const dateKey=d=>{const p=getJst(d);return`${p.year}-${p.month}-${p.day}`;};
const pad=v=>String(v).padStart(2,"0");
const numeric=v=>v===null||v===undefined||v===""?NaN:Number(v);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
const cssPx=(name,fallback)=>{const v=parseFloat(getComputedStyle(root).getPropertyValue(name));return Number.isFinite(v)&&v>0?v:fallback;};
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

// 鵠沼限定の時間別UI試験。元データのない時刻は生成しない。
function compactSlots(){
  const target=dateKey(new Date(Date.now()+compactDay*86400000));
  return getSlots().filter(s=>{const d=slotDate(s);return d&&dateKey(d)===target&&!s.placeholder;});
}
const compass16=["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
function compactArrow(dir){
  const i=compass16.indexOf(String(dir||""));
  if(i<0)return'<span class="compact-missing">—</span>';
  return '<span class="compact-arrow" style="transform:rotate('+((i*22.5)-180)+'deg)" aria-hidden="true">↑</span><small class="compact-direction">'+escapeHtml(dir)+'</small>';
}
function compactWeather(slot){
  const w=weather(slot),d=slotDate(slot),hour=d?Number(getJst(d).hour):12;
  return w.icon==="☀️"&&(hour>=18||hour<6)?"🌙":w.icon;
}
function renderCompactGrid(){
  const slots=compactSlots(),first=compactSelected===null;
  const selected=slots.length?(first?(compactDay===0?Math.max(0,currentIndex(slots)):0):Math.min(Math.max(0,compactSelected),slots.length-1)):-1;
  const prevLeft=scroll.scrollLeft,prevChart=chartScroll.scrollLeft;
  grid.style.setProperty("--columns",slots.length||1);grid.replaceChildren();
  root.querySelectorAll("[data-compact-day]").forEach(b=>{
    const active=Number(b.dataset.compactDay)===compactDay;
    b.classList.toggle("is-active",active);b.setAttribute("aria-pressed",String(active));
  });
  if(!slots.length){
    grid.innerHTML='<div class="compact-no-data">この日の時間別予報は未取得です</div>';
    chart.replaceChildren();chartEmpty.hidden=false;chartEmpty.textContent="この日のデータはありません";
    if(chartInner)chartInner.style.width="100%";
    state.textContent=connectionLabel();renderCompactExtras([],selected);return;
  }
  const rows=[
    {label:"時刻",unit:"",html:s=>escapeHtml(fmtTime(s))},
    {label:"波高",unit:"m",html:s=>escapeHtml(wave(s).main)},
    {label:"周期",unit:"秒",html:s=>escapeHtml(period(s).main)},
    {label:"風速",unit:"m/s",html:s=>escapeHtml(wind(s).main)},
    {label:"風向",unit:"",html:s=>compactArrow(s.wind_direction_label??s.wind?.direction_label)},
    {label:"気温",unit:"℃",html:s=>escapeHtml(fmt(s.temperature_c,1))}
  ];
  const frag=document.createDocumentFragment();
  rows.forEach((row,ri)=>{
    addCell(frag,"label",escapeHtml(row.label)+(row.unit?'<small>'+escapeHtml(row.unit)+'</small>':""));
    slots.forEach((slot,i)=>{
      const div=document.createElement("div");
      div.className="cell value compact-value"+(selected===i?" current":"");
      div.dataset.compactIndex=String(i);div.innerHTML=row.html(slot);
      if(ri===0&&selected===i)div.setAttribute("aria-current","time");frag.appendChild(div);
    });
  });
  grid.appendChild(frag);
  renderCompactChart(slots,selected);renderCompactExtras(slots,selected);state.textContent=connectionLabel();
  requestAnimationFrame(()=>{
    if(first&&compactDay===0){
      scroll.scrollLeft=Math.max(0,(selected-2)*getColWidth());chartScroll.scrollLeft=scroll.scrollLeft;
    }else{scroll.scrollLeft=prevLeft;chartScroll.scrollLeft=prevChart;}
  });
}
function renderCompactChart(slots,selected){
  const ns="http://www.w3.org/2000/svg";chart.replaceChildren();
  const waves=slots.map(s=>numeric(s.wave_height_m??s.model_wave_height_m??s.wave?.height_m));
  const winds=slots.map(s=>numeric(s.wind_speed_ms??s.wind?.speed_ms));
  const hasWave=waves.some(Number.isFinite),hasWind=winds.some(Number.isFinite);
  chartEmpty.hidden=hasWave||hasWind;if(!hasWave&&!hasWind)return;
  const col=getColWidth(),label=getLabelWidth(),width=Math.max(label+slots.length*col,(chartScroll?.clientWidth||320)),height=190,top=42,bottom=184,usable=bottom-top;
  chart.setAttribute("viewBox","0 0 "+width+" "+height);
  chart.setAttribute("width",String(width));chart.setAttribute("height",String(height));
  if(chartInner)chartInner.style.width=width+"px";
  const x=i=>label+i*col+col/2;
  const add=(tag,attrs,content)=>{
    const el=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
    if(content!==undefined)el.textContent=content;chart.appendChild(el);return el;
  };
  if(selected>=0){
    add("rect",{x:label+selected*col,y:0,width:col,height:height,fill:"#f45d43",opacity:".12"});
    add("line",{x1:x(selected),x2:x(selected),y1:35,y2:bottom,stroke:"#f4efe6","stroke-dasharray":"3 6",opacity:".7"});
  }
  for(let i=0;i<slots.length;i++){
    add("line",{x1:x(i),x2:x(i),y1:top,y2:bottom,stroke:"#8fb5c4",opacity:".14"});
    add("text",{x:x(i),y:24,"text-anchor":"middle","font-size":16},compactWeather(slots[i]));
  }
  for(let j=1;j<=3;j++)add("line",{x1:label,x2:width,y1:top+usable*j/4,y2:top+usable*j/4,stroke:"#8fb5c4",opacity:".16","stroke-dasharray":"3 5"});
  const maxWave=Math.max(.5,...waves.filter(Number.isFinite)),maxWind=Math.max(6,...winds.filter(Number.isFinite));
  waves.forEach((v,i)=>{
    if(!Number.isFinite(v))return;const barW=Math.min(col-6,29);
    const h=Math.max(v===0?0:2,Math.max(0,v)*usable/maxWave);
    add("rect",{x:x(i)-barW/2,y:bottom-h,width:barW,height:h,rx:2,fill:i===selected?"#22bddd":"#0b8ca3",opacity:".92"});
  });
  let run=[];
  const flush=()=>{if(run.length>1)add("polyline",{points:run.join(" "),fill:"none",stroke:"#f67a3a","stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round"});run=[];};
  winds.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return;}run.push(x(i)+","+(bottom-usable*v/maxWind));});flush();
  if(selected>=0&&Number.isFinite(winds[selected])){
    const y=bottom-usable*winds[selected]/maxWind;
    add("circle",{cx:x(selected),cy:y,r:4.5,fill:"#f67a3a",stroke:"#fff","stroke-width":1.5});
    add("text",{x:x(selected),y:Math.max(38,y-10),"text-anchor":"middle","font-size":11,"font-weight":"bold",fill:"#fcebcf"},fmt(winds[selected])+"m/s");
  }
}

function compactSvgAdd(svg,tag,attributes,content){
  const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
  Object.entries(attributes).forEach(([key,value])=>el.setAttribute(key,String(value)));
  if(content!==undefined)el.textContent=content;
  svg.appendChild(el);
  return el;
}
function renderCompactExtras(slots,selected){
  const rainSvg=root.querySelector("[data-rain-chart]"),tideSvg=root.querySelector("[data-tide-chart]");
  const rainInfo=root.querySelector("[data-rain-info]"),tideInfo=root.querySelector("[data-tide-info]");
  const rainInner=root.querySelector("[data-rain-inner]");
  if(!rainSvg||!tideSvg)return;
  rainSvg.replaceChildren();tideSvg.replaceChildren();
  const label=getLabelWidth(),col=getColWidth(),width=Math.max(label+col*slots.length,root.clientWidth||320);
  if(rainInner)rainInner.style.width=width+"px";
  rainSvg.setAttribute("viewBox","0 0 "+width+" 120");
  rainSvg.setAttribute("width",String(width));rainSvg.setAttribute("height","120");
  const values=slots.map(s=>numeric(s.precipitation_2h_mm));
  const finite=values.filter(Number.isFinite),max=Math.max(1,...finite);
  if(!finite.length){
    rainInfo.textContent="降水量データは未取得です（推測値は表示しません）";
  }else{
    const total=finite.reduce((a,b)=>a+b,0);
    rainInfo.textContent="直前2時間の合計（mm）／表示時間帯の雨量合計 "+total.toFixed(1)+"mm";
    for(let g=0;g<3;g++){
      const y=16+g*31;
      compactSvgAdd(rainSvg,"line",{x1:label,x2:width,y1:y,y2:y,stroke:"#8fb5c4","stroke-dasharray":"3 5",opacity:".19"});
    }
    values.forEach((v,i)=>{
      const x=label+col*i+col/2;
      if(selected===i)compactSvgAdd(rainSvg,"rect",{x:label+i*col,y:0,width:col,height:120,fill:"#f45d43",opacity:".10"});
      if(!Number.isFinite(v))return;
      const h=76*v/max;
      compactSvgAdd(rainSvg,"rect",{x:x-Math.min(24,col-8)/2,y:94-h,width:Math.min(24,col-8),height:h,rx:2,fill:"#58b7e4"});
      if(v>0)compactSvgAdd(rainSvg,"text",{x,y:Math.max(12,87-h),"text-anchor":"middle","font-size":"9",fill:"#e4f8ff"},v.toFixed(1));
    });
  }
  for(let i=0;i<slots.length;i++){
    compactSvgAdd(rainSvg,"text",{x:label+i*col+col/2,y:113,"text-anchor":"middle","font-size":"9",fill:"#a9c6d2"},fmtTime(slots[i]));
  }
  const target=dateKey(new Date(Date.now()+compactDay*86400000));
  const tide=Array.isArray(source.tide?.days)?source.tide.days.find(r=>r.date===target):null;
  tideSvg.setAttribute("viewBox","0 0 370 146");
  tideSvg.setAttribute("width","100%");tideSvg.setAttribute("height","146");
  if(!tide||!Array.isArray(tide.hourly_cm)||tide.hourly_cm.length!==24){
    tideInfo.textContent="湘南港の天文潮位データは未取得です";
    compactSvgAdd(tideSvg,"text",{x:185,y:74,"text-anchor":"middle","font-size":"13",fill:"#8fb5c4"},"潮位データなし");
    return;
  }
  const levels=tide.hourly_cm.map(numeric);
  if(!levels.every(Number.isFinite)){tideInfo.textContent="潮位データに欠損があります";return;}
  const highs=Array.isArray(tide.high)?tide.high:[],lows=Array.isArray(tide.low)?tide.low:[];
  const formatEvent=(ev,mark)=>ev.map(e=>mark+e.time+" "+e.height_cm+"cm").join("　");
  tideInfo.textContent="満潮 "+(formatEvent(highs,"▲")||"—")+"　干潮 "+(formatEvent(lows,"▼")||"—");
  const all=[...levels,...highs.map(e=>e.height_cm),...lows.map(e=>e.height_cm)];
  const min=Math.min(...all)-8,maxLevel=Math.max(...all)+8,span=Math.max(1,maxLevel-min);
  const x=h=>31+(h/23)*326;
  const y=v=>119-(v-min)/span*92;
  for(let line=0;line<3;line++){
    const val=min+span*(line/2);
    const yy=y(val);
    compactSvgAdd(tideSvg,"line",{x1:31,x2:357,y1:yy,y2:yy,stroke:"#8fb5c4",opacity:".22","stroke-dasharray":"3 5"});
    compactSvgAdd(tideSvg,"text",{x:27,y:yy+3,"text-anchor":"end","font-size":"9",fill:"#9bbcc9"},Math.round(val));
  }
  for(let hour=0;hour<24;hour+=4)compactSvgAdd(tideSvg,"text",{x:x(hour),y:138,"text-anchor":"middle","font-size":"10",fill:"#afc9d0"},hour+"時");
  compactSvgAdd(tideSvg,"polyline",{points:levels.map((v,i)=>x(i)+","+y(v)).join(" "),fill:"none",stroke:"#4fc4dc","stroke-width":2.5,"stroke-linejoin":"round","stroke-linecap":"round"});
  for(const [type,events] of [["high",highs],["low",lows]]){
    for(const e of events){
      const h=Number(e.time.split(":")[0])+Number(e.time.split(":")[1])/60;
      if(!Number.isFinite(h)||h<0||h>23.99||!Number.isFinite(numeric(e.height_cm)))continue;
      compactSvgAdd(tideSvg,"circle",{cx:x(h),cy:y(e.height_cm),r:4,stroke:"#082331","stroke-width":1.5,fill:type==="high"?"#f8a65c":"#f5e0a5"});
    }
  }
}

if(compactTest){
  const rainScroll=root.querySelector('[data-rain-scroll]');
  if(rainScroll){bindScrollSync(scroll,rainScroll);bindScrollSync(chartScroll,rainScroll);bindScrollSync(rainScroll,scroll);bindScrollSync(rainScroll,chartScroll);}
  root.querySelectorAll("[data-compact-day]").forEach(b=>b.addEventListener("click",()=>{
    compactDay=Number(b.dataset.compactDay);compactSelected=null;
    scroll.scrollLeft=0;chartScroll.scrollLeft=0;renderGrid();
  }));
  grid.addEventListener("click",event=>{
    const cell=event.target.closest("[data-compact-index]");if(!cell)return;
    compactSelected=Number(cell.dataset.compactIndex);renderGrid();
  });
  chart.addEventListener("click",event=>{
    const left=event.clientX-chart.getBoundingClientRect().left;
    const index=Math.floor((left-getLabelWidth())/getColWidth());
    if(index>=0&&index<compactSlots().length){compactSelected=index;renderGrid();}
  });
}

function renderGrid(){
  if(compactTest){renderCompactGrid();return;}
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
  panel.setAttribute("aria-busy","false");
  selectMode();renderDaily();
});
})();