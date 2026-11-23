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
    assert(rows.every(r=>!Object.hasOwn(r,"precipitation_2h_mm")),"stale two-hour precipitation key");
    for(const row of rows)assert(row.precipitation_1h_mm===null||row.precipitation_1h_mm>=0,"negative precipitation");
  }else{
    assert(rows.every(r=>!Object.hasOwn(r,"precipitation_1h_mm")),id+" unexpectedly changed");
  }
  console.log("PASS",id,rows.length,"slots",step+"h");
}
