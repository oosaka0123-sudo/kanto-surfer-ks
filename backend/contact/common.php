<?php
declare(strict_types=1);
// Called only by challenge.php and send.php. Never publish private mail config in the repository.
if (!defined('KS_CONTACT_ENTRY')) { http_response_code(404); exit; }

ini_set('display_errors', '0');

function ksReply(array $payload, int $status=200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, private, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function ksSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('KS_KANTO_CONTACT');
    $host=(string)($_SERVER['HTTP_HOST']??'');
    $secure=($host==='kanto.rss7.net'||str_starts_with($host,'kanto.rss7.net:'));
    session_set_cookie_params([
      'lifetime'=>0,'path'=>'/contact/','secure'=>$secure,
      'httponly'=>true,'samesite'=>'Lax',
    ]);
    if (!session_start()) ksReply(['success'=>false,'error'=>'現在フォームをご利用いただけません。時間をおいてお試しください。'],503);
}

function ksText(string $key): string {
    $v=$_POST[$key]??'';
    return is_string($v) ? trim($v) : '';
}
function ksLength(string $text): int {
    return function_exists('mb_strlen')?mb_strlen($text,'UTF-8'):strlen($text);
}
function ksTestMode(): bool {
    return PHP_SAPI==='cli-server' && getenv('KS_CONTACT_TEST_MODE')==='1';
}
function ksLimit(string $ip): bool {
    // Per-IP hashed identifiers and timestamps only. No message/email data stored here.
    $dir=rtrim(sys_get_temp_dir(),DIRECTORY_SEPARATOR).'/ks-kanto-contact-limit';
    if (!is_dir($dir) && !@mkdir($dir,0700,true) && !is_dir($dir)) return false;
    $name=hash('sha256','ks-kanto-v1|'.$ip);
    $file=@fopen($dir.'/'.$name.'.json','c+');
    if (!$file) return false;
    if (!flock($file,LOCK_EX)) { fclose($file);return false; }
    rewind($file);
    $old=json_decode((string)stream_get_contents($file),true);
    $history=is_array($old)?array_values(array_filter($old,static fn($t):bool=>is_int($t)&&$t>time()-3600)):[];
    if (count($history)>=5) { flock($file,LOCK_UN);fclose($file);return false; }
    $history[]=time();
    rewind($file);
    ftruncate($file,0);
    $ok=fwrite($file,json_encode($history))!==false;
    fflush($file);
    flock($file,LOCK_UN);
    fclose($file);
    return $ok;
}
