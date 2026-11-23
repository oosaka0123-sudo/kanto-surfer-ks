<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/scripts/tide_jma.php';
$zone=new DateTimeZone('Asia/Tokyo');
$rows=buildShonanTides(dirname(__DIR__) . '/data/tide-jma',new DateTimeImmutable('2026-11-23 00:00:00',$zone),3)['days'];
if(count($rows)!==3)throw new RuntimeException('Expected 3 days, got '.count($rows));
$day=$rows[0];
assert($day['date']==='2026-11-23');
assert(count($day['hourly_cm'])===24);
function findEvent(array $list,string $time,int $height):bool{
 foreach($list as $x){if($x['time']===$time&&$x['height_cm']===$height)return true;}return false;
}
if(!findEvent($day['high'],'04:04',143)||!findEvent($day['high'],'15:04',150)||!findEvent($day['low'],'09:31',81)||!findEvent($day['low'],'22:01',4))throw new RuntimeException('JMA tide format parser regression for 2026-11-23');
$cross=buildShonanTides(dirname(__DIR__).'/data/tide-jma',new DateTimeImmutable('2026-12-31 00:00:00',$zone),3)['days'];
if(count($cross)!==3||$cross[2]['date']!=='2027-01-02')throw new RuntimeException('Year-boundary tide data missing');
echo "PASS: Shonan Port D8 tide heights, extrema, year crossover\n";
