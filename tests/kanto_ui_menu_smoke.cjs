const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const dir=process.argv[2]||path.resolve(__dirname,"../build/preview-site");
const spots=["kugenuma","yuigahama","oarai-onuki","kashima-hirai","katakai","ichinomiya","taito","onjuku","kamogawa-maruki"];
const pages=["index.html",...spots.map(s=>"spots/"+s+"/index.html"),"about/index.html","contact/index.html","privacy/index.html"];
for(const page of pages){
 const html=fs.readFileSync(path.join(dir,page),"utf8");
 const menu=html.split('class="menu-spot-group"')[1]?.split("</div>")[0];
 const footer=html.split('class="footer-spot-grid"')[1]?.split("</div>")[0];
 assert(menu&&footer,"Missing nine-spot menu/footer: "+page);
 assert(html.includes('class="menu-button"'),"Missing menu button: "+page);
 assert(html.includes('aria-controls="site-menu"'),"Missing menu a11y: "+page);
 assert(html.includes('id="site-menu"')&&html.includes('aria-label="サイトメニュー" hidden'),"Menu not initially hidden: "+page);
 assert.equal((menu.match(/<a /g)||[]).length,9,"Nine menu spots: "+page);
 assert.equal((footer.match(/<a /g)||[]).length,9,"Nine footer spots: "+page);
 const prefix=page==="index.html"?"":page.startsWith("spots/")?"../../":"../";
 for(const slug of spots){
  const href='href="'+prefix+"spots/"+slug+'/"';
  assert(menu.includes(href),"Menu href invalid: "+page+" "+slug);
  assert(footer.includes(href),"Footer href invalid: "+page+" "+slug);
 }
 if(page.startsWith("spots/")||page==="index.html"){
  assert(html.includes('<h2 id="forecast-title">波・風</h2>'),"Section title wrong: "+page);
  assert(!html.includes('<h2 id="forecast-title">時間別予報</h2>'),"Old title: "+page);
 }
 if(page==="spots/kugenuma/index.html"){
  assert(html.includes('class="compact-tide-rain-header"'),"Missing combined header");
  const header=html.split('class="compact-tide-rain-header"')[1]?.split("</div>")[0]||"";
  assert(header.includes("data-rain-info")&&header.includes("潮位")&&header.includes("降水量"),"Tide and rain total not in same header");
 }else assert(!html.includes('class="compact-tide-rain-header"'),"Kugenuma-specific UI leaked: "+page);
}
const app=fs.readFileSync(path.join(dir,"app.js"),"utf8");
const css=fs.readFileSync(path.join(dir,"styles.css"),"utf8");
assert(app.includes('menuButton?.addEventListener("click"'),"Menu toggle absent");
assert(app.includes('title.textContent="波・風"'),"Dynamic title would revert to old label");
assert(app.indexOf('menuButton?.addEventListener')<app.indexOf("if(!root)return"),"Menu must work on info pages");
assert(css.includes(".compact-tide-rain-header")&&css.includes("font-size:13px"),"UI styles missing");
console.log("PASS 13 pages: nine menu spots, nine footer spots, menu toggle, title, compact tide heading");
