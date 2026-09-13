<?php

declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$options = parseOptions($argv);

$inputPath = $options['input'] ?? ($projectRoot . '/data/normalized/latest.json');
$outputDir = $options['output-dir'] ?? ($projectRoot . '/data/validation');
$spotId = requiredOption($options, 'spot');
$observedAtRaw = requiredOption($options, 'observed-at');
$provider = requiredOption($options, 'source-provider');
$sourceKind = requiredOption($options, 'source-kind');
$maxGapMinutes = isset($options['max-gap-minutes']) ? (int)$options['max-gap-minutes'] : 90;

$allowedKinds = ['public_live', 'commercial_live', 'wave_report', 'manual_visual', 'other'];
if (!in_array($sourceKind, $allowedKinds, true)) {
    fail('Invalid --source-kind. Allowed: ' . implode(', ', $allowedKinds));
}
if ($maxGapMinutes < 0) {
    fail('--max-gap-minutes must be >= 0.');
}
if (!preg_match('/(?:Z|[+-]\d{2}:\d{2})$/', $observedAtRaw)) {
    fail('--observed-at must include an explicit timezone offset, e.g. 2026-09-13T12:00:00+09:00 or Z.');
}

try {
    $observedAt = new DateTimeImmutable($observedAtRaw);
} catch (Exception $e) {
    fail('Invalid --observed-at: ' . $e->getMessage());
}

$normalized = readJsonFile($inputPath);
$timezoneName = is_string($normalized['timezone'] ?? null) ? $normalized['timezone'] : 'Asia/Tokyo';
try {
    $forecastTimezone = new DateTimeZone($timezoneName);
} catch (Exception $e) {
    fail('Invalid normalized timezone: ' . $timezoneName);
}

$spots = $normalized['spots'] ?? null;
if (!is_array($spots) || !isset($spots[$spotId]) || !is_array($spots[$spotId])) {
    fail('Spot not found in normalized snapshot: ' . $spotId);
}
$spot = $spots[$spotId];
$hours = $spot['hours'] ?? null;
if (!is_array($hours) || $hours === []) {
    fail('No normalized hourly rows for spot: ' . $spotId);
}

$nearest = null;
$nearestGapSeconds = null;
foreach ($hours as $hour) {
    if (!is_array($hour) || !is_string($hour['time'] ?? null)) {
        continue;
    }
    try {
        $forecastTime = new DateTimeImmutable($hour['time'], $forecastTimezone);
    } catch (Exception $e) {
        fail('Invalid normalized forecast time for ' . $spotId . ': ' . (string)$hour['time']);
    }
    $gap = abs($forecastTime->getTimestamp() - $observedAt->getTimestamp());
    if ($nearestGapSeconds === null || $gap < $nearestGapSeconds) {
        $nearestGapSeconds = $gap;
        $nearest = [
            'time' => $forecastTime,
            'hour' => $hour,
        ];
    }
}

if ($nearest === null || $nearestGapSeconds === null) {
    fail('Unable to find a usable forecast hour for ' . $spotId . '.');
}

$gapMinutes = (int)round($nearestGapSeconds / 60);
if ($gapMinutes > $maxGapMinutes) {
    fail(sprintf(
        'Nearest forecast hour is %d minutes away, exceeding --max-gap-minutes=%d.',
        $gapMinutes,
        $maxGapMinutes
    ));
}

$forecastTimeIso = $nearest['time']->format('c');
$observation = [
    'wave_size_label' => nullableString($options, 'wave-size'),
    'wind_direction_label' => nullableString($options, 'wind-direction'),
    'wind_speed_mps' => nullableFloat($options, 'wind-speed'),
    'reference_score' => nullableFloat($options, 'reference-score'),
    'visual_note' => nullableString($options, 'visual-note'),
    'sources' => [[
        'provider' => $provider,
        'kind' => $sourceKind,
        'observed_at' => $observedAt->format('c'),
        'note' => nullableString($options, 'source-note'),
    ]],
];

if ($observation['wind_speed_mps'] !== null && $observation['wind_speed_mps'] < 0) {
    fail('--wind-speed must be >= 0.');
}
if ($observation['reference_score'] !== null && ($observation['reference_score'] < 0 || $observation['reference_score'] > 100)) {
    fail('--reference-score must be between 0 and 100.');
}

$crossCheck = [
    'api_integrity' => [
        'status' => 'pass',
        'note' => sprintf('Nearest normalized forecast hour matched within %d minutes.', $gapMinutes),
    ],
    'observation_alignment' => [
        'status' => 'warn',
        'independent_source_count' => 1,
        'note' => 'Only one observation source is attached. Add an independent second source before public adoption where available.',
    ],
    'spot_context' => [
        'status' => 'pending',
        'note' => 'Point-specific exposure/shelter/coast-orientation review has not been signed off yet.',
    ],
    'overall_status' => 'pending',
    'review_note' => 'Public wave display must not treat this record as verified until all three checks pass.',
];

$record = [
    'schema_version' => 1,
    'observed_at' => $observedAt->format('c'),
    'spot_id' => $spotId,
    'raw_snapshot' => is_string($normalized['source_snapshot'] ?? null) ? $normalized['source_snapshot'] : '',
    'normalized_snapshot' => portablePath($inputPath, $projectRoot),
    'forecast_time' => $forecastTimeIso,
    'forecast_gap_minutes' => $gapMinutes,
    'model' => [
        'grids' => is_array($spot['grids'] ?? null) ? $spot['grids'] : [],
        'marine' => is_array($nearest['hour']['marine'] ?? null) ? $nearest['hour']['marine'] : [],
        'weather_land' => is_array($nearest['hour']['weather_land'] ?? null) ? $nearest['hour']['weather_land'] : [],
    ],
    'observation' => $observation,
    'cross_check' => $crossCheck,
    'ks_prediction' => null,
    'difference_note' => null,
];

if ($record['raw_snapshot'] === '') {
    fail('Normalized snapshot does not contain source_snapshot. Re-run normalization with the current pipeline.');
}

$json = json_encode(
    $record,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
) . PHP_EOL;

ensureDirectory($outputDir);
$stamp = $observedAt->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
$filename = $stamp . '_' . preg_replace('/[^a-zA-Z0-9._-]+/', '_', $spotId) . '.json';
$outputPath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
atomicWrite($outputPath, $json);

fwrite(STDOUT, sprintf(
    "Created validation record: %s\nForecast time: %s\nGap: %d minutes\nCross-check: %s\n",
    $outputPath,
    $forecastTimeIso,
    $gapMinutes,
    $crossCheck['overall_status']
));

function parseOptions(array $argv): array
{
    $options = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--') !== 0) {
            continue;
        }
        $pair = substr($arg, 2);
        $equals = strpos($pair, '=');
        if ($equals === false) {
            $options[$pair] = '1';
            continue;
        }
        $options[substr($pair, 0, $equals)] = substr($pair, $equals + 1);
    }
    return $options;
}

function requiredOption(array $options, string $key): string
{
    $value = $options[$key] ?? null;
    if (!is_string($value) || trim($value) === '') {
        fail('Missing required option --' . $key . '=...');
    }
    return trim($value);
}

function nullableString(array $options, string $key): ?string
{
    if (!array_key_exists($key, $options)) {
        return null;
    }
    $value = trim((string)$options[$key]);
    return $value === '' ? null : $value;
}

function nullableFloat(array $options, string $key): ?float
{
    if (!array_key_exists($key, $options) || $options[$key] === '') {
        return null;
    }
    if (!is_numeric($options[$key])) {
        fail('--' . $key . ' must be numeric.');
    }
    return (float)$options[$key];
}

function readJsonFile(string $path): array
{
    if (!is_file($path)) {
        fail('Input file not found: ' . $path);
    }
    $contents = file_get_contents($path);
    if ($contents === false) {
        fail('Unable to read input: ' . $path);
    }
    try {
        $decoded = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail('Invalid JSON input: ' . $e->getMessage());
    }
    if (!is_array($decoded)) {
        fail('Input root must be a JSON object.');
    }
    return $decoded;
}

function portablePath(string $path, string $projectRoot): string
{
    $normalizedPath = str_replace('\\', '/', $path);
    $normalizedRoot = rtrim(str_replace('\\', '/', $projectRoot), '/');
    if (strpos($normalizedPath, $normalizedRoot . '/') === 0) {
        return substr($normalizedPath, strlen($normalizedRoot) + 1);
    }
    return basename($normalizedPath);
}

function ensureDirectory(string $path): void
{
    if (is_dir($path)) {
        return;
    }
    if (!mkdir($path, 0775, true) && !is_dir($path)) {
        fail('Unable to create output directory: ' . $path);
    }
}

function atomicWrite(string $path, string $contents): void
{
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $contents, LOCK_EX) === false) {
        fail('Unable to write temporary output: ' . $tmp);
    }
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        fail('Unable to move output into place: ' . $path);
    }
}

function fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(2);
}
