'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const net=require('node:net');
const assert=require('node:assert/strict');

const base=path.resolve(__dirname,'../backend/contact');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kanto-contact-backend-'));
for(const name of ['common.php','challenge.php','send.php']){
  let src=fs.readFileSync(path.join(base,name),'utf8');
  src=src.replaceAll('__KS_CONTACT_TO__','test-inbox@rss7.net')
         .replaceAll('__KS_CONTACT_FROM__','test-sender@rss7.net');
  fs.writeFileSync(path.join(temp,name),src);
}

async function availablePort(){
  const socket=net.createServer();
  await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server;
async function main(){
  const port=await availablePort();
  const url='http://127.0.0.1:'+port;
  server=spawn('php',['-S','127.0.0.1:'+port,'-t',temp],{
    env:{...process.env,KS_CONTACT_TEST_MODE:'1'},stdio:['ignore','pipe','pipe']
  });
  let stderr='';
  server.stderr.on('data',c=>{stderr+=c.toString();});
  let alive=false;
  for(let i=0;i<40;i++){
    if(server.exitCode!==null)break;
    try{const x=await fetch(url+'/challenge.php');if(x.ok){alive=true;break;}}catch{}
    await sleep(100);
  }
  assert(alive,'Local PHP test server unavailable '+stderr.slice(0,1200));
  assert.equal((await fetch(url+'/send.php')).status,405,'POST only');
  assert.equal((await fetch(url+'/common.php')).status,404,'common.php closed');

  async function challenge(cookie){
    const headers=cookie?{Cookie:cookie}:{};
    const r=await fetch(url+'/challenge.php',{headers});
    assert.equal(r.status,200);
    const j=await r.json();
    assert(j.success&&/^\d+ \+ \d+ = \?$/.test(j.question)&&j.token.length===48);
    return {token:j.token,answer:j.question.match(/\d+/g).map(Number).reduce((a,b)=>a+b,0),
      cookie:cookie||r.headers.get('set-cookie')?.split(';')[0]};
  }
  const details={
    purpose:'opinion',
    name:'Test Contact',
    email:'test-sender@example.net',
    phone:'',
    message:'Automated local validation only. No real email sent.',
    website:'',
  };
  async function send(ch,changes={},origin=url){
    const r=await fetch(url+'/send.php',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Cookie:ch.cookie},
      body:new URLSearchParams({...details,token:ch.token,captcha:String(ch.answer),...changes}),
    });
    return {status:r.status,body:await r.json()};
  }
  let ch=await challenge();
  let x=await send(ch,{captcha:'999'});
  assert.equal(x.status,422,'Wrong answer rejected');
  x=await send(ch);
  assert.equal(x.status,422,'Token cannot be replayed');
  ch=await challenge(ch.cookie);
  x=await send(ch,{},'https://attacker.example.com');
  assert.equal(x.status,403,'Cross-origin rejected');
  ch=await challenge(ch.cookie);
  await sleep(2150);
  x=await send(ch,{website:'spam-site'});
  assert.equal(x.status,422,'Honeypot rejected');
  ch=await challenge(ch.cookie);
  await sleep(2150);
  x=await send(ch);
  assert.equal(x.status,200,'Validated form should be accepted in test mode');
  assert.equal(x.body.success,true);
  x=await send(ch);
  assert.equal(x.status,422,'Successful token cannot be replayed');
  console.log('PASS Kanto contact backend: session CAPTCHA, expiry/replay guard, origin, honeypot and full submit (mail stub, no mail sent)');
}
main().catch(e=>{console.error(e);process.exitCode=1;})
  .finally(()=>{if(server)server.kill();fs.rmSync(temp,{recursive:true,force:true});});
