<?php

declare(strict_types=1);

$projectRoot = dirname(__DIR__);
$inputPath = $projectRoot . '/data/raw/latest.json';
$outputDir = $projectRoot . '/data/normalized';

foreach ($argv as $arg) {
    if (strpos($arg, '--input=') === 0) {
        $inputPath = substr($arg, strlen('--input='));
    }
    if (strpos($arg, '--output-dir=') === 0) {
        $outputDir = substr($arg, strlen('--output-dir='));
    }
}

$raw = readJsonFile($inputPath);
$spots = $raw['spots'] ?? null;
if (!is_array($spots) || $spots === []) {
    fail('No spots found in raw snapshot: ' . $inputPath);
}

$normalized = [
    'schema_version' => 1,
    'normalized_at' => gmdate('c'),
    'source_generated_at' => $raw['generated_at'] ?? null,
    'source_snapshot' => portablePath($inputPath, $projectRoot),
    'timezone' => $raw['timezone'] ?? 'Asia/Tokyo',
    'spots' => [],
];

foreach ($spots as $spotId => $entry) {
    if (!is_array($entry)) {
        fail('Invalid spot entry for: ' . (string)$spotId);
    }

    $errors = $entry['errors'] ?? [];
    if (is_array($errors) && $errors !== []) {
        fail('Raw snapshot contains fetch errors for ' . (string)$spotId . ': ' . json_encode($errors, JSON_UNESCAPED_UNICODE));
    }

    $marine = requireSource($entry, 'marine', (string)$spotId);
    $weather = requireSource($entry, 'weather_land', (string)$spotId);

    $marineHourly = requireHourly($marine, 'marine', (string)$spotId);
    $weatherHourly = requireHourly($weather, 'weather_land', (string)$spotId);

    $marineTimes = requireTimeArray($marineHourly, 'marine', (string)$spotId);
    $weatherTimes = requireTimeArray($weatherHourly, 'weather_land', (string)$spotId);
    $weatherIndex = buildTimeIndex($weatherTimes, 'weather_land', (string)$spotId);

    $hours = [];
    foreach ($marineTimes as $marineIndex => $time) {
        if (!array_key_exists($time, $weatherIndex)) {
            fail('Weather time missing for ' . (string)$spotId . ': ' . $time);
        }

        $hours[] = [
            'time' => $time,
            'marine' => extractHourlyValues($marineHourly, (int)$marineIndex, 'marine', (string)$spotId),
            'weather_land' => extractHourlyValues($weatherHourly, (int)$weatherIndex[$time], 'weather_land', (string)$spotId),
        ];
    }

    if (count($hours) !== count($weatherTimes)) {
        fail('Marine/weather time count mismatch for ' . (string)$spotId . '.');
    }

    $normalized['spots'][(string)$spotId] = [
        'spot' => $entry['spot'] ?? ['id' => (string)$spotId],
        'grids' => [
            'marine' => gridMetadata($marine),
            'weather_land' => gridMetadata($weather),
        ],
        'units' => [
            'marine' => is_array($marine['hourly_units'] ?? null) ? $marine['hourly_units'] : [],
            'weather_land' => is_array($weather['hourly_units'] ?? null) ? $weather['hourly_units'] : [],
        ],
        'hours' => $hours,
    ];
}

$json = json_encode(
    $normalized,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
) . PHP_EOL;

ensureDirectory($outputDir);
$stamp = gmdate('Ymd\THis\Z');
$archivePath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $stamp . '.json';
$latestPath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'latest.json';

atomicWrite($archivePath, $json);
atomicWrite($latestPath, $json);

fwrite(STDOUT, sprintf(
    "Normalized %d spots to %s\n",
    count($normalized['spots']),
    $latestPath
));

function readJsonFile(string $path): array
{
    if (!is_file($path)) {
        fail('Input file not found: ' . $path);
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        fail('Unable to read input: ' . $path);
    }

    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail('Invalid JSON input: ' . $e->getMessage());
    }

    if (!is_array($decoded)) {
        fail('Input root must be a JSON object.');
    }

    return $decoded;
}

function requireSource(array $entry, string $key, string $spotId): array
{
    $source = $entry[$key] ?? null;
    if (!is_array($source)) {
        fail('Missing ' . $key . ' source for ' . $spotId . '.');
    }
    return $source;
}

function requireHourly(array $source, string $sourceName, string $spotId): array
{
    $hourly = $source['hourly'] ?? null;
    if (!is_array($hourly)) {
        fail('Missing hourly data in ' . $sourceName . ' for ' . $spotId . '.');
    }
    return $hourly;
}

function requireTimeArray(array $hourly, string $sourceName, string $spotId): array
{
    $times = $hourly['time'] ?? null;
    if (!is_array($times) || $times === []) {
        fail('Missing time array in ' . $sourceName . ' for ' . $spotId . '.');
    }

    foreach ($times as $time) {
        if (!is_string($time) || $time === '') {
            fail('Invalid time value in ' . $sourceName . ' for ' . $spotId . '.');
        }
    }

    return $times;
}

function buildTimeIndex(array $times, string $sourceName, string $spotId): array
{
    $index = [];
    foreach ($times as $i => $time) {
        if (array_key_exists($time, $index)) {
            fail('Duplicate time in ' . $sourceName . ' for ' . $spotId . ': ' . $time);
        }
        $index[$time] = (int)$i;
    }
    return $index;
}

function extractHourlyValues(array $hourly, int $index, string $sourceName, string $spotId): array
{
    $values = [];
    foreach ($hourly as $name => $series) {
        if ($name === 'time') {
            continue;
        }
        if (!is_array($series)) {
            continue;
        }
        if (!array_key_exists($index, $series)) {
            fail('Hourly series length mismatch for ' . $sourceName . '/' . $name . ' at ' . $spotId . '.');
        }
        $values[(string)$name] = $series[$index];
    }
    return $values;
}

function gridMetadata(array $source): array
{
    $keys = ['latitude', 'longitude', 'elevation', 'timezone', 'timezone_abbreviation', 'utc_offset_seconds'];
    $metadata = [];
    foreach ($keys as $key) {
        if (array_key_exists($key, $source)) {
            $metadata[$key] = $source[$key];
        }
    }
    return $metadata;
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
