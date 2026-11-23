const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const dir=process.argv[2]||path.resolve(__dirname,"../build/pages/data");
const get=id=>JSON.parse(fs.readFileSync(path.join(dir,id+".json"),"utf8"));
const all=["kugenuma","yuigahama","oarai_onuki","kashima_hirai","katakai","ichinomiya","taito","onjuku","kamogawa_maruki"];
for(const id of all){
  const j=get(id),rows=j.hourly;
  assert(rows.length>=10,id+": too few hours");
  const step=id==="kugenuma"?1:2;
  for(let i=1;i<rows.length;i++){
    assert.equal((Date.parse(rows[i].time)-Date.parse(rows[i-1].time))/3600000,step,id+" hourly gap at "+i);
  }
  if(id==="kugenuma"){
    assert.equal(j.tide.station_id,"D8");
    assert(rows.some(r=>r.precipitation_1h_mm!==null&&Number.isFinite(r.precipitation_1h_mm)),"no hourly precipitation");
    assert(rows.every(r=>Object.hasOwn(r,"precipitation_1h_mm")),"missing hourly precipitation key");
    assert(rows.every(r=>Object.hasOwn(r,"precipitation_probability_pct")),"missing hourly precipitation probability key");
    for(const r of rows)assert(r.precipitation_probability_pct===null||(Number.isFinite(r.precipitation_probability_pct)&&r.precipitation_probability_pct>=0&&r.precipitation_probability_pct<=100),"invalid rainfall probability");
    assert(rows.every(r=>!Object.hasOwn(r,"precipitation_2h_mm")),"stale two-hour precipitation key");
    for(const row of rows)assert(row.precipitation_1h_mm===null||row.precipitation_1h_mm>=0,"negative precipitation");
    // Future day and day after tomorrow must each cover 04:00-20:00 JST.
    const jst = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
    const localParts=d=>Object.fromEntries(jst.formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    const dayKey=d=>{const x=localParts(d);return [x.year,x.month,x.day].join("-");};
    for(const offset of [1,2]){
      const target=dayKey(new Date(Date.now()+offset*86400000));
      const chosen=rows.filter(r=>dayKey(new Date(r.time))===target)
        .map(r=>Number(localParts(new Date(r.time)).hour)).filter(h=>h>=4&&h<=20);
      assert.deepEqual(chosen,Array.from({length:17},(_,i)=>i+4),
        "Kugenuma requires full 04:00-20:00 for "+target);
    }
  }else{
    assert(rows.every(r=>!Object.hasOwn(r,"precipitation_1h_mm")),id+" unexpectedly changed");
  }
  console.log("PASS",id,rows.length,"slots",step+"h");
}
