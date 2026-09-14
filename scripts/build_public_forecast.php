<?php

declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$options = parseOptions($argv);
$inputPath = $options['input'] ?? ($projectRoot . '/data/normalized/latest.json');
$outputDir = $options['output-dir'] ?? ($projectRoot . '/data/public');
$validationDir = $options['validation-dir'] ?? ($projectRoot . '/data/validation');
$hourlyHours = isset($options['hourly-hours']) ? (int)$options['hourly-hours'] : 48;
$hourlyStep = isset($options['hourly-step']) ? (int)$options['hourly-step'] : 2;
$weeklyDays = isset($options['weekly-days']) ? (int)$options['weekly-days'] : 8;

if ($hourlyHours < 1 || $hourlyStep < 1 || $weeklyDays < 1) {
    fail('hourly-hours, hourly-step and weekly-days must all be >= 1.');
}

$normalized = readJson($inputPath);
$timezoneName = is_string($normalized['timezone'] ?? null) ? $normalized['timezone'] : 'Asia/Tokyo';
try {
    $tz = new DateTimeZone($timezoneName);
} catch (Exception $e) {
    fail('Invalid timezone: ' . $timezoneName);
}

$now = new DateTimeImmutable('now', $tz);
$verified = loadVerifiedObservations($validationDir);
$spots = $normalized['spots'] ?? null;
if (!is_array($spots) || $spots === []) {
    fail('No spots found in normalized snapshot.');
}
ensureDirectory($outputDir);
$index = [
    'schema_version' => 'public-forecast/1.0',
    'generated_at' => gmdate('c'),
    'timezone' => $timezoneName,
    'spots' => [],
];

foreach ($spots as $spotId => $spotEntry) {
    if (!is_array($spotEntry)) {
        fail('Invalid normalized spot entry: ' . (string)$spotId);
    }
    $hours = $spotEntry['hours'] ?? null;
    if (!is_array($hours) || $hours === []) {
        fail('No hourly rows for: ' . (string)$spotId);
    }

    $spotMeta = is_array($spotEntry['spot'] ?? null) ? $spotEntry['spot'] : ['id' => (string)$spotId];
    $hourly = buildHourly($hours, $now, $tz, $hourlyHours, $hourlyStep);
    $weekly = buildWeekly($hours, $now, $tz, $weeklyDays);
    $observations = $verified[(string)$spotId] ?? [];

    $payload = [
        'schema_version' => 'public-forecast/1.0',
        'generated_at' => gmdate('c'),
        'source_generated_at' => $normalized['source_generated_at'] ?? null,
        'timezone' => $timezoneName,
        'spot' => [
            'id' => (string)$spotId,
            'name' => $spotMeta['display_name'] ?? (string)$spotId,
            'area' => $spotMeta['region'] ?? '',
        ],
        'status' => $observations === [] ? 'model_only' : 'model_plus_verified_observation',
        'wave_metric_label' => 'モデル波高',
        'model_notice' => 'Open-Meteoの海洋モデル波高です。実際のブレイクサイズを直接示す値ではありません。',
        'hourly' => $hourly,
        'weekly' => $weekly,
        'verified_observations' => $observations,
    ];

    $path = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $spotId . '.json';
    atomicWrite($path, encodeJson($payload));
    $index['spots'][] = [
        'id' => (string)$spotId,
        'name' => $payload['spot']['name'],
        'area' => $payload['spot']['area'],
        'path' => basename($path),
        'status' => $payload['status'],
    ];
}

atomicWrite(rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.json', encodeJson($index));
fwrite(STDOUT, sprintf("Built public forecast payloads for %d spots in %s\n", count($index['spots']), $outputDir));

function buildHourly(array $hours, DateTimeImmutable $now, DateTimeZone $tz, int $horizonHours, int $step): array
{
    $selected = [];
    $limit = $now->modify('+' . $horizonHours . ' hours');
    $futureIndex = 0;
    foreach ($hours as $hour) {
        if (!is_array($hour) || !is_string($hour['time'] ?? null)) continue;
        $time = parseLocalTime($hour['time'], $tz);
        if ($time < $now || $time > $limit) continue;
        if ($futureIndex % $step === 0) $selected[] = publicRow($hour, $time);
        $futureIndex++;
    }
    return $selected;
}

function buildWeekly(array $hours, DateTimeImmutable $now, DateTimeZone $tz, int $days): array
{
    $byDate = [];
    foreach ($hours as $hour) {
        if (!is_array($hour) || !is_string($hour['time'] ?? null)) continue;
        $time = parseLocalTime($hour['time'], $tz);
        $date = $time->format('Y-m-d');
        if ($date < $now->format('Y-m-d')) continue;
        $distance = abs(((int)$time->format('H')) * 60 + (int)$time->format('i') - 720);
        if (!isset($byDate[$date]) || $distance < $byDate[$date]['distance']) {
            $byDate[$date] = ['distance' => $distance, 'row' => publicRow($hour, $time, $date)];
        }
    }
    ksort($byDate);
    return array_slice(array_values(array_map(static fn(array $v): array => $v['row'], $byDate)), 0, $days);
}

function publicRow(array $hour, DateTimeImmutable $time, ?string $date = null): array
{
    $marine = is_array($hour['marine'] ?? null) ? $hour['marine'] : [];
    $weather = is_array($hour['weather_land'] ?? null) ? $hour['weather_land'] : [];
    $period = firstNumeric($marine, ['swell_wave_peak_period', 'swell_wave_period', 'wave_period']);
    $windDir = nullableNumber($weather['wind_direction_10m'] ?? null);
    $row = [
        'time' => $time->format('c'),
        'weather_label' => weatherLabel((int)($weather['weather_code'] ?? -1)),
        'model_wave_height_m' => nullableNumber($marine['wave_height'] ?? null),
        'period_s' => $period,
        'wind_speed_ms' => nullableNumber($weather['wind_speed_10m'] ?? null),
        'wind_gust_ms' => nullableNumber($weather['wind_gusts_10m'] ?? null),
        'wind_direction_label' => $windDir === null ? null : directionLabel($windDir),
        'validation_status' => 'provisional',
    ];
    if ($date !== null) $row['date'] = $date;
    return $row;
}

function loadVerifiedObservations(string $dir): array
{
    $result = [];
    if (!is_dir($dir)) return $result;
    $files = glob(rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.json') ?: [];
    foreach ($files as $file) {
        $record = readJson($file);
        $crossCheck = is_array($record['cross_check'] ?? null) ? $record['cross_check'] : [];
        $independentSourceCount = (int)($crossCheck['observation_alignment']['independent_source_count'] ?? 0);
        $fullyVerified = ($crossCheck['overall_status'] ?? null) === 'pass'
            && ($crossCheck['api_integrity']['status'] ?? null) === 'pass'
            && ($crossCheck['observation_alignment']['status'] ?? null) === 'pass'
            && ($crossCheck['spot_context']['status'] ?? null) === 'pass'
            && $independentSourceCount >= 2;
        if (!$fullyVerified) continue;
        $spotId = $record['spot_id'] ?? null;
        if (!is_string($spotId) || $spotId === '') continue;
        $observation = is_array($record['observation'] ?? null) ? $record['observation'] : [];
        $result[$spotId][] = [
            'observed_at' => $record['observed_at'] ?? null,
            'wave_size_label' => $observation['wave_size_label'] ?? null,
            'wind_direction_label' => $observation['wind_direction_label'] ?? null,
            'wind_speed_ms' => $observation['wind_speed_mps'] ?? null,
            'source_count' => $independentSourceCount,
        ];
    }
    return $result;
}
function parseOptions(array $argv): array
{
    $options = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (strpos($arg, '--') !== 0) continue;
        $pair = substr($arg, 2);
        $equals = strpos($pair, '=');
        if ($equals === false) {
            $options[$pair] = '1';
        } else {
            $options[substr($pair, 0, $equals)] = substr($pair, $equals + 1);
        }
    }
    return $options;
}

function parseLocalTime(string $value, DateTimeZone $tz): DateTimeImmutable
{
    try {
        return new DateTimeImmutable($value, $tz);
    } catch (Exception $e) {
        fail('Invalid normalized forecast time: ' . $value);
    }
}
function nullableNumber($value): ?float
{
    return is_numeric($value) ? (float)$value : null;
}

function firstNumeric(array $values, array $keys): ?float
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $values) && is_numeric($values[$key])) {
            return (float)$values[$key];
        }
    }
    return null;
}

function directionLabel(float $degrees): string
{
    $labels = ['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];
    $normalized = fmod(($degrees + 360.0), 360.0);
    $index = (int)floor(($normalized + 11.25) / 22.5) % 16;
    return $labels[$index];
}

function weatherLabel(int $code): string
{
    if ($code === 0 || $code === 1) return '晴れ';
    if ($code === 2) return '晴れ時々曇り';
    if ($code === 3) return '曇り';
    if (in_array($code, [45,48], true)) return '霧';
    if (in_array($code, [51,53,55,56,57], true)) return '小雨';
    if (in_array($code, [61,63,65,66,67], true)) return '雨';
    if (in_array($code, [71,73,75,77], true)) return '雪';
    if (in_array($code, [80,81,82], true)) return 'にわか雨';
    if (in_array($code, [85,86], true)) return 'にわか雪';
    if (in_array($code, [95,96,99], true)) return '雷雨';
    return '--';
}

function readJson(string $path): array
{
    if (!is_file($path)) fail('JSON file not found: ' . $path);
    $raw = file_get_contents($path);
    if ($raw === false) fail('Unable to read JSON file: ' . $path);
    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail('Invalid JSON: ' . $path . ' / ' . $e->getMessage());
    }
    if (!is_array($decoded)) fail('JSON root must be an object: ' . $path);
    return $decoded;
}

function encodeJson(array $value): string
{
    return json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
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
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        fail('Unable to replace: ' . $path);
    }
}

function fail(string $message): void
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}
