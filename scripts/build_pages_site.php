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

$defaultSpot = $spots[0];
atomicWrite(
    $outputDir . '/index.html',
    buildForecastPage($spots, $defaultSpot, '', 'data/', './', true)
);

ensureDirectory($outputDir . '/spots');
foreach ($spots as $spot) {
    $spotDir = $outputDir . '/spots/' . $spot['slug'];
    ensureDirectory($spotDir);
    atomicWrite(
        $spotDir . '/index.html',
        buildForecastPage($spots, $spot, '../../', '../../data/', '../../', false)
    );
}

$infoPages = [
    'about' => [
        'title' => 'サイト概要・データについて｜関東サーファーKS β',
        'description' => '関東サーファーKS β版のデータ元、更新方法、モデル波高と実際のブレイクサイズの違い、検証方針を説明します。',
        'heading' => 'サイト概要・データについて',
        'body' => '<p>関東サーファーKSは、関東主要サーフスポットの海洋モデル予報を見やすく確認するためのβ版です。</p>
<h2>現在の公開データ</h2>
<p>Open-MeteoのMarine / Weatherデータを定期取得し、関東9地点の時間別・8日間予報として表示しています。公開値はモデル値であり、実際のブレイクサイズを直接示すものではありません。</p>
<h2>検証方針</h2>
<p>モデル値と実波の照合、地点ごとの海岸向き・遮蔽・風の影響を段階的に検証しています。検証が終わっていない実ブレイクサイズ、点数、ランキングは公開値として自動生成しません。</p>
<h2>更新</h2>
<p>公開βはGitHub Actionsで定期生成しています。取得・生成に失敗した場合は、推測値で埋めず処理を失敗させる方針です。</p>'
    ],
    'contact' => [
        'title' => 'お問い合わせ｜関東サーファーKS β',
        'description' => '関東サーファーKS β版のお問い合わせ案内です。',
        'heading' => 'お問い合わせ',
        'body' => '<p>現在は公開βのため、一般向けのお問い合わせフォームは準備中です。正式公開前に窓口を整備します。</p>
<p>このサイトの波予報は海での安全を保証するものではありません。緊急連絡や救助要請の窓口としては使用できません。</p>'
    ],
    'privacy' => [
        'title' => 'プライバシーポリシー｜関東サーファーKS β',
        'description' => '関東サーファーKS β版の現在のプライバシー方針です。',
        'heading' => 'プライバシーポリシー',
        'body' => '<p>現在の公開βでは、このサイト独自のお問い合わせフォーム、独自Cookie、独自アクセス解析を導入していません。</p>
<p>今後、問い合わせ機能やアクセス解析等を導入する場合は、実際の運用内容に合わせてこのページを更新します。</p>
<p>公開サイトには、内部検証記録、認証情報、非公開スポット情報を含めません。</p>'
    ],
];

foreach ($infoPages as $slug => $page) {
    $dir = $outputDir . '/' . $slug;
    ensureDirectory($dir);
    atomicWrite(
        $dir . '/index.html',
        buildInfoPage($page['title'], $page['description'], $page['heading'], $page['body'])
    );
}

$extraCss = "\n.beta-intro{width:min(calc(100% - 36px),var(--max));margin:auto;padding:48px 0 10px}.beta-label,.current-spot{color:var(--wave);font:700 11px/1.5 \"Yu Gothic\",sans-serif;letter-spacing:.12em}.beta-intro h1{margin:8px 0 12px;font-size:clamp(34px,8vw,58px);font-weight:500}.beta-intro>p:not(.beta-label){margin:0;max-width:46rem;color:var(--muted);font:13px/1.9 \"Yu Gothic\",sans-serif}.spot-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:24px}.spot-link{min-width:0;padding:12px 10px;border:1px solid var(--line);color:var(--text);text-decoration:none;background:rgba(5,29,40,.18)}.spot-link small,.spot-link strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spot-link small{color:var(--muted);font:9px/1.5 \"Yu Gothic\",sans-serif}.spot-link strong{margin-top:3px;font-size:14px}.spot-link[aria-current]{border-color:var(--wave);background:var(--soft)}.current-spot{margin:0 0 12px}.current-spot strong{color:var(--text);font-size:15px;margin-left:8px}.permanent-pages{width:min(calc(100% - 36px),var(--max));margin:24px auto 0;padding:18px;border:1px solid var(--line);background:rgba(5,29,40,.18)}.permanent-pages h2{margin:0 0 10px;font-size:15px}.permanent-links{display:flex;flex-wrap:wrap;gap:8px}.permanent-links a,.trust-links a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--line);padding:5px 0}.spot-context{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:18px}.spot-context div{padding:12px;border:1px solid var(--line)}.spot-context dt{color:var(--muted);font:10px/1.5 \"Yu Gothic\",sans-serif}.spot-context dd{margin:5px 0 0;font:13px/1.6 \"Yu Gothic\",sans-serif}.trust-links{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}.info-page{width:min(calc(100% - 36px),760px);margin:0 auto;padding:64px 0 72px}.info-page h1{margin:0 0 28px;font-size:clamp(32px,7vw,52px);font-weight:500}.info-page h2{margin:34px 0 10px;font-size:20px}.info-page p{color:var(--muted);font:14px/2 \"Yu Gothic\",sans-serif}.info-page .back-home{display:inline-block;margin-bottom:28px;color:var(--text);text-decoration:none;border-bottom:1px solid var(--line)}@media(max-width:720px){.spot-context{grid-template-columns:1fr}.spot-picker{grid-template-columns:repeat(2,minmax(0,1fr))}.beta-intro{padding-top:34px}}\n";
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
    bool $homePage
): string {
    $id = (string)$activeSpot['id'];
    $name = (string)$activeSpot['display_name'];
    $region = (string)($activeSpot['region'] ?? '');
    $navLinks = buildSpotLinks($spots, $homePage, $id);
    $detailLinks = $homePage ? buildPermanentLinks($spots) : '';

    $title = $homePage
        ? '関東サーファーKS｜時間別・週間波予報 β'
        : $name . 'の波予報｜関東サーファーKS β';
    $description = $homePage
        ? '関東サーファーKS β版。関東9地点の時間別・週間モデル波予報。'
        : $name . '（' . $region . '）の時間別・8日間モデル波予報。Open-Meteo海洋モデルを使用したβ版です。';
    $heading = $homePage ? '関東9地点の波予報' : $name . 'の波予報';
    $intro = $homePage
        ? 'Open-Meteoの海洋モデルを使ったβ版です。スポットを選ぶと、時間別と8日間の週間予報を確認できます。'
        : $name . '（' . $region . '）のモデル予報です。モデル波高は実際のブレイクサイズを直接示す値ではありません。';

    $context = '';
    if (!$homePage) {
        $context = '<dl class="spot-context">'
            . contextItem('海岸向き（基準）', (string)($activeSpot['coast_facing'] ?? '確認中'))
            . contextItem('反応しやすいうねり（基準）', (string)($activeSpot['effective_swell'] ?? '確認中'))
            . contextItem('オフショア目安', (string)($activeSpot['offshore'] ?? '確認中'))
            . '</dl>';
    }

    $permanent = '';
    if ($homePage) {
        $permanent = '<section class="permanent-pages" aria-labelledby="spot-pages-title"><h2 id="spot-pages-title">スポット個別ページ</h2><nav class="permanent-links" aria-label="スポット個別ページ">'
            . $detailLinks . '</nav></section>';
    }

    $trustPrefix = $assetPrefix;

    return '<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#082331">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description" content="' . h($description) . '">
  <title>' . h($title) . '</title>
  <link rel="stylesheet" href="' . h($assetPrefix) . 'styles.css">
  <script defer src="' . h($assetPrefix) . 'app.js"></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="' . h($homeHref) . '" aria-label="関東サーファーKS ホーム"><span class="brand-mark">KS</span><span class="brand-copy">Kanto Surf</span></a>
    <button class="menu-button" type="button" aria-label="メニュー" aria-expanded="false" aria-controls="site-menu"><span></span><span></span><span></span></button>
    <nav class="site-menu" id="site-menu" aria-label="ページメニュー" hidden><a href="' . h($homeHref) . '">ホーム</a><a href="#forecast-title">予報</a><a href="' . h($trustPrefix) . 'about/">データについて</a></nav>
  </header>
  <main>
    <section class="beta-intro" id="spots">
      <p class="beta-label">KANTO SURFER KS / BETA</p>
      <h1>' . h($heading) . '</h1>
      <p>' . h($intro) . '</p>
      ' . $context . '
      <nav class="spot-picker" aria-label="予報スポット">' . $navLinks . '</nav>
    </section>
    ' . $permanent . '
    <section class="forecast-section" aria-labelledby="forecast-title">
      <p class="current-spot">SPOT <strong data-spot-name>' . h($name) . '</strong></p>
      <div class="section-title"><span class="section-number">04</span><span class="section-icon" aria-hidden="true">⌁</span><h2 id="forecast-title">時間別予報</h2></div>
      <div class="forecast-shell" data-forecast data-data-base="' . h($dataBase) . '" data-default-spot="' . h($id) . '">
        <div class="forecast-tabs" role="tablist" aria-label="予報期間">
          <button id="tab-hourly" class="forecast-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="panel-forecast" data-mode="hourly">時間別</button>
          <button id="tab-weekly" class="forecast-tab" type="button" role="tab" aria-selected="false" aria-controls="panel-forecast" data-mode="weekly">週間</button>
        </div>
        <div class="forecast-panel" id="panel-forecast" role="tabpanel" aria-labelledby="tab-hourly">
          <div class="forecast-legend" aria-label="グラフ凡例"><span><i class="legend-wave"></i><span data-wave-label>モデル波高(m)</span></span><span><i class="legend-wind"></i>風(m/s)</span><span class="data-state" data-state>読み込み中</span></div>
          <div class="chart-wrap" aria-label="モデル波高と風速の推移"><svg class="forecast-chart" viewBox="0 0 800 240" preserveAspectRatio="none" data-chart aria-hidden="true"></svg><p class="chart-empty" data-chart-empty>予報データ未接続</p></div>
          <div class="scroll-hint" aria-hidden="true">← 横にスワイプ →</div>
          <div class="forecast-scroll" tabindex="0" aria-label="予報表。左右にスクロールできます" data-scroll><div class="forecast-grid" data-grid></div></div>
          <aside class="verified-observation" data-observation hidden aria-live="polite"></aside>
        </div>
      </div>
      <p class="forecast-note" id="forecast-note" data-forecast-note>Open-Meteoの海洋モデル波高です。実際のブレイクサイズを直接示す値ではありません。</p>
    </section>
  </main>
  <footer class="site-footer"><span>KS / KANTO SURFER</span><span>BETA / MODEL FORECAST</span><nav class="trust-links" aria-label="サイト情報"><a href="' . h($trustPrefix) . 'about/">サイト概要</a><a href="' . h($trustPrefix) . 'contact/">お問い合わせ</a><a href="' . h($trustPrefix) . 'privacy/">プライバシー</a></nav></footer>
</body>
</html>
';
}

function buildSpotLinks(array $spots, bool $homePage, string $activeId): string
{
    $links = [];
    foreach ($spots as $spot) {
        $id = (string)$spot['id'];
        $slug = (string)$spot['slug'];
        $name = (string)$spot['display_name'];
        $region = (string)($spot['region'] ?? '');
        $href = $homePage
            ? '?spot=' . rawurlencode($id) . '#forecast-title'
            : '../' . rawurlencode($slug) . '/#forecast-title';
        $current = $id === $activeId ? ' aria-current="page"' : '';
        $links[] = '<a class="spot-link" href="' . h($href) . '" data-spot-link="' . h($id) . '"' . $current . '><small>' . h($region) . '</small><strong>' . h($name) . '</strong></a>';
    }
    return implode(PHP_EOL, $links);
}

function buildPermanentLinks(array $spots): string
{
    $links = [];
    foreach ($spots as $spot) {
        $links[] = '<a href="spots/' . rawurlencode((string)$spot['slug']) . '/">' . h((string)$spot['display_name']) . '</a>';
    }
    return implode(PHP_EOL, $links);
}

function contextItem(string $label, string $value): string
{
    return '<div><dt>' . h($label) . '</dt><dd>' . h($value) . '</dd></div>';
}

function buildInfoPage(string $title, string $description, string $heading, string $body): string
{
    return '<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#082331">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description" content="' . h($description) . '">
  <title>' . h($title) . '</title>
  <link rel="stylesheet" href="../styles.css">
</head>
<body>
  <header class="site-header"><a class="brand" href="../" aria-label="関東サーファーKS ホーム"><span class="brand-mark">KS</span><span class="brand-copy">Kanto Surf</span></a></header>
  <main class="info-page"><a class="back-home" href="../">← ホームへ</a><p class="beta-label">KANTO SURFER KS / BETA</p><h1>' . h($heading) . '</h1>' . $body . '</main>
  <footer class="site-footer"><span>KS / KANTO SURFER</span><span>BETA</span><nav class="trust-links" aria-label="サイト情報"><a href="../about/">サイト概要</a><a href="../contact/">お問い合わせ</a><a href="../privacy/">プライバシー</a></nav></footer>
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
