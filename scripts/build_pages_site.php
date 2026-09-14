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

$links = [];
$defaultId = (string)$spots[0]['id'];
$defaultName = (string)$spots[0]['display_name'];
foreach ($spots as $spot) {
    $id = (string)($spot['id'] ?? '');
    $name = (string)($spot['display_name'] ?? $id);
    $region = (string)($spot['region'] ?? '');
    if ($id === '') fail('Representative spot id is empty.');

    $source = rtrim($publicDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $id . '.json';
    copyRequired($source, $outputDir . '/data/' . $id . '.json');
    $links[] = sprintf(
        '<a class="spot-link" href="?spot=%s#forecast-title" data-spot-link="%s"><small>%s</small><strong>%s</strong></a>',
        rawurlencode($id), h($id), h($region), h($name)
    );
}

$publicIndex = rtrim($publicDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.json';
if (is_file($publicIndex)) copyRequired($publicIndex, $outputDir . '/data/index.json');
$spotLinks = implode(PHP_EOL, $links);

$html = '<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#082331">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description" content="関東サーファーKS β版。関東9地点の時間別・週間モデル波予報。">
  <title>関東サーファーKS｜時間別・週間波予報 β</title>
  <link rel="stylesheet" href="styles.css">
  <script defer src="app.js"></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="./" aria-label="関東サーファーKS ホーム"><span class="brand-mark">KS</span><span class="brand-copy">Kanto Surf</span></a>
    <button class="menu-button" type="button" aria-label="メニュー" aria-expanded="false" aria-controls="site-menu"><span></span><span></span><span></span></button>
    <nav class="site-menu" id="site-menu" aria-label="ページメニュー" hidden><a href="#spots">スポット</a><a href="#forecast-title">予報</a><a href="#forecast-note">データについて</a></nav>
  </header>
  <main>
    <section class="beta-intro" id="spots">
      <p class="beta-label">KANTO SURFER KS / BETA</p>
      <h1>関東9地点の波予報</h1>
      <p>Open-Meteoの海洋モデルを使ったβ版です。スポットを選ぶと、時間別と8日間の週間予報を確認できます。</p>
      <nav class="spot-picker" aria-label="予報スポット">' . $spotLinks . '</nav>
    </section>
    <section class="forecast-section" aria-labelledby="forecast-title">
      <p class="current-spot">SPOT <strong data-spot-name>' . h($defaultName) . '</strong></p>
      <div class="section-title"><span class="section-number">04</span><span class="section-icon" aria-hidden="true">⌁</span><h2 id="forecast-title">時間別予報</h2></div>
      <div class="forecast-shell" data-forecast data-data-base="data/" data-default-spot="' . h($defaultId) . '">
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
  <footer class="site-footer"><span>KS / KANTO SURFER</span><span>BETA / MODEL FORECAST</span></footer>
</body>
</html>
';

atomicWrite($outputDir . '/index.html', $html);

$extraCss = "\n.beta-intro{width:min(calc(100% - 36px),var(--max));margin:auto;padding:48px 0 10px}.beta-label,.current-spot{color:var(--wave);font:700 11px/1.5 \"Yu Gothic\",sans-serif;letter-spacing:.12em}.beta-intro h1{margin:8px 0 12px;font-size:clamp(34px,8vw,58px);font-weight:500}.beta-intro>p:not(.beta-label){margin:0;max-width:42rem;color:var(--muted);font:13px/1.9 \"Yu Gothic\",sans-serif}.spot-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:24px}.spot-link{min-width:0;padding:12px 10px;border:1px solid var(--line);color:var(--text);text-decoration:none;background:rgba(5,29,40,.18)}.spot-link small,.spot-link strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spot-link small{color:var(--muted);font:9px/1.5 \"Yu Gothic\",sans-serif}.spot-link strong{margin-top:3px;font-size:14px}.spot-link[aria-current]{border-color:var(--wave);background:var(--soft)}.current-spot{margin:0 0 12px}.current-spot strong{color:var(--text);font-size:15px;margin-left:8px}@media(max-width:520px){.spot-picker{grid-template-columns:repeat(2,minmax(0,1fr))}.beta-intro{padding-top:34px}}\n";
if (file_put_contents($outputDir . '/styles.css', $extraCss, FILE_APPEND | LOCK_EX) === false) {
    fail('Unable to append Pages styles.');
}

fwrite(STDOUT, sprintf("Built Pages beta for %d spots in %s\n", count($spots), $outputDir));

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
