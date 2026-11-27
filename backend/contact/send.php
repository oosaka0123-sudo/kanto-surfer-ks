<?php
declare(strict_types=1);
define('KS_CONTACT_ENTRY',true);
require __DIR__.'/common.php';

if (($_SERVER['REQUEST_METHOD']??'')!=='POST') {
    header('Allow: POST');
    ksReply(['success'=>false,'error'=>'フォームから送信してください。'],405);
}
if ((int)($_SERVER['CONTENT_LENGTH']??0)>16384) {
    ksReply(['success'=>false,'error'=>'送信内容が長すぎます。'],413);
}
$origin=(string)($_SERVER['HTTP_ORIGIN']??'');
if ($origin!=='' && $origin!=='https://kanto.rss7.net' && !(ksTestMode()&&preg_match('~^http://127\.0\.0\.1:[0-9]+$~',$origin))) {
    ksReply(['success'=>false,'error'=>'アクセス元を確認できません。'],403);
}
ksSession();
$challenge=$_SESSION['ks_contact_challenge']??null;
unset($_SESSION['ks_contact_challenge']); // One-use token, even on failed submissions.
session_write_close();

$token=ksText('token');
$answer=ksText('captcha');
if (!is_array($challenge)
    || !isset($challenge['token'],$challenge['answer'],$challenge['created'])
    || !is_string($challenge['token'])
    || !hash_equals($challenge['token'],$token)
    || !ctype_digit($answer)
    || (int)$answer!==(int)$challenge['answer']
    || time()-(int)$challenge['created']>600
    || time()-(int)$challenge['created']<2
) {
    ksReply(['success'=>false,'error'=>'計算問題の確認に失敗しました。新しい問題に回答してください。'],422);
}
if (ksText('website')!=='') {
    ksReply(['success'=>false,'error'=>'入力内容を確認してください。'],422);
}
$purpose=ksText('purpose');
$choices=[
    'opinion'=>'サイトへのご意見・改善提案',
    'spot'=>'スポット情報の追加・修正リクエスト',
    'sponsor'=>'スポンサー・広告掲載のご相談',
    'business'=>'業務提携・取材のご依頼',
    'other'=>'その他のお問い合わせ',
];
$name=ksText('name');
$email=ksText('email');
$phone=ksText('phone');
$message=ksText('message');
if (!isset($choices[$purpose])
    || $name===''||ksLength($name)>50||strpbrk($name,"\r\n")!==false
    || $email===''||strlen($email)>120||preg_match('/[\r\n]/',$email)
    || !filter_var($email,FILTER_VALIDATE_EMAIL)
    || strlen($phone)>30||($phone!==''&&!preg_match('/^[0-9 +().-]+$/D',$phone))
    || $message===''||ksLength($message)>2000||strlen($message)>11000
) {
    ksReply(['success'=>false,'error'=>'必須項目、メールアドレス、文字数を確認してください。'],422);
}
$ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
if (!ksLimit($ip)) {
    ksReply(['success'=>false,'error'=>'一定時間内の送信回数が上限に達しました。時間をおいてお試しください。'],429);
}

// Replaced at deployment from Kansai's already configured recipient/sender.
// The public repository intentionally does not contain operational mail addresses.
$to='__KS_CONTACT_TO__';
$from='__KS_CONTACT_FROM__';
if (!filter_var($to,FILTER_VALIDATE_EMAIL)||!filter_var($from,FILTER_VALIDATE_EMAIL)) {
    error_log('[kanto-contact] mail configuration is missing');
    ksReply(['success'=>false,'error'=>'ただいまメール送信をご利用いただけません。公式SNSからご連絡ください。'],503);
}

$subject='【関東サーファーKS】お問い合わせ：'.$choices[$purpose];
$body="関東サーファーKSへのお問い合わせ\n"
    ."種別：".$choices[$purpose]."\n"
    ."お名前：".$name."\n"
    ."メールアドレス：".$email."\n"
    ."電話番号：".($phone!==''?$phone:'未入力')."\n"
    ."受信日時（JST）：".(new DateTimeImmutable('now',new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s')."\n"
    ."----------------------------------------\n"
    .$message."\n";
$headers='From: '.$from."\r\nReply-To: ".$email."\r\n"
        ."MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8";
$test=ksTestMode();
if (function_exists('mb_language')) {
    mb_language('uni'); // Match the UTF-8 MIME header instead of ISO-2022-JP.
    mb_internal_encoding('UTF-8');
}
$accepted=$test?true:(
    function_exists('mb_send_mail')
        ? @mb_send_mail($to,$subject,$body,$headers)
        : @mail($to,'=?UTF-8?B?'.base64_encode($subject).'?=',$body,$headers)
);
if (!$accepted) {
    error_log('[kanto-contact] admin mail rejected by server mail transport');
    ksReply(['success'=>false,'error'=>'メールを送信できませんでした。時間をおいて再度お試しください。'],503);
}

// Best-effort acknowledgement, matching the Kansai site. It is not evidence of delivery.
if (!$test) {
    $autoSubject='【関東サーファーKS】お問い合わせ受付のお知らせ';
    $autoBody=$name." 様\n\n関東サーファーKSへのお問い合わせを受け付けました。"
        ."\n確認のうえ必要に応じてご返信いたします。\n\n"
        ."お問い合わせ種別：".$choices[$purpose]."\n"
        ."内容：\n".$message."\n\n"
        ."※このメールは自動送信です。緊急の救助・事故対応はできません。\n";
    $autoHeaders='From: '.$from."\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8";
    if (function_exists('mb_send_mail')) {
        @mb_send_mail($email,$autoSubject,$autoBody,$autoHeaders);
    } else {
        @mail($email,'=?UTF-8?B?'.base64_encode($autoSubject).'?=',$autoBody,$autoHeaders);
    }
}
ksReply(['success'=>true,'message'=>'お問い合わせを受け付けました。メールの配信には時間がかかる場合があります。']);
