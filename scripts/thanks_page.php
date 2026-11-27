<?php
declare(strict_types=1);

/** Standalone noindex confirmation view, reached only after a successful contact POST. */
return <<<'HTML'
<section class="ks-thankyou-card" aria-labelledby="ks-thankyou-heading">
  <div class="ks-thankyou-mark" aria-hidden="true">
    <svg viewBox="0 0 80 80" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="1.4"/>
      <path d="M22 40.5 34 52l24-25" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <p class="ks-eyebrow">THANK YOU / KANTO SURFER KS</p>
  <h2 id="ks-thankyou-heading">お問い合わせ<br>ありがとうございました。</h2>
  <div id="ks-thankyou-confirmed" hidden>
    <p class="ks-thankyou-lead">お問い合わせを受け付けました。</p>
    <p>お送りいただいた内容を確認し、必要に応じてご返信いたします。受付メールの到着には時間がかかる場合があります。</p>
    <p class="ks-thankyou-note">※受付は送信サーバーが受理したことを示します。受信メールの最終到達を保証するものではありません。</p>
  </div>
  <div id="ks-thankyou-unverified" hidden>
    <p class="ks-thankyou-lead">こちらはお問い合わせ完了のご案内ページです。</p>
    <p>直接アクセスされた場合、このページの表示だけではお問い合わせの送信完了を確認できません。送信した場合は受付メールをご確認ください。</p>
  </div>
  <noscript><p class="ks-thankyou-lead">送信の完了状態はこのページだけでは確認できません。受付メールをご確認ください。</p></noscript>
  <div class="ks-thankyou-actions">
    <a class="ks-cta" href="/">トップページに戻る <span aria-hidden="true">↗</span></a>
    <a class="ks-thankyou-link" href="/contact/">お問い合わせページへ</a>
  </div>
</section>
<section class="ks-thankyou-bottom" aria-label="関東サーファーについて">
  <p class="ks-eyebrow">SEE YOU IN THE WATER</p>
  <h2>また、海で。</h2>
  <p>関東の波を、もっと分かりやすく。これからも関東サーファーKSをよろしくお願いいたします。</p>
</section>
HTML;
