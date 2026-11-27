/* Kansai-style real contact form. HTTPS same-origin only; no public API keys. */
(()=>{
  'use strict';
  const form=document.getElementById('ks-inquiry-form');
  if(!form)return;
  const submit=document.getElementById('ks-inquiry-submit');
  const status=document.getElementById('ks-inquiry-status');
  const success=document.getElementById('ks-contact-success');
  const error=document.getElementById('ks-contact-error');
  const errorDetail=document.getElementById('ks-contact-error-detail');
  const question=document.getElementById('ks-contact-question');
  const token=document.getElementById('ks-contact-token');
  const answer=document.getElementById('ks-contact-captcha-input');
  const retry=document.getElementById('ks-contact-retry');
  let pending=false;
  let ready=false;

  function showError(message){
    success.hidden=true;
    error.hidden=false;
    errorDetail.textContent=message;
    status.textContent='送信していません。';
  }
  function showSuccess(message){
    error.hidden=true;
    success.hidden=false;
    success.querySelector('p').textContent=message;
    status.textContent='送信処理を受け付けました。';
  }

  async function newChallenge(){
    ready=false;
    submit.disabled=true;
    token.value='';
    answer.value='';
    question.textContent='問題を読み込み中...';
    status.textContent='送信準備中です。';
    try{
      const response=await fetch('challenge.php',{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
      const data=await response.json();
      if(!response.ok||!data.success||!data.token||!data.question)throw Error('captcha');
      token.value=data.token;
      question.textContent=data.question;
      ready=true;
      submit.disabled=false;
      status.textContent='入力が完了したら、計算問題に回答して送信してください。';
    }catch(e){
      ready=false;
      question.textContent='問題を取得できませんでした';
      status.textContent='送信機能に接続できません。時間をおいてお試しいただくか公式SNSをご利用ください。';
    }
  }

  retry.addEventListener('click',()=>{
    if(!pending)newChallenge();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(pending||!ready)return;
    if(!form.reportValidity())return;
    pending=true;
    submit.disabled=true;
    retry.disabled=true;
    success.hidden=true;
    error.hidden=true;
    status.textContent='送信しています...';
    try{
      const response=await fetch(form.action,{
        method:'POST',
        body:new FormData(form),
        credentials:'same-origin',
        cache:'no-store',
        headers:{Accept:'application/json'}
      });
      const data=await response.json();
      if(!response.ok||!data.success)throw Error(data.error||'送信できませんでした。');
      // Navigate only when the PHP endpoint confirms that it accepted the message.
      showSuccess(data.message||'お問い合わせを受け付けました。');
      form.reset();
      try{
        // Only a timestamp is stored; never persist names, email or message text.
        sessionStorage.setItem('ks-kanto-contact-accepted-at',String(Date.now()));
        window.location.assign(new URL('thanks/',window.location.href).href);
        return;
      }catch(navigationError){
        // Privacy-mode storage restrictions must not erase a verified success.
        await newChallenge();
        status.textContent='送信を受け付けました。完了ページへ移動できない環境のため、この画面でお知らせしています。';
      }
    }catch(e){
      showError(e instanceof Error?e.message:'通信エラーが発生しました。');
      await newChallenge();
      status.textContent='送信できませんでした。内容を確認し、必要に応じて再送してください。';
    }finally{
      pending=false;
      retry.disabled=false;
      submit.disabled=!ready;
    }
  });

  newChallenge();
})();
