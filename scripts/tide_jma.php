<?php
declare(strict_types=1);

/**
 * JMA astronomical tide predictions. Official fixed-width daily annual text data;
 * heights in cm above that station's tide table datum.
 * https://www.data.jma.go.jp/kaiyou/db/tide/suisan/readme.html
 * Never mix with Open-Meteo MSL heights or present as break-local observed tide.
 * Never interpolate missing days.
 */
function buildJmaTides(string $sourceDir, string $stationId, string $stationName, DateTimeImmutable $from, int $days = 42): array
{
    if (!preg_match('/^[A-Z0-9]{2}$/', $stationId) || trim($stationName) === '') {
        throw new InvalidArgumentException('Invalid JMA tide station');
    }
    $start = $from->setTimezone(new DateTimeZone('Asia/Tokyo'))->setTime(0, 0);
    $wanted = [];
    for ($i=0; $i<$days; $i++) {
        $wanted[$start->modify("+$i days")->format('Y-m-d')] = true;
    }
    $rows = [];
    foreach (array_unique(array_map(static fn(string $date): string => substr($date,0,4), array_keys($wanted))) as $year) {
        $file = rtrim($sourceDir,'/\\') . DIRECTORY_SEPARATOR . "$stationId-$year.txt";
        if (!is_file($file)) continue;
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (strlen($line) < 136 || substr($line,78,2) !== $stationId) continue;
            $y = (int)trim(substr($line,72,2)) + 2000;
            $m = (int)trim(substr($line,74,2));
            $d = (int)trim(substr($line,76,2));
            if (!checkdate($m,$d,$y)) continue;
            $date = sprintf('%04d-%02d-%02d',$y,$m,$d);
            if (!isset($wanted[$date])) continue;
            $levels = [];
            for ($hour=0; $hour<24; $hour++) {
                $raw=trim(substr($line,$hour*3,3));
                $levels[] = preg_match('/^-?\d+$/',$raw) ? (int)$raw : null;
            }
            $events = ['high'=>[],'low'=>[]];
            foreach (['high'=>80,'low'=>108] as $kind=>$offset) {
                for ($j=0;$j<4;$j++) {
                    $pair=substr($line,$offset+$j*7,7);
                    $rawTime=str_replace(' ', '0', substr($pair,0,4));
                    $rawLevel=trim(substr($pair,4,3));
                    if ($rawTime==='9999' || $rawLevel==='999' || !preg_match('/^\d+$/',$rawTime) || !preg_match('/^-?\d+$/',$rawLevel)) continue;
                    $hh=(int)floor((int)$rawTime/100);$mm=(int)$rawTime%100;
                    if ($hh>=24 || $mm>=60) continue;
                    $events[$kind][]=['time'=>sprintf('%02d:%02d',$hh,$mm),'height_cm'=>(int)$rawLevel];
                }
            }
            if(count(array_filter($levels,static fn($x)=>$x!==null))!==24)continue;
            $rows[$date] = ['date'=>$date,'hourly_cm'=>$levels,'high'=>$events['high'],'low'=>$events['low']];
        }
    }
    ksort($rows);
    return [
        'station'=>$stationName,
        'station_id'=>$stationId,
        'datum'=>'気象庁潮位表基準面',
        'unit'=>'cm',
        'timezone'=>'Asia/Tokyo',
        'source'=>'気象庁・潮位表（天文潮位予測）',
        'source_url'=>'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=' . rawurlencode($stationId),
        'days'=>array_values($rows),
    ];
}

/** Backwards-compatible API used by Kugenuma and Yuigahama. */
function buildShonanTides(string $sourceDir, DateTimeImmutable $from, int $days = 42): array
{
    return buildJmaTides($sourceDir, 'D8', '湘南港', $from, $days);
}
