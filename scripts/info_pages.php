<?php
declare(strict_types=1);

/**
 * Kansai KS-inspired Kanto information pages.
 * These are current descriptions and intentions, not promises that unlaunched
 * supporter payouts, sponsorships or junior programs already exist.
 */

$about = <<<'HTML'
<section class="ks-about-hero">
  <p class="ks-eyebrow">ABOUT KANTO SURFER KS</p>
  <h2>波を知り、<br>海とつながる。</h2>
  <p class="ks-lead">湘南・茨城・千葉。海へ向かう日の判断を、もっと分かりやすく。関東サーファーKSは、波のデータと地域の魅力をつなぐ、無料のサーフィン情報メディアです。</p>
  <a class="ks-cta" href="../">今日の関東波ランキングを見る <span aria-hidden="true">↗</span></a>
  <span class="ks-hero-number" aria-hidden="true">KS.</span>
</section>

<section class="ks-section ks-mission" aria-labelledby="mission-heading">
  <p class="ks-eyebrow">01 / OUR MISSION</p>
  <h2 id="mission-heading">波の恵みを、<br>みんなで分かち合う。</h2>
  <p>サーファーが安心して海を選び、地域のお店や仲間を知り、海の環境にも目を向けられる場所を目指しています。関西サーファーKSの理念を受け継ぎながら、関東の海に合う情報を積み重ねていきます。</p>
</section>

<section class="ks-section" aria-labelledby="values-heading">
  <p class="ks-eyebrow">02 / OUR VALUES</p>
  <h2 id="values-heading">大切にする5つのこと</h2>
  <div class="ks-value-grid">
    <article><span class="ks-index">01</span><h3>共有 <small>Share the stoke</small></h3><p>良い波の喜びも、現地で得た気づきも。サーファー同士で役立つ情報を分かち合う。</p></article>
    <article><span class="ks-index">02</span><h3>正確 <small>Respect the facts</small></h3><p>モデル予報と現地の実況を混同しない。出典・更新日・不確実性を伝える。</p></article>
    <article><span class="ks-index">03</span><h3>海守 <small>Protect the ocean</small></h3><p>海の環境と地域のルールを尊重し、次の世代にも気持ちよく使える浜を守る。</p></article>
    <article><span class="ks-index">04</span><h3>地域 <small>Support the local</small></h3><p>サーフショップ、飲食店、宿泊施設など、海の周りの魅力を紹介していきたい。</p></article>
    <article><span class="ks-index">05</span><h3>継続 <small>Keep it going</small></h3><p>無理な拡大よりも、日々の更新と修正を重ね、信頼される情報源を目指す。</p></article>
  </div>
</section>

<section class="ks-section" aria-labelledby="areas-heading">
  <p class="ks-eyebrow">03 / COVERAGE</p>
  <h2 id="areas-heading">関東9つのサーフスポット</h2>
  <p>いま掲載しているのは次の9地点です。各ページで時間別・10日間のモデル予報を確認できます。</p>
  <div class="ks-area-grid">
    <div class="ks-area"><p class="ks-area-label">SHONAN / 湘南</p><a href="../spots/kugenuma/">鵠沼</a><a href="../spots/yuigahama/">由比ヶ浜</a></div>
    <div class="ks-area"><p class="ks-area-label">IBARAKI / 茨城</p><a href="../spots/oarai-onuki/">大洗・大貫</a><a href="../spots/kashima-hirai/">鹿嶋・平井</a></div>
    <div class="ks-area"><p class="ks-area-label">CHIBA / 千葉</p><a href="../spots/katakai/">片貝</a><a href="../spots/ichinomiya/">一宮</a><a href="../spots/taito/">太東</a><a href="../spots/onjuku/">御宿</a><a href="../spots/kamogawa-maruki/">鴨川・マルキ</a></div>
  </div>
</section>

<section class="ks-section" aria-labelledby="forecast-policy-heading">
  <p class="ks-eyebrow">04 / HOW WE FORECAST</p>
  <h2 id="forecast-policy-heading">予報のしくみと限界</h2>
  <div class="ks-facts-grid">
    <article><h3>モデルデータ</h3><p>Open-Meteo Marine / Weatherなどの公開気象・海洋モデルを使用し、波高、周期、波向き、風向、風速を参考として表示します。データ取得時刻も確認してください。</p></article>
    <article><h3>独自ランキング</h3><p>9地点のモデル値と各海岸の向きから条件を比較します。順位や「ヒザ〜モモ」等の波サイズは参考・試験推定であり、現地で測った波や安全性の順位ではありません。</p></article>
    <article><h3>100文字の波解説</h3><p>地点別の短い記事はデータをもとに生成・編集します。AIを利用する場合もあり、表現の誤りや現地との差があり得ます。未確認の実況を事実として表示しません。</p></article>
    <article><h3>更新と保留</h3><p>予報を定期更新していますが、通信障害や元データ不足で掲載を保留することがあります。古いデータを最新の現況と偽らず、確認できた内容を優先します。</p></article>
  </div>
  <p class="ks-note">ご注意：沖のモデル波高は岸で割れる波のサイズとは異なります。実際の天候、流れ、規制、ローカルルールを確認した上で行動してください。</p>
</section>

<section class="ks-section" aria-labelledby="future-heading">
  <p class="ks-eyebrow">05 / OUR DIRECTION</p>
  <h2 id="future-heading">これから育てたいこと</h2>
  <div class="ks-future">
    <div><span>01</span><h3>波予報の精度向上</h3><p>モデル予報と確認できる現地データの差を見直し、スポット別の特徴を反映する。</p></div>
    <div><span>02</span><h3>地域とつながる情報</h3><p>駐車場・マナー・ショップなど、サーフトリップに役立つ地域情報を充実させる。</p></div>
    <div><span>03</span><h3>海を次世代へ</h3><p>ビーチクリーンや海の環境を守る取り組みを、実施状況に応じて紹介していく。</p></div>
  </div>
  <p class="ks-note">上記は今後の運営方針です。スポンサー契約、利益分配、基金の運用などが既に開始されていることを示すものではありません。</p>
</section>

<section class="ks-end-cta">
  <p class="ks-eyebrow">SHARE THE STOKE</p>
  <h2>次の波へ。<br>関東の海から。</h2>
  <p>情報の誤りや改善の提案、地域の情報があれば、ぜひお知らせください。</p>
  <a class="ks-cta" href="../contact/">お問い合わせはこちら <span aria-hidden="true">↗</span></a>
</section>
HTML;

$privacy = <<<'HTML'
<section class="ks-legal-intro">
  <p class="ks-eyebrow">PRIVACY &amp; TRUST</p>
  <p class="ks-lead">関東サーファーKS（以下「当サイト」）は、関東9地点の波情報と予報を提供するサイトです。利用者のプライバシーを尊重し、取得する情報と外部サービスの扱いを分かりやすくお知らせします。</p>
  <p class="ks-date">制定・最終更新：2026年11月27日</p>
</section>
<nav class="ks-legal-toc" aria-label="このページの目次"><strong>このページの内容</strong>
  <a href="#privacy-data">個人情報の取得と利用</a>
  <a href="#privacy-logs">アクセス記録とCookie</a>
  <a href="#privacy-services">外部サービス</a>
  <a href="#privacy-ai">AIと予報の注意事項</a>
  <a href="#privacy-rights">権利・お問い合わせ</a>
</nav>
<section class="ks-legal-section" id="privacy-data"><span class="ks-index">01</span><h2>個人情報の取得と利用</h2>
  <p>当サイトの連絡案内ページには、問い合わせ文を手元で作成・コピーする機能があります。入力した氏名・返信先・本文を当サイトのサーバーへ送信・保存する機能ではありません。利用者が公式InstagramやFacebookからメッセージを送った場合は、そのサービスを通じてお預かりした連絡内容を問い合わせへの対応に利用します。</p>
  <p>取得した情報は、本人の同意なく目的外利用や第三者提供をしません。ただし法令に基づく場合などを除きます。機密情報、住所、電話番号などは必要がない限り記載しないでください。</p>
</section>
<section class="ks-legal-section" id="privacy-logs"><span class="ks-index">02</span><h2>アクセス記録とCookie</h2>
  <p>Webサーバーや配信事業者は、安定運用や不正アクセス対策のため、IPアドレス、閲覧時刻、ブラウザ情報などのアクセスログを記録する場合があります。</p>
  <p>当サイトの問い合わせ文作成機能は入力内容をCookieや独自のデータベースに保存しません。一方、外部SNS、動画・地図サービスなどでは各社のCookieや類似技術が利用される場合があります。ブラウザの設定でCookieを管理できます。</p>
</section>
<section class="ks-legal-section" id="privacy-services"><span class="ks-index">03</span><h2>外部サービス・アクセス解析・広告</h2>
  <p>当サイトではOpen-Meteoの気象・海洋データを参照し、YouTube、Instagram、Facebookなど外部サイトへのリンクを設けています。リンク先ではそれぞれの事業者の利用規約とプライバシーポリシーが適用されます。</p>
  <p>アクセス解析、広告、アフィリエイトなどの導入・変更がある場合は、実際の利用状況に合わせてこのページを改定します。外部サービスの利用によって取得される情報やCookieの詳細は、当該サービスの方針をご確認ください。</p>
</section>
<section class="ks-legal-section" id="privacy-ai"><span class="ks-index">04</span><h2>AIによる記事と波予報</h2>
  <p>当サイトでは、モデル予報をもとにランキングや短い記事を自動生成・編集する場合があります。海上モデルの波高と、岸で実際に割れる波のサイズは異なります。波サイズ表示は試験推定で、現地で確認した実況を意味しません。</p>
  <p>情報の正確性向上に努めていますが、予報の的中、現地の安全性、サーフィンへの適否を保証するものではありません。海に入る際は最新の天気・海況・警報・現地ルールを確認してください。</p>
</section>
<section class="ks-legal-section" id="privacy-rights"><span class="ks-index">05</span><h2>著作権・リンク・お問い合わせ</h2>
  <p>当サイトの独自文章、デザイン、ロゴ等は、特別な記載のある場合を除き各権利者に帰属します。外部データ・写真・動画は提供元の利用条件を尊重します。通常のリンクは自由ですが、内容の転載には権利確認が必要です。</p>
  <p>当サイトの運営情報やプライバシーに関するお問い合わせ、SNSで送信した個人情報に関するご相談は、<a href="../contact/">お問い合わせ</a>からご連絡ください。SNS事業者側に保存されたデータは、各社の手続きによる対応が必要な場合があります。</p>
  <p>運用・法令・サービスの変更に応じて、このポリシーを改定することがあります。改定後の内容は本ページで公開します。</p>
</section>
<div class="ks-legal-end"><strong>運営：関東サーファーKS</strong><a href="../contact/">お問い合わせ <span aria-hidden="true">↗</span></a></div>
HTML;

$contact = <<<'HTML'
<section class="ks-contact-hero">
  <p class="ks-eyebrow">CONTACT KANTO SURFER KS</p>
  <h2>あなたの声が、<br>次の波情報をつくる。</h2>
  <p class="ks-lead">サイトの改善、スポット情報の訂正、地域の情報提供、取材・スポンサーのご相談をお待ちしています。</p>
</section>
<section class="ks-section" aria-labelledby="contact-channels-heading">
  <p class="ks-eyebrow">01 / CONTACT CHANNELS</p>
  <h2 id="contact-channels-heading">公式SNSからご連絡ください</h2>
  <div class="ks-contact-channels">
    <a href="https://www.instagram.com/kanto_surfer_ks/" target="_blank" rel="noopener noreferrer"><span class="ks-channel-name">INSTAGRAM</span><strong>@kanto_surfer_ks</strong><span>Instagramのプロフィールからメッセージを送る <span aria-hidden="true">↗</span></span></a>
    <a href="https://www.facebook.com/profile.php?id=61595144364123" target="_blank" rel="noopener noreferrer"><span class="ks-channel-name">FACEBOOK</span><strong>関東サーファーKS</strong><span>Facebookページからメッセージを送る <span aria-hidden="true">↗</span></span></a>
  </div>
</section>
<section class="ks-section" aria-labelledby="contact-template-heading">
  <p class="ks-eyebrow">02 / MESSAGE HELPER</p>
  <h2 id="contact-template-heading">問い合わせ文を作成</h2>
  <p>関西版の問い合わせフォームにならい、相談種別から文章を作成できます。<strong>このフォーム自体に送信機能はありません。</strong>「文章をコピー」したあと、ご利用のSNSで貼り付けて送信してください。入力内容は当サイトのサーバーへ送信されません。</p>
  <form class="ks-inquiry-form" id="ks-inquiry-form">
    <div class="ks-form-field"><label for="ks-inquiry-kind">お問い合わせ種別 <span>必須</span></label>
      <select id="ks-inquiry-kind" name="kind" required>
        <option value="">選択してください</option>
        <option value="サイトへのご意見・改善提案">サイトへのご意見・改善提案</option>
        <option value="スポット情報の追加・修正">スポット情報の追加・修正</option>
        <option value="スポンサー・広告掲載のご相談">スポンサー・広告掲載のご相談</option>
        <option value="業務提携・取材のご依頼">業務提携・取材のご依頼</option>
        <option value="その他のお問い合わせ">その他のお問い合わせ</option>
      </select>
    </div>
    <div class="ks-form-grid">
      <div class="ks-form-field"><label for="ks-inquiry-name">お名前・呼び名 <small>任意</small></label><input id="ks-inquiry-name" name="name" type="text" maxlength="60" autocomplete="name" placeholder="お名前やニックネーム"></div>
      <div class="ks-form-field"><label for="ks-inquiry-reply">返信方法の希望 <small>任意</small></label><select id="ks-inquiry-reply" name="reply"><option value="送信したSNSで返信希望">送信したSNSで返信希望</option><option value="返信不要">返信不要</option></select></div>
    </div>
    <div class="ks-form-field"><label for="ks-inquiry-message">お問い合わせ内容 <span>必須</span></label><textarea id="ks-inquiry-message" name="message" required maxlength="2000" rows="6" placeholder="地点名、日時、内容などを具体的にご記入ください（2000文字以内）"></textarea></div>
    <button type="submit" class="ks-cta ks-form-submit" id="ks-inquiry-copy">文章をコピー <span aria-hidden="true">↗</span></button>
    <p id="ks-inquiry-status" class="ks-form-status" role="status" aria-live="polite"></p>
    <label class="ks-copy-fallback" for="ks-inquiry-output" hidden>コピーできない場合は、以下を選択してコピーしてください。<textarea id="ks-inquiry-output" readonly rows="6"></textarea></label>
  </form>
  <p class="ks-note">このページでは送信完了や返信を保証しません。SNS側で送信を完了してください。緊急の救助・事故対応は受け付けていません。</p>
</section>
<section class="ks-end-cta">
  <p class="ks-eyebrow">THANK YOU FOR SHARING</p>
  <h2>海を大切に。<br>情報を、より確かに。</h2>
  <p>ご連絡の前に、<a href="../privacy/">プライバシーポリシー</a>もご確認ください。</p>
</section>
HTML;

return [
    'about' => [
        'title' => 'サイト概要・理念｜関東サーファーKS',
        'description' => '関東サーファーKSの理念、掲載9地点、波予報と波サイズ試験推定のしくみ、運営方針を紹介します。',
        'heading' => 'サイト概要',
        'body' => $about,
    ],
    'privacy' => [
        'title' => 'プライバシーポリシー｜関東サーファーKS',
        'description' => '関東サーファーKSの個人情報、アクセスログ、Cookie、外部サービス、AI波予報、免責事項について。',
        'heading' => 'プライバシーポリシー',
        'body' => $privacy,
    ],
    'contact' => [
        'title' => 'お問い合わせ｜関東サーファーKS',
        'description' => '関東サーファーKSへのご意見・スポット情報・広告や取材の相談。公式SNSへ送る問い合わせ文を作成できます。',
        'heading' => 'お問い合わせ',
        'body' => $contact,
    ],
];
