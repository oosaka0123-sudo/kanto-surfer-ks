<?php

declare(strict_types=1);

const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const USER_AGENT = 'kanto-surfer-ks/0.1 (+https://github.com/oosaka0123-sudo/kanto-surfer-ks)';

$projectRoot = dirname(__DIR__);
$configPath = $projectRoot . '/config/representative-spots.json';
$outputDir = $projectRoot . '/data/raw';
$dryRun = in_array('--dry-run', $argv, true);

foreach ($argv as $arg) {
    if (str_starts_with($arg, '--config=')) {
        $configPath = substr($arg, strlen('--config='));
    }
    if (str_starts_with($arg, '--output-dir=')) {
        $outputDir = substr($arg, strlen('--output-dir='));
    }
}

$config = readJsonFile($configPath);
$spots = $config['spots'] ?? null;
if (!is_array($spots) || $spots === []) {
    fail('No spots found in config: ' . $configPath);
}

$timezone = (string)($config['timezone'] ?? 'Asia/Tokyo');

$marineHourly = [
    'wave_height',
    'wave_direction',
    'wave_period',
    'swell_wave_height',
    'swell_wave_direction',
    'swell_wave_period',
    'swell_wave_peak_period',
    'wind_wave_height',
    'wind_wave_direction',
    'wind_wave_period',
];

$weatherHourly = [
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'precipitation',
    'weather_code',
    'temperature_2m',
    'cloud_cover',
];

$result = [
    'schema_version' => 1,
    'generated_at' => gmdate('c'),
    'timezone' => $timezone,
    'source' => [
        'marine' => MARINE_ENDPOINT,
        'weather' => WEATHER_ENDPOINT,
    ],
    'spots' => [],
];

$failures = 0;

foreach ($spots as $spot) {
    validateSpot($spot);

    $id = (string)$spot['id'];
    $latitude = (float)$spot['latitude'];
    $longitude = (float)$spot['longitude'];

    $marineUrl = buildUrl(MARINE_ENDPOINT, [
        'latitude' => $latitude,
        'longitude' => $longitude,
        'hourly' => implode(',', $marineHourly),
        'timezone' => $timezone,
        'forecast_days' => 3,
        'cell_selection' => 'sea',
    ]);

    $weatherBase = [
        'latitude' => $latitude,
        'longitude' => $longitude,
        'hourly' => implode(',', $weatherHourly),
        'timezone' => $timezone,
        'forecast_days' => 3,
        'wind_speed_unit' => 'ms',
    ];

    $weatherLandUrl = buildUrl(WEATHER_ENDPOINT, $weatherBase + [
        'cell_selection' => 'land',
    ]);

    $weatherSeaUrl = buildUrl(WEATHER_ENDPOINT, $weatherBase + [
        'cell_selection' => 'sea',
    ]);

    $entry = [
        'spot' => $spot,
        'request' => [
            'latitude' => $latitude,
            'longitude' => $longitude,
            'marine_url' => $dryRun ? $marineUrl : null,
            'weather_land_url' => $dryRun ? $weatherLandUrl : null,
            'weather_sea_url' => $dryRun ? $weatherSeaUrl : null,
        ],
        'marine' => null,
        'weather_land' => null,
        'weather_sea' => null,
        'errors' => [],
    ];

    if (!$dryRun) {
        foreach ([
            'marine' => $marineUrl,
            'weather_land' => $weatherLandUrl,
            'weather_sea' => $weatherSeaUrl,
        ] as $key => $url) {
            try {
                $entry[$key] = fetchJson($url);
            } catch (Throwable $e) {
                $entry['errors'][$key] = $e->getMessage();
            }
        }

        if ($entry['errors'] !== []) {
            $failures++;
        }
    }

    $result['spots'][$id] = $entry;
}

$json = json_encode(
    $result,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
) . PHP_EOL;

if ($dryRun) {
    fwrite(STDOUT, $json);
    exit(0);
}

ensureDirectory($outputDir);
$stamp = gmdate('Ymd\THis\Z');
$archivePath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $stamp . '.json';
$latestPath = rtrim($outputDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'latest.json';

atomicWrite($archivePath, $json);
atomicWrite($latestPath, $json);

fwrite(STDOUT, sprintf(
    "Saved %d spots to %s (spots with one or more fetch errors: %d)\n",
    count($spots),
    $latestPath,
    $failures
));

exit($failures === count($spots) ? 2 : ($failures > 0 ? 1 : 0));

function buildUrl(string $base, array $params): string
{
    return $base . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function readJsonFile(string $path): array
{
    if (!is_file($path)) {
        fail('Config file not found: ' . $path);
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        fail('Unable to read config: ' . $path);
    }

    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail('Invalid JSON config: ' . $e->getMessage());
    }

    if (!is_array($decoded)) {
        fail('Config root must be a JSON object.');
    }

    return $decoded;
}

function validateSpot(array $spot): void
{
    foreach (['id', 'display_name', 'internal_name', 'latitude', 'longitude'] as $required) {
        if (!array_key_exists($required, $spot)) {
            fail('Spot config is missing required key: ' . $required);
        }
    }

    $lat = (float)$spot['latitude'];
    $lon = (float)$spot['longitude'];
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        fail('Spot config has invalid coordinates for: ' . (string)$spot['id']);
    }
}

function fetchJson(string $url): array
{
    $body = null;
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Unable to initialize cURL.');
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);

        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('HTTP fetch failed: ' . $error);
        }

        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $body = $response;
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 25,
                'ignore_errors' => true,
                'header' => "Accept: application/json\r\nUser-Agent: " . USER_AGENT . "\r\n",
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            throw new RuntimeException('HTTP fetch failed using stream transport.');
        }

        $body = $response;
        $headers = $http_response_header ?? [];
        if (isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $m) === 1) {
            $status = (int)$m[1];
        }
    }

    if ($status !== 200) {
        throw new RuntimeException('Open-Meteo returned HTTP ' . $status . '.');
    }

    try {
        $decoded = json_decode((string)$body, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new RuntimeException('Invalid JSON response: ' . $e->getMessage());
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Open-Meteo response root was not a JSON object.');
    }

    return $decoded;
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

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(2);
}
