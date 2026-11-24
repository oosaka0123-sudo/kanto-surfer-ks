<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$options = parseOptions($argv);
$publicDir = $options['public-dir'] ?? ($root . '/data/public');
$outputDir = $options['output-dir'] ?? ($root . '/build/pages');
$configPath = $options['config'] ?? ($root . '/config/representative-spots.json');

$config = readJson($configPath);
$spots = $config['spots'] ?? null;
if (!is_array($spots) || $spots === []) {
    fail('No representative spots found.');
}

resetDirectory($outputDir, $root);
ensureDirectory($outputDir . '/data');
copyRequired($root . '/prototype/spot-forecast/app.js', $outputDir . '/app.js');
copyRequired($root . '/prototype/spot-forecast/styles.css', $outputDir . '/styles.css');
atomicWrite($outputDir . '/.nojekyll', '');
atomicWrite($outputDir . '/CNAME', "kanto.rss7.net\n");
atomicWrite(
    $outputDir . '/google10b52f5d3ce8d9fd.html',
    "google-site-verification: google10b52f5d3ce8d9fd.html\n"
);
atomicWrite(
    $outputDir . '/robots.txt',
    "User-agent: *\nAllow: /\nSitemap: https://kanto.rss7.net/sitemap.xml\n"
);
atomicWrite(
    $outputDir . '/.htaccess',
    "RewriteEngine On\n"
    . "RewriteCond %{HTTPS} !=on\n"
    . "RewriteRule ^ https://kanto.rss7.net%{REQUEST_URI} [R=301,L]\n"
    . "ErrorDocument 404 /404.html\n"
);
atomicWrite(
    $outputDir . '/404.html',
    '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>ページが見つかりません｜関東サーファーKS</title><link rel="stylesheet" href="/styles.css"></head><body><main class="info-page"><p class="beta-label">KANTO SURFER KS</p><h1>ページが見つかりません</h1><p>指定されたページは見つかりませんでした。</p><p><a class="back-home" href="/">ホームへ戻る</a></p></main></body></html>'
);

$seenSlugs = [];
foreach ($spots as $index => $spot) {
    $id = (string)($spot['id'] ?? '');
    $slug = (string)($spot['slug'] ?? '');
    $name = (string)($spot['display_name'] ?? $id);
    if ($id === '') fail('Representative spot id is empty.');
    if ($slug === '' || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
        fail('Invalid public slug for spot ' . $id . ': ' . $slug);
    }
    if (isset($seenSlugs[$slug])) fail('Duplicate public slug: ' . $slug);
    $seenSlugs[$slug] = true;

    $source = rtrim($publicDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $id . '.json';
    copyRequired($source, $outputDir . '/data/' . $id . '.json');
    $spots[$index]['id'] = $id;
    $spots[$index]['slug'] = $slug;
    $spots[$index]['display_name'] = $name;
}

$publicIndex = rtrim($publicDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.json';
if (is_file($publicIndex)) copyRequired($publicIndex, $outputDir . '/data/index.json');

// 10日間の波・風予報を表示するスポット。null は全スポット。
$dailySpotIds = null;
$showDailyFor = static fn(string $spotId): bool => $dailySpotIds === null || in_array($spotId, $dailySpotIds, true);

$defaultSpot = $spots[0];
atomicWrite(
    $outputDir . '/index.html',
    buildForecastPage($spots, $defaultSpot, '', 'data/', './', true, $dailySpotIds === null)
);

ensureDirectory($outputDir . '/spots');
foreach ($spots as $spot) {
    $spotDir = $outputDir . '/spots/' . $spot['slug'];
    ensureDirectory($spotDir);
    atomicWrite(
        $spotDir . '/index.html',
        buildForecastPage($spots, $spot, '../../', '../../data/', '../../', false, $showDailyFor((string)$spot['id']))
    );
}

$infoPages = [
    'about' => [
        'title' => 'サイト概要・データについて｜関東サーファーKS',
        'description' => '関東サーファーKSのデータ元、更新方法、モデル波高と実際のブレイクサイズの違い、検証方針を説明します。',
        'heading' => 'サイト概要・データについて',
        'body' => '<p>関東サーファーKSは、関東主要サーフスポットの海洋モデル予報を見やすく確認するための波予報サイトです。</p>
<h2>現在の公開データ</h2>
<p>Open-MeteoのMarine / Weatherデータを定期取得し、関東9地点の時間別（48時間）予報と10日間の波・風予報として表示しています。公開値はモデル値であり、実際のブレイクサイズを直接示すものではありません。</p>
<h2>検証方針</h2>
<p>モデル値と実波の照合、地点ごとの海岸向き・遮蔽・風の影響を段階的に検証しています。検証が終わっていない実ブレイクサイズ、点数、ランキングは公開値として自動生成しません。</p>
<h2>更新</h2>
<p>公開サイトはGitHub Actionsで定期生成しています。取得・生成に失敗した場合は、推測値で埋めず処理を失敗させる方針です。</p>'
    ],
    'contact' => [
        'title' => 'お問い合わせ｜関東サーファーKS',
        'description' => '関東サーファーKSのお問い合わせ案内です。',
        'heading' => 'お問い合わせ',
        'body' => '<p>お問い合わせ・情報提供は、<a href="https://www.youtube.com/channel/UCsGqnLPpcWnAB740uqkglzg" target="_blank" rel="noopener noreferrer">関東サーファー YouTubeチャンネル</a>の案内をご利用ください。</p>
<p>このサイトの波予報は海での安全を保証するものではありません。緊急連絡や救助要請の窓口としては使用できません。</p>'
    ],
    'privacy' => [
        'title' => 'プライバシーポリシー｜関東サーファーKS',
        'description' => '関東サーファーKSの現在のプライバシー方針です。',
        'heading' => 'プライバシーポリシー',
        'body' => '<p>現在、このサイト独自のお問い合わせフォーム、独自Cookie、独自アクセス解析は導入していません。</p>
<p>今後、問い合わせ機能やアクセス解析等を導入する場合は、実際の運用内容に合わせてこのページを更新します。</p>
<p>公開サイトには、内部検証記録、認証情報、非公開スポット情報を含めません。</p>'
    ],
];

foreach ($infoPages as $slug => $page) {
    $dir = $outputDir . '/' . $slug;
    ensureDirectory($dir);
    atomicWrite(
        $dir . '/index.html',
        buildInfoPage($spots, $slug, $page['title'], $page['description'], $page['heading'], $page['body'])
    );
}

$sitemapUrls = ['https://kanto.rss7.net/'];
foreach ($spots as $spot) {
    $sitemapUrls[] = 'https://kanto.rss7.net/spots/' . rawurlencode((string)$spot['slug']) . '/';
}
foreach (array_keys($infoPages) as $slug) {
    $sitemapUrls[] = 'https://kanto.rss7.net/' . rawurlencode((string)$slug) . '/';
}
$sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach ($sitemapUrls as $url) {
    $sitemap .= '  <url><loc>' . htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8') . "</loc></url>\n";
}
$sitemap .= "</urlset>\n";
atomicWrite($outputDir . '/sitemap.xml', $sitemap);

$extraCss = "\nhtml,body{max-width:100%;overflow-x:hidden}.beta-intro{width:min(calc(100% - 36px),var(--max));margin:auto;padding:48px 0 10px}.beta-label,.current-spot{color:var(--wave);font:700 11px/1.5 \"Yu Gothic\",sans-serif;letter-spacing:.12em}.beta-intro h1{margin:8px 0 12px;font-size:clamp(34px,8vw,58px);font-weight:500}.beta-intro>p:not(.beta-label){margin:0;max-width:46rem;color:var(--muted);font:13px/1.9 \"Yu Gothic\",sans-serif}.spot-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:24px}.spot-link{min-width:0;padding:12px 10px;border:1px solid var(--line);color:var(--text);text-decoration:none;background:rgba(5,29,40,.18)}.spot-link small,.spot-link strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spot-link small{color:var(--muted);font:9px/1.5 \"Yu Gothic\",sans-serif}.spot-link strong{margin-top:3px;font-size:14px}.spot-link[aria-current]{border-color:var(--wave);background:var(--soft)}.current-spot{margin:0 0 12px}.current-spot strong{color:var(--text);font-size:15px;margin-left:8px}.permanent-pages{width:min(calc(100% - 36px),var(--max));margin:24px auto 0;padding:18px;border:1px solid var(--line);background:rgba(5,29,40,.18)}.permanent-pages h2{margin:0 0 10px;font-size:15px}.permanent-links{display:flex;flex-wrap:wrap;gap:8px}.permanent-links a,.trust-links a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--line);padding:5px 0}.spot-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:18px}.spot-context div{padding:12px;border:1px solid var(--line)}.spot-context dt{color:var(--muted);font:10px/1.5 \"Yu Gothic\",sans-serif}.spot-context dd{margin:5px 0 0;font:13px/1.6 \"Yu Gothic\",sans-serif}.trust-links{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}.info-page{width:min(calc(100% - 36px),760px);margin:0 auto;padding:64px 0 72px}.info-page h1{margin:0 0 28px;font-size:clamp(32px,7vw,52px);font-weight:500}.info-page h2{margin:34px 0 10px;font-size:20px}.info-page p{color:var(--muted);font:14px/2 \"Yu Gothic\",sans-serif}.info-page .back-home{display:inline-block;margin-bottom:28px;color:var(--text);text-decoration:none;border-bottom:1px solid var(--line)}.youtube-link{display:inline-flex;align-items:center;gap:6px;color:var(--text);text-decoration:none;font:12px/1.4 \"Yu Gothic\",sans-serif}.youtube-link svg{width:22px;height:auto;fill:#ff0033;flex:none}.youtube-link .youtube-play{fill:#fff}.youtube-link:hover{opacity:.82}@media(max-width:720px){.spot-context{grid-template-columns:1fr}.spot-picker{grid-template-columns:1fr}.beta-intro,.permanent-pages,.forecast-section,.info-page{width:calc(100% - 16px);max-width:100%;min-width:0}.beta-intro{padding-top:34px}.beta-intro h1{font-size:clamp(30px,9vw,42px);line-height:1.22;overflow-wrap:anywhere}.beta-intro>p:not(.beta-label){font-size:12px;line-height:1.8;overflow-wrap:anywhere}.spot-link{width:100%;min-width:0}.youtube-link{font-size:11px}.youtube-link svg{width:20px}}\n";
if (file_put_contents($outputDir . '/styles.css', $extraCss, FILE_APPEND | LOCK_EX) === false) {
    fail('Unable to append Pages styles.');
}

fwrite(STDOUT, sprintf(
    "Built Pages beta: root + %d spot pages + %d trust pages in %s\n",
    count($spots), count($infoPages), $outputDir
));

function buildForecastPage(
    array $spots,
    array $activeSpot,
    string $assetPrefix,
    string $dataBase,
    string $homeHref,
    bool $homePage,
    bool $showDaily = true
): string {
    $id = (string)$activeSpot['id'];
    $name = (string)$activeSpot['display_name'];
    $region = (string)($activeSpot['region'] ?? '');
    $spotNavLinks = buildSpotNavigationLinks($spots, $assetPrefix, $homePage ? null : $id);

    $title = $homePage
        ? '関東サーファーKS｜時間別・10日間波予報'
        : $name . 'の波予報｜関東サーファーKS';
    $description = $homePage
        ? '関東サーファーKS。関東9地点の時間別・10日間モデル波予報。'
        : $name . '（' . $region . '）の時間別・10日間モデル波予報。Open-Meteo海洋モデルを使用しています。';
    $heading = $homePage ? '関東9地点の波予報' : $name . 'の波予報';
    $intro = $homePage
        ? 'Open-Meteoの海洋モデルを使った波予報です。各スポットの個別予報はページ下部のリンクからご覧ください。'
        : $name . '（' . $region . '）のモデル予報です。モデル波高は実際のブレイクサイズを直接示す値ではありません。';

    $context = '';
    if (!$homePage) {
        $context = '<dl class="spot-context">'
            . contextItem('海岸向き（基準）', (string)($activeSpot['coast_facing'] ?? '確認中'))
            . contextItem('反応しやすいうねり（基準）', (string)($activeSpot['effective_swell'] ?? '確認中'))
            . contextItem('オフショア目安', (string)($activeSpot['offshore'] ?? '確認中'))
            . '</dl>';
    }

    $kugenumaPilot = !$homePage && $id === 'kugenuma';
    $pilotTop = $kugenumaPilot ? buildKugenumaTop() . buildApprovedKugenumaArticle($root = dirname(__DIR__)) : '';
    $pilotBottom = $kugenumaPilot ? buildKugenumaBottom($context) : '';
    if ($kugenumaPilot) $context = '';
    $compactAttrs = (!$homePage && $id === 'kugenuma') ? ' data-compact-test="1"' : '';
    $compactDays = (!$homePage && $id === 'kugenuma') ? '<nav class="compact-days" aria-label="日付切替"><button type="button" data-compact-day="0" class="is-active" aria-pressed="true">今日</button><button type="button" data-compact-day="1" aria-pressed="false">明日</button><button type="button" data-compact-day="2" aria-pressed="false">明後日</button></nav>' : '';
    $compactExtras = (!$homePage && $id === 'kugenuma') ? '<div class="compact-extras" data-compact-extras>
  <section class="compact-extra-panel compact-tide-rain-panel" aria-labelledby="kugenuma-tide-rain-title">
    <div class="compact-tide-rain-header">
      <h3 id="kugenuma-tide-rain-title" class="compact-tide-rain-title"><span>潮位</span><i class="tide-line-chip" aria-hidden="true"></i><span class="compact-title-divider">−</span><span>降水量</span><i class="rain-bar-chip" aria-hidden="true"></i></h3>
      <p class="compact-extra-meta" data-rain-info aria-live="polite">予報データ読み込み中</p>
    </div>
    <div class="compact-rain-scroll" data-rain-scroll tabindex="0" aria-label="潮位・降水量・降水確率の時間別グラフと表。左右にスクロールできます">
      <div data-rain-inner>
        <svg data-rain-chart role="img" aria-label="湘南港の潮位は水色の曲線、降水量は青色の棒。時間別天気をグラフ下の時刻の下に表示"></svg>
        <div class="compact-tide-rain-grid" data-tide-rain-grid></div>
      </div>
    </div>
    <p class="compact-tide-phase" data-tide-phase aria-live="polite">潮回り： —</p>
    <p class="compact-extrema" data-tide-info aria-live="polite">満潮・干潮データ読み込み中</p>
    <p class="compact-tide-note">潮位は<a href="https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=D8" target="_blank" rel="noopener noreferrer">気象庁・湘南港の天文潮位</a>（潮位表基準面上）。鵠沼の実測値ではありません。降水量・確率はOpen-Meteoのモデル予報。二つの量は別の目盛りです。過去の潮位線も推算値です。潮回りは旧暦換算による目安で、気象庁の公表値ではありません。</p>
  </section>
</div>' : '';
    $trustPrefix = $assetPrefix;
    $appVersion = substr(hash_file('sha256', dirname(__DIR__) . '/prototype/spot-forecast/app.js'), 0, 12);
    $styleVersion = substr(hash_file('sha256', dirname(__DIR__) . '/prototype/spot-forecast/styles.css'), 0, 12);
    $canonicalPath = $homePage ? '' : 'spots/' . rawurlencode((string)$activeSpot['slug']) . '/';
    $canonicalUrl = 'https://kanto.rss7.net/' . $canonicalPath;

    return '<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#082331">
  <meta name="robots" content="index,follow">
  <meta name="description" content="' . h($description) . '">
  <link rel="canonical" href="' . h($canonicalUrl) . '">
  <title>' . h($title) . '</title>
  <link rel="stylesheet" href="' . h($assetPrefix) . 'styles.css?v=' . h($styleVersion) . '">
  <script defer src="' . h($assetPrefix) . 'app.js?v=' . h($appVersion) . '"></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="' . h($homeHref) . '" aria-label="関東サーファーKS ホーム"><span class="brand-mark">KS</span><span class="brand-copy">Kanto Surf</span></a>
    ' . buildHeaderMenu($spotNavLinks, $assetPrefix) . '
  </header>
  <main>
    <section class="beta-intro" id="spots">
      <p class="beta-label">KANTO SURFER KS / SURF FORECAST</p>
      <h1>' . h($heading) . '</h1>
      <p>' . h($intro) . '</p>
      ' . $context . '
    </section>
    ' . $pilotTop . '
    <section class="forecast-section" aria-labelledby="forecast-title">
      <p class="current-spot">SPOT <strong data-spot-name>' . h($name) . '</strong></p>
      <div class="section-title"><span class="section-number">' . ($kugenumaPilot ? '03' : '04') . '</span><span class="section-icon" aria-hidden="true">⌁</span><h2 id="forecast-title">波・風</h2></div>
      <div class="forecast-shell" data-forecast' . $compactAttrs . ' data-data-base="' . h($dataBase) . '" data-default-spot="' . h($id) . '">
        <div class="forecast-panel" id="panel-forecast" aria-labelledby="forecast-title">' . $compactDays . '
          <div class="forecast-legend" aria-label="グラフ凡例"><span><i class="legend-wave"></i><span data-wave-label>モデル波高(m)</span></span><span><i class="legend-wind"></i>風(m/s)</span><span class="data-state" data-state>読み込み中</span></div>
          <div class="chart-wrap" aria-label="モデル波高と風速の推移"><div class="chart-scroll" data-chart-scroll><div class="chart-inner" data-chart-inner><svg class="forecast-chart" viewBox="0 0 800 240" preserveAspectRatio="none" data-chart aria-hidden="true"></svg></div></div><p class="chart-empty" data-chart-empty>予報データ未接続</p></div>
          <div class="scroll-hint" aria-hidden="true">← 横にスワイプ →</div>
          <div class="forecast-scroll" tabindex="0" aria-label="予報表。左右にスクロールできます" data-scroll><div class="forecast-grid" data-grid></div></div>
          ' . $compactExtras . '
          <aside class="verified-observation" data-observation hidden aria-live="polite"></aside>
        </div>
      </div>
      <p class="forecast-note" id="forecast-note" data-forecast-note>Open-Meteoの海洋モデル波高です。実際のブレイクサイズを直接示す値ではありません。</p>
    </section>
    ' . ($showDaily ? buildDailySection($name, $kugenumaPilot ? '04' : '05') : '') . $pilotBottom . '
  </main>
  <footer class="site-footer"><span>KS / KANTO SURFER</span><span>MODEL FORECAST</span><a class="youtube-link" href="https://www.youtube.com/channel/UCsGqnLPpcWnAB740uqkglzg" target="_blank" rel="noopener noreferrer" aria-label="関東サーファー YouTube"><svg viewBox="0 0 28 20" aria-hidden="true"><path d="M27.4 3.1A3.5 3.5 0 0 0 25 0.6C22.8 0 14 0 14 0S5.2 0 3 0.6A3.5 3.5 0 0 0 0.6 3.1C0 5.3 0 10 0 10s0 4.7 0.6 6.9A3.5 3.5 0 0 0 3 19.4c2.2 0.6 11 0.6 11 0.6s8.8 0 11-0.6a3.5 3.5 0 0 0 2.4-2.5C28 14.7 28 10 28 10s0-4.7-0.6-6.9Z"/><path class="youtube-play" d="m11.2 14.3 7.3-4.3-7.3-4.3v8.6Z"/></svg><span>YouTube</span></a><nav class="footer-spot-nav" aria-label="サーフスポット個別ページ"><strong>サーフスポット</strong><div class="footer-spot-grid">' . $spotNavLinks . '</div></nav><nav class="trust-links" aria-label="サイト情報"><a href="' . h($trustPrefix) . 'about/">サイト概要</a><a href="' . h($trustPrefix) . 'contact/">お問い合わせ</a><a href="' . h($trustPrefix) . 'privacy/">プライバシー</a></nav></footer>
</body>
</html>
';
}

/**
 * Only explicitly approved, source-backed articles are displayed.
 * Scheduled drafts under test-only/ are deliberately excluded.
 */
function buildApprovedKugenumaArticle(string $root): string
{
    $path = $root . '/content/approved/kugenuma.json';
    if (!is_file($path)) return '';
    $article = readJson($path);
    if (($article['status'] ?? '') !== 'approved') return '';
    $date = (string)($article['date'] ?? '');
    $title = trim((string)($article['title'] ?? ''));
    $paragraphs = $article['paragraphs'] ?? [];
    $sources = $article['sources'] ?? [];
    if (!preg_match('/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/', $date)
        || !is_array($paragraphs) || count($paragraphs) < 2 || count($paragraphs) > 6
        || !is_array($sources) || count($sources) < 2 || strlen($title) < 12) {
        fail('Invalid approved Kugenuma article');
    }
    $body = '';
    foreach ($paragraphs as $paragraph) {
        if (!is_string($paragraph) || mb_strlen(trim($paragraph)) < 20 || mb_strlen($paragraph) > 500) fail('Invalid article paragraph');
        $body .= '<p>' . h($paragraph) . '</p>';
    }
    $links = '';
    foreach ($sources as $source) {
        if (!is_array($source) || !isset($source['name'], $source['url'])
            || !is_string($source['name']) || !is_string($source['url'])
            || !preg_match('~^https://[^\\s]+$~', $source['url'])) fail('Invalid article source');
        $links .= '<li><a href="' . h($source['url']) . '" target="_blank" rel="noopener noreferrer">' . h($source['name']) . '</a></li>';
    }
    return '<section class="forecast-section" aria-labelledby="ks-article-title">'
        . '<div class="section-title"><h2 id="ks-article-title">KS 波情報レポート</h2></div>'
        . '<article class="forecast-panel" style="padding:1rem">'
        . '<p class="forecast-note">対象日：' . h($date) . '｜公開前確認済み</p>'
        . '<h3>' . h($title) . '</h3>' . $body
        . '<details><summary>情報源</summary><ul>' . $links . '</ul></details>'
        . '<p class="forecast-note">現地の波・流れ・注意報を確認してから入水してください。</p>'
        . '</article></section>';
}

/** 鵠沼限定の個別ページ試作。既存グラフとデータ処理は変更しない。 */
function buildKugenumaTop(): string
{
    return '<section class="forecast-section" aria-labelledby="advice-title">
      <div class="section-title"><span class="section-number">01</span><h2 id="advice-title">今日のアドバイス</h2></div>
      <div class="forecast-panel" style="padding:1rem"><h3>今日の狙い方</h3><p data-kugenuma-advice aria-live="polite">最新の予報データを確認中です。</p><p class="forecast-note">モデル予報による目安です。入水の可否は現地の波・流れ・注意報等を確認して判断してください。</p></div>
    </section>
    <section class="forecast-section" aria-labelledby="camera-title">
      <div class="section-title"><span class="section-number">02</span><h2 id="camera-title">ライブカメラ</h2></div>
      <div class="forecast-panel" style="padding:1rem"><p><a href="https://www.pref.kanagawa.jp/docs/f4i/tsunami/p613103.html" target="_blank" rel="noopener noreferrer">神奈川県公式・藤沢海岸カメラ →</a></p><p class="forecast-note">一覧から藤沢海岸を選択してください。</p><p><a href="https://livecombs.com/kanagawaken/fujisawa-shi/kugenuma-beach/" target="_blank" rel="noopener noreferrer">なみある？・鵠沼ライブ映像（外部ページ）→</a></p><p class="forecast-note">外部配信です。配信休止や映像の遅延がある場合があります。</p></div>
    </section>';
}

function buildKugenumaBottom(string $context): string
{
    return '<section class="forecast-section" aria-labelledby="spot-info-title">
      <div class="section-title"><span class="section-number">05</span><h2 id="spot-info-title">スポット情報</h2></div>
      <div class="forecast-panel" style="padding:1rem"><p>神奈川県藤沢市・湘南の砂地のビーチブレイク。引地川河口周辺などでサーフィンが行われます。</p>' . $context . '<p>比較的穏やかな日には初心者にも親しまれますが、混雑、離岸流、海水浴期間の規制には注意してください。</p></div>
    </section>
    <section class="forecast-section" aria-labelledby="wide-wave-title">
      <div class="section-title"><span class="section-number">06</span><h2 id="wide-wave-title">広域波高マップ</h2></div>
      <div class="forecast-panel" style="padding:1rem"><p>日本周辺の波高分布を確認できます。</p><a href="https://www.imocwx.com/cwm/cwm_jp.gif" target="_blank" rel="noopener noreferrer" aria-label="広域波高マップを拡大"><img src="https://www.imocwx.com/cwm/cwm_jp.gif" alt="日本周辺の広域波高マップ" loading="lazy" style="width:100%;height:auto;display:block"></a><p class="forecast-note">画像をタップして拡大できます。表示できない場合は<a href="https://www.imocwx.com/cwm.php?Area=0" target="_blank" rel="noopener noreferrer">配信元の波高マップを開く →</a></p><p class="forecast-note">出典：国際気象海洋株式会社。<a href="https://www.data.jma.go.jp/waveinf/tile/jp/index.html" target="_blank" rel="noopener noreferrer">気象庁の波浪実況・予想図も確認する →</a></p></div>
    </section>';
}

/**
 * 10日間の波・風予報（日別6列表）。値は build_public_forecast.php が生成する payload.daily を
 * app.js が描画するだけで、ブラウザ側で集約・補完はしない。全スポット共通テンプレート。
 */
function buildDailySection(string $spotName, string $number = '05'): string
{
    return '<section class="forecast-section daily-section" id="daily-forecast" aria-labelledby="daily-title" data-daily>
      <div class="section-title"><span class="section-number">' . h($number) . '</span><span class="section-icon" aria-hidden="true">⌁</span><h2 id="daily-title">10日間の波・風予報</h2></div>
      <p class="daily-subtitle"><span data-daily-spot>' . h($spotName) . '</span>｜5:00〜17:00</p>
      <div class="daily-table-wrap">
        <table class="daily-table" aria-label="' . h($spotName) . ' 10日間の波と風の予報">
          <colgroup><col class="c-date"><col class="c-weather"><col class="c-wave"><col class="c-wind"><col class="c-dir"><col class="c-judge"></colgroup>
          <thead><tr><th scope="col">日付</th><th scope="col">天気</th><th scope="col">モデル波高 <small>(m)</small></th><th scope="col">風速 <small>(m/s)</small></th><th scope="col">風向</th><th scope="col">判定</th></tr></thead>
          <tbody data-daily-body><tr><td colspan="6" class="daily-empty">データ取得中...</td></tr></tbody>
        </table>
      </div>
      <div class="daily-meta"><span data-daily-updated>データ取得中...</span><span>提供：Open-Meteo</span></div>
      <p class="daily-note">波高：Open-Meteo海洋モデル波高の5〜17時の最小〜最大（実際のブレイクサイズではありません）／風速：同時間帯の平均値／風向：同時間帯の風速加重平均／天気：11時／判定：モデル波高と風を用いた暫定的な星評価です。実際のブレイクサイズや海況の良さを保証するものではありません。データ不足時は「検証中」。横棒はこの10日間での相対比較です。データ不足時は「—」と表示し、推測補完しません。</p>
    </section>';
}

/**
 * Shared collapsible navigation for all 13 public pages.
 * Reuses the existing nine internal spot URLs; the footer remains unchanged.
 */
function buildHeaderMenu(string $spotLinks, string $basePrefix): string
{
    $base = $basePrefix === '' ? './' : $basePrefix;
    return '<button class="menu-button" type="button" aria-label="メニューを開く" aria-expanded="false" aria-controls="site-menu"><span></span><span></span><span></span></button>'
        . '<nav class="site-menu" id="site-menu" aria-label="サイトメニュー" hidden>'
        . '<a href="' . h($base) . '">ホーム</a>'
        . '<div class="menu-spot-group" role="group" aria-label="サーフスポット別予報">'
        . '<p class="menu-group-label">サーフスポット（9地点）</p>' . $spotLinks . '</div>'
        . '<div class="menu-info-group" role="group" aria-label="サイト情報">'
        . '<a href="' . h($basePrefix . 'about/') . '">サイト概要</a>'
        . '<a href="' . h($basePrefix . 'contact/') . '">お問い合わせ</a>'
        . '<a href="' . h($basePrefix . 'privacy/') . '">プライバシー</a></div>'
        . '</nav>';
}

function buildSpotNavigationLinks(array $spots, string $prefix, ?string $activeId = null): string
{
    $links = [];
    foreach ($spots as $spot) {
        $current = $activeId !== null && $activeId === (string)$spot['id'] ? ' aria-current="page"' : '';
        $links[] = '<a href="' . h($prefix . 'spots/' . rawurlencode((string)$spot['slug']) . '/') . '"' . $current . '>' . h((string)$spot['display_name']) . '</a>';
    }
    return implode(PHP_EOL, $links);
}

function contextItem(string $label, string $value): string
{
    return '<div><dt>' . h($label) . '</dt><dd>' . h($value) . '</dd></div>';
}

function buildInfoPage(array $spots, string $slug, string $title, string $description, string $heading, string $body): string
{
    $spotNavLinks = buildSpotNavigationLinks($spots, '../');
    $styleVersion = substr(hash_file('sha256', dirname(__DIR__) . '/prototype/spot-forecast/styles.css'), 0, 12);
    $canonicalUrl = 'https://kanto.rss7.net/' . rawurlencode($slug) . '/';
    return '<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#082331">
  <meta name="robots" content="index,follow">
  <meta name="description" content="' . h($description) . '">
  <link rel="canonical" href="' . h($canonicalUrl) . '">
  <title>' . h($title) . '</title>
  <link rel="stylesheet" href="../styles.css?v=' . h($styleVersion) . '">
  <script defer src="../app.js?v=' . h(substr(hash_file('sha256', dirname(__DIR__) . '/prototype/spot-forecast/app.js'), 0, 12)) . '"></script>
</head>
<body>
  <header class="site-header"><a class="brand" href="../" aria-label="関東サーファーKS ホーム"><span class="brand-mark">KS</span><span class="brand-copy">Kanto Surf</span></a>' . buildHeaderMenu($spotNavLinks, '../') . '</header>
  <main class="info-page"><a class="back-home" href="../">← ホームへ</a><p class="beta-label">KANTO SURFER KS / SITE INFO</p><h1>' . h($heading) . '</h1>' . $body . '</main>
  <footer class="site-footer"><span>KS / KANTO SURFER</span><span>MODEL FORECAST</span><a class="youtube-link" href="https://www.youtube.com/channel/UCsGqnLPpcWnAB740uqkglzg" target="_blank" rel="noopener noreferrer" aria-label="関東サーファー YouTube"><svg viewBox="0 0 28 20" aria-hidden="true"><path d="M27.4 3.1A3.5 3.5 0 0 0 25 0.6C22.8 0 14 0 14 0S5.2 0 3 0.6A3.5 3.5 0 0 0 0.6 3.1C0 5.3 0 10 0 10s0 4.7 0.6 6.9A3.5 3.5 0 0 0 3 19.4c2.2 0.6 11 0.6 11 0.6s8.8 0 11-0.6a3.5 3.5 0 0 0 2.4-2.5C28 14.7 28 10 28 10s0-4.7-0.6-6.9Z"/><path class="youtube-play" d="m11.2 14.3 7.3-4.3-7.3-4.3v8.6Z"/></svg><span>YouTube</span></a><nav class="footer-spot-nav" aria-label="サーフスポット個別ページ"><strong>サーフスポット</strong><div class="footer-spot-grid">' . $spotNavLinks . '</div></nav><nav class="trust-links" aria-label="サイト情報"><a href="../about/">サイト概要</a><a href="../contact/">お問い合わせ</a><a href="../privacy/">プライバシー</a></nav></footer>
</body>
</html>
';
}

function parseOptions(array $argv): array
{
    $out = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--') !== 0) continue;
        $pair = substr($arg, 2);
        $pos = strpos($pair, '=');
        if ($pos === false) $out[$pair] = '1';
        else $out[substr($pair, 0, $pos)] = substr($pair, $pos + 1);
    }
    return $out;
}

function readJson(string $path): array
{
    if (!is_file($path)) fail('JSON file not found: ' . $path);
    $raw = file_get_contents($path);
    if ($raw === false) fail('Unable to read JSON: ' . $path);
    try { $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { fail('Invalid JSON: ' . $e->getMessage()); }
    if (!is_array($data)) fail('JSON root must be an object.');
    return $data;
}

function resetDirectory(string $path, string $root): void
{
    $normalizedPath = rtrim(str_replace('\\', '/', $path), '/');
    $normalizedRoot = rtrim(str_replace('\\', '/', $root), '/');
    if ($normalizedPath === '' || $normalizedPath === '/' || $normalizedPath === $normalizedRoot) {
        fail('Refusing to reset unsafe output directory.');
    }
    if (is_dir($path)) removeTree($path);
    ensureDirectory($path);
}

function removeTree(string $path): void
{
    $items = scandir($path);
    if ($items === false) fail('Unable to scan output directory.');
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $child = $path . DIRECTORY_SEPARATOR . $item;
        if (is_dir($child) && !is_link($child)) removeTree($child);
        elseif (!unlink($child)) fail('Unable to remove: ' . $child);
    }
    if (!rmdir($path)) fail('Unable to remove directory: ' . $path);
}

function copyRequired(string $from, string $to): void
{
    if (!is_file($from)) fail('Required file missing: ' . $from);
    if (!copy($from, $to)) fail('Unable to copy: ' . $from);
}

function ensureDirectory(string $path): void
{
    if (is_dir($path)) return;
    if (!mkdir($path, 0775, true) && !is_dir($path)) fail('Unable to create directory: ' . $path);
}

function atomicWrite(string $path, string $contents): void
{
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $contents, LOCK_EX) === false) fail('Unable to write: ' . $tmp);
    if (!rename($tmp, $path)) { @unlink($tmp); fail('Unable to replace: ' . $path); }
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}