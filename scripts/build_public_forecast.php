<?php

declare(strict_types=1);
require_once __DIR__ . '/tide_jma.php';

const DAILY_WINDOW_START_HOUR = 5;
const DAILY_WINDOW_END_HOUR = 17; // inclusive
const DAILY_WEATHER_HOUR = 11;

$projectRoot = dirname(__DIR__);
$options = parseOptions($argv);
$inputPath = $options['input'] ?? ($projectRoot . '/data/normalized/latest.json');
$outputDir = $options['output-dir'] ?? ($projectRoot . '/data/public');
$validationDir = $options['validation-dir'] ?? ($projectRoot . '/data/validation');
$hourlyHours = isset($options['hourly-hours']) ? (int)$options['hourly-hours'] : 48;
$hourlyStep = isset($options['hourly-step']) ? (int)$options['hourly-step'] : 2;
$weeklyDays = isset($options['weekly-days']) ? (int)$options['weekly-days'] : 8;
$dailyDays = isset($options['daily-days']) ? (int)$options['daily-days'] : 10;

if ($hourlyHours < 1 || $hourlyStep < 1 || $weeklyDays < 1 || $dailyDays < 1) {
    fail('hourly-hours, hourly-step, weekly-days and daily-days must all be >= 1.');
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
    // Only Kugenuma uses 1-hour slots during the UI alignment trial; the other eight stay 2-hour.
    $spotStep = (string)$spotId === 'kugenuma' ? 1 : $hourlyStep;
    // 72h covers 04:00-20:00 of the day after tomorrow, even just after midnight.
    $spotHours = (string)$spotId === 'kugenuma' ? max(72, $hourlyHours) : $hourlyHours;
    $hourly = buildHourly($hours, $now, $tz, $spotHours, $spotStep, (string)$spotId === 'kugenuma');
    $weekly = buildWeekly($hours, $now, $tz, $weeklyDays);
    $daily = buildDaily((string)$spotId, $hours, $now, $tz, $dailyDays, $normalized['source_generated_at'] ?? null);
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
        'daily' => $daily,
        'verified_observations' => $observations,
    ];
    if ((string)$spotId === 'kugenuma') {
        $payload['tide'] = buildShonanTides($projectRoot . '/data/tide-jma', $now, 42);
    }

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

function buildHourly(array $hours, DateTimeImmutable $now, DateTimeZone $tz, int $horizonHours, int $step, bool $includeRain=false): array
{
    $selected = [];
    $limit = $now->modify('+' . $horizonHours . ' hours');
    $futureIndex = 0;
    $previous = [];
    foreach ($hours as $hour) {
        if (!is_array($hour) || !is_string($hour['time'] ?? null)) continue;
        $time = parseLocalTime($hour['time'], $tz);
        if ($time > $limit) break;
        if ($time >= $now) {
            if ($futureIndex % $step === 0) {
                $row = publicRow($hour, $time);
                if ($includeRain) {
                    $sum = 0.0;
                    $complete = true;
                    // Open-Meteo precipitation is the sum during the preceding hour.
                    for ($back=0; $back<$step; $back++) {
                        $entry = $back===0 ? $hour : ($previous[$time->getTimestamp()-3600*$back] ?? null);
                        $value = is_array($entry) && is_array($entry['weather_land'] ?? null) ? nonNegativeNumber($entry['weather_land']['precipitation'] ?? null) : null;
                        if ($value===null) {$complete=false;break;}
                        $sum += $value;
                    }
                    if ($step === 1) {
                        $row['precipitation_1h_mm'] = $complete ? round($sum,2) : null;
                    } else {
                        $row['precipitation_2h_mm'] = $complete ? round($sum,2) : null;
                    }
                }
                $selected[] = $row;
            }
            $futureIndex++;
        }
        $previous[$time->getTimestamp()] = $hour;
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

/**
 * Backend daily aggregation over the 05:00-17:00 JST window (inclusive).
 * A metric is emitted only when every hourly sample in the window is present and numeric;
 * otherwise it is null. No interpolation, no neighbour-day fill, no model daily aggregates.
 */
function buildDaily(string $spotId, array $hours, DateTimeImmutable $now, DateTimeZone $tz, int $days, $sourceGeneratedAt): array
{
    $byKey = [];
    foreach ($hours as $hour) {
        if (!is_array($hour) || !is_string($hour['time'] ?? null)) continue;
        $time = parseLocalTime($hour['time'], $tz);
        if ((int)$time->format('i') !== 0) continue;
        $byKey[$time->format('Y-m-d H')] = $hour;
    }

    $windowSize = DAILY_WINDOW_END_HOUR - DAILY_WINDOW_START_HOUR + 1;
    $start = $now->setTime(0, 0, 0);
    $rows = [];
    for ($i = 0; $i < $days; $i++) {
        $day = $start->modify('+' . $i . ' days');
        $date = $day->format('Y-m-d');
        $waves = [];
        $speeds = [];
        $pairs = [];
        for ($h = DAILY_WINDOW_START_HOUR; $h <= DAILY_WINDOW_END_HOUR; $h++) {
            $hour = $byKey[$date . ' ' . sprintf('%02d', $h)] ?? null;
            $marine = is_array($hour['marine'] ?? null) ? $hour['marine'] : [];
            $weather = is_array($hour['weather_land'] ?? null) ? $hour['weather_land'] : [];
            $wave = nonNegativeNumber($marine['wave_height'] ?? null);
            if ($wave !== null) $waves[] = $wave;
            $speed = nonNegativeNumber($weather['wind_speed_10m'] ?? null);
            if ($speed !== null) $speeds[] = $speed;
            $direction = nullableNumber($weather['wind_direction_10m'] ?? null);
            if ($speed !== null && $direction !== null) $pairs[] = [$speed, $direction];
        }

        $waveComplete = count($waves) === $windowSize;
        $windComplete = count($speeds) === $windowSize;
        $directionDeg = count($pairs) === $windowSize ? vectorMeanDirection($pairs) : null;

        $weatherHour = $byKey[$date . ' ' . sprintf('%02d', DAILY_WEATHER_HOUR)] ?? null;
        $weatherRaw = is_array($weatherHour['weather_land'] ?? null) ? ($weatherHour['weather_land']['weather_code'] ?? null) : null;
        $weatherCode = is_numeric($weatherRaw) && (float)$weatherRaw == (int)$weatherRaw ? (int)$weatherRaw : null;

        $waveMin = $waveComplete ? round(min($waves), 2) : null;
        $waveMax = $waveComplete ? round(max($waves), 2) : null;
        $windMean = $windComplete ? round(array_sum($speeds) / $windowSize, 2) : null;
        $directionLabel = $directionDeg === null ? null : directionLabel8($directionDeg);
        $judgment = buildDailyJudgment($spotId, $waveMin, $waveMax, $windMean, $directionLabel);

        $rows[] = [
            'date' => $date,
            'weekday' => (int)$day->format('w'),
            'model_wave_height_min_m' => $waveMin,
            'model_wave_height_max_m' => $waveMax,
            'wind_speed_mean_ms' => $windMean,
            'wind_direction_mean_deg' => $directionDeg,
            'wind_direction_label' => $directionLabel,
            'weather_code' => $weatherCode,
            'weather_label' => $weatherCode === null ? null : weatherLabel($weatherCode),
            'wave_samples' => count($waves),
            'wind_samples' => count($speeds),
            'judgment' => $judgment,
        ];
    }

    return [
        'days' => $days,
        'timezone' => $tz->getName(),
        'window_start_hour' => DAILY_WINDOW_START_HOUR,
        'window_end_hour' => DAILY_WINDOW_END_HOUR,
        'weather_hour' => DAILY_WEATHER_HOUR,
        'source_generated_at' => $sourceGeneratedAt,
        'rows' => $rows,
    ];
}

/**
 * Provisional daily judgment for all 9 Kanto spots.
 *
 * The judgment is intentionally model-only and conservative. It uses the backend-aggregated
 * 05:00-17:00 model wave-height maximum plus mean wind speed/direction. Wind classification is
 * spot-specific, based on representative-spots.json. It does not claim actual break size and
 * remains provisional until observation-based calibration is completed.
 */
function buildDailyJudgment(string $spotId, ?float $waveMin, ?float $waveMax, ?float $windMean, ?string $windDirectionLabel): array
{
    $pending = ['status' => 'pending', 'label' => '検証中', 'emoji' => null, 'stars' => null];
    if ($waveMin === null || $waveMax === null || $windMean === null || $windDirectionLabel === null) {
        return $pending;
    }

    $windConfig = [
        'kugenuma' => [
            'offshore' => ['北', '北東'],
            'onshore' => ['南東', '南', '南西'],
        ],
        'yuigahama' => [
            'offshore' => ['北', '北東'],
            'onshore' => ['南東', '南', '南西'],
        ],
        'oarai_onuki' => [
            'offshore' => ['北西'],
            'onshore' => ['東', '南東', '南'],
        ],
        'kashima_hirai' => [
            'offshore' => ['南西'],
            'onshore' => ['北', '北東', '東'],
        ],
        'katakai' => [
            'offshore' => ['北', '北西'],
            'onshore' => ['東', '南東', '南'],
        ],
        'ichinomiya' => [
            'offshore' => ['西'],
            'onshore' => ['北東', '東', '南東'],
        ],
        'taito' => [
            'offshore' => ['南', '南西', '西'],
            'onshore' => ['北', '北東', '東'],
        ],
        'onjuku' => [
            'offshore' => ['北', '北西', '西'],
            'onshore' => ['東', '南東', '南'],
        ],
        'kamogawa_maruki' => [
            'offshore' => ['北', '北西'],
            'onshore' => ['東', '南東', '南'],
        ],
    ];

    $cfg = $windConfig[$spotId] ?? null;
    if ($cfg === null) return $pending;

    if ($waveMax < 0.20) {
        $baseStars = 1.0;
    } elseif ($waveMax < 0.40) {
        $baseStars = 2.0;
    } elseif ($waveMax < 0.70) {
        $baseStars = 3.0;
    } elseif ($waveMax < 1.20) {
        $baseStars = 4.0;
    } elseif ($waveMax < 1.80) {
        $baseStars = 5.0;
    } elseif ($waveMax < 2.50) {
        $baseStars = 4.0;
    } else {
        $baseStars = 3.0;
    }

    $offshore = in_array($windDirectionLabel, $cfg['offshore'], true);
    $onshore = in_array($windDirectionLabel, $cfg['onshore'], true);

    if ($windMean < 1.5) {
        $windMultiplier = 1.0;
    } elseif ($offshore) {
        $windMultiplier = $windMean < 4.0 ? 1.0 : ($windMean < 7.0 ? 0.9 : ($windMean < 10.0 ? 0.75 : 0.6));
    } elseif ($onshore) {
        $windMultiplier = $windMean < 3.0 ? 0.8 : ($windMean < 5.0 ? 0.55 : ($windMean < 8.0 ? 0.30 : 0.15));
    } else {
        $windMultiplier = $windMean < 3.0 ? 0.9 : ($windMean < 6.0 ? 0.75 : ($windMean < 9.0 ? 0.60 : 0.40));
    }

    $stars = (int)round($baseStars * $windMultiplier);
    $stars = max(1, min(5, $stars));

    $labels = [1 => '諦めよ', 2 => '微妙', 3 => 'できそう', 4 => '良さそう', 5 => 'かなり良い'];
    $emojis = [1 => '😴', 2 => '🤔', 3 => '🙂', 4 => '😄', 5 => '🔥'];

    return [
        'status' => 'provisional',
        'label' => $labels[$stars],
        'emoji' => $emojis[$stars],
        'stars' => $stars,
    ];
}

/** Speed-weighted vector mean of meteorological "from" directions. Returns 0..359 integer or null. */
function vectorMeanDirection(array $pairs): ?int
{
    $sumX = 0.0;
    $sumY = 0.0;
    $weight = 0.0;
    foreach ($pairs as [$speed, $direction]) {
        $rad = deg2rad($direction);
        $sumX += sin($rad) * $speed;
        $sumY += cos($rad) * $speed;
        $weight += $speed;
    }
    if ($weight <= 0.0) return null;
    if (sqrt($sumX * $sumX + $sumY * $sumY) < 0.01) return null;
    $deg = fmod(rad2deg(atan2($sumX, $sumY)) + 360.0, 360.0);
    return ((int)round($deg)) % 360;
}

function directionLabel8(int $degrees): string
{
    $labels = ['北','北東','東','南東','南','南西','西','北西'];
    return $labels[((int)round($degrees / 45)) % 8];
}

function nonNegativeNumber($value): ?float
{
    if (!is_numeric($value)) return null;
    $number = (float)$value;
    return $number >= 0.0 ? $number : null;
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
        'temperature_c' => nullableNumber($weather['temperature_2m'] ?? null),
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