<?php
declare(strict_types=1);
define('KS_CONTACT_ENTRY',true);
require __DIR__.'/common.php';
if (($_SERVER['REQUEST_METHOD']??'')!=='GET') {
    header('Allow: GET');
    ksReply(['success'=>false,'error'=>'許可されていない操作です。'],405);
}
ksSession();
$a=random_int(1,9);
$b=random_int(1,9);
$token=bin2hex(random_bytes(24));
$_SESSION['ks_contact_challenge']=[
    'token'=>$token,
    'answer'=>$a+$b,
    'created'=>time(),
];
session_write_close();
ksReply(['success'=>true,'question'=>"$a + $b = ?",'token'=>$token]);
