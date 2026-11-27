/* This helper does not send data to a server or store it in cookies/local storage. */
(()=>{
  'use strict';
  const form=document.getElementById('ks-inquiry-form');
  if(!form)return;
  const status=document.getElementById('ks-inquiry-status');
  const fallback=document.querySelector('.ks-copy-fallback');
  const output=document.getElementById('ks-inquiry-output');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const kind=document.getElementById('ks-inquiry-kind').value.trim();
    const name=document.getElementById('ks-inquiry-name').value.trim();
    const reply=document.getElementById('ks-inquiry-reply').value.trim();
    const message=document.getElementById('ks-inquiry-message').value.trim();
    if(!kind||!message){status.textContent='種別とお問い合わせ内容を入力してください。';return;}
    const lines=['【関東サーファーKS お問い合わせ】','種別：'+kind];
    if(name)lines.push('お名前・呼び名：'+name);
    lines.push('返信の希望：'+reply,'','内容：',message,'','（関東サーファーKSお問い合わせページから作成）');
    const text=lines.join('\n');
    fallback.hidden=true;
    output.value='';
    status.textContent='';
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard API not available');
      await navigator.clipboard.writeText(text);
      status.textContent='文章をコピーしました。上のInstagramまたはFacebookを開き、メッセージ欄に貼り付けて送信してください。この操作だけでは送信されません。';
    }catch(error){
      output.value=text;
      fallback.hidden=false;
      output.focus();
      output.select();
      status.textContent='自動コピーを利用できない環境です。下の文章を選択してコピーし、公式SNSから送信してください。';
    }
  });
})();
