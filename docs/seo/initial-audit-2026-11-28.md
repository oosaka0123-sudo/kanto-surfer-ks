# SEO v1 初期監査（2026-11-28 JST）

## 公開サイト実測
- トップ＋代表9地点: HTTP 200、各URLのself-canonical一致。
- sitemap.xml: HTTP 200、13 URL。robots.txt: HTTP 200、Allow /、本番sitemap指定。
- 鵠沼の公開JSON: 取得成功、生成2026-11-28 17:28 JST。ただし単一時点の確認で継続同期の保証はしない。
- Google Search Console既存プロパティのサイトマップ確認済み。アカウント専用の検索実績は公開リポジトリに記載しない。個別URL検査・7/28/90日比較は未完了。
- Bingは現アカウントが権限エラー。未登録と断定せず、重複登録しない（#32）。
- PHPの生成元を変更し、予報データ・ランキング処理・既存URLには触れない。
- Pagesとロリポップ公開は別。#34の定期同期問題と別々に検証する。

## ライブカメラ初期調査（候補であり映像実機稼働・利用規約未確認）
|地点|候補・根拠|要確認|
|---|---|---|
|鵠沼|https://www.pref.kanagawa.jp/docs/f4i/tsunami/p613103.html ; https://livecombs.com/kanagawaken/fujisawa-shi/kugenuma-beach/ |県の藤沢海岸と鵠沼の撮影方向|
|由比ヶ浜|https://guidemaps.net/yuigahama-livecamera/ |材木座側からの映像、一次配信元、現況|
|大洗・大貫|https://www.oarai-info.jp/livecamera/ |公式サンビーチ配信、つるかめ下を映すか|
|鹿嶋・平井|https://www.bcm-surfpatrol.com/newsandreport/detail/29242 |BCM復旧告知、現在の映像・会員条件|
|片貝|https://www.surfers-ocean.com/サーフィン波情報/片貝/ |新堤カメラの一次配信元・現在の稼働|
|一宮|https://www.bcm-surfpatrol.com/livecam/ |北側カメラと代表地点の一致・会員条件|
|太東|https://weathernews.jp/onebox/livecam/kanto/chiba/7CDDE908DF54/ |太東漁港カメラの撮影範囲、対象波が映るか|
|御宿|https://www.surfers-ocean.com/サーフィン波情報/御宿/ |岩和田と中央を区別、中央の現役配信確認|
|鴨川・マルキ|https://www.bcm-surfpatrol.com/newsandreport/detail/29275 |BCM追加アングル告知、現在の映像・会員条件|

A/B/C/Dの最終分類は、現役配信・提供形態・対象海岸・規約の確認後。現段階では埋め込みを追加しない。

## 競合予備調査
9地点の複合検索でBCM、1173life、Surfers’ Ocean、Surf-OK、SURFAREA、UNERIO等を確認。
- BCM: 地点別観測・波概況。現地観測を提供できないKSはモデル値の明示を維持。
- 1173life: 無料日次情報とカメラ導線。KSは10日予報・潮位・地点固有説明の利便性を検証。
- Surfers’ Ocean: カメラの撮影地点と方向の案内。KSも一次配信元と対象地点を明示。
- Surf-OK: 時間別予報とレベル別ガイド。KSは予測根拠、更新時刻、風・潮位と海岸特性の整合を強化。
これはGoogle日本の27クエリ×10件の順位測定ではない。順位は未計測、検索需要調査も未完了。

## 次のゲート
1. 独立AIレビュー・生成HTML/CIの確認、現場カメラ一次ソース調査。
2. 27語ごとのGSC基準値、地域・端末を記録した競合調査、個別URL検査。
3. 実データ更新とコンテンツ品質を維持しながら変更を段階公開。既存DNS/計測ID/SNS変更なし、従量課金API追加なし。
4. 7/28/60/90/180日後の測定。全国共通化は地点固有情報の検証を維持してから行う。
