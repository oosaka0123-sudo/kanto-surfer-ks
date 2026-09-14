# Public forecast adapter

関東サーファー個別ページへ公開する予報データの生成境界を定義する。

## 入力

- `data/normalized/latest.json`: Open-Meteo raw を時刻整合済みにした正規化データ
- `data/validation/*.json`: 実波との検証記録

## 出力

`scripts/build_public_forecast.php` が `data/public/<spot-id>.json` を生成する。

- `timezone`: `Asia/Tokyo`
- `hourly`: 直近48時間を2時間間隔で最大24列
- `weekly`: 今日から8日、各日12:00 JSTに最も近い1時間を代表値として採用
- フロント側では日平均・日最大などを再計算しない

## 波高の意味

公開する `model_wave_height_m` は Open-Meteo Marine のモデル波高であり、実際のブレイクサイズではない。
UIでは必ず「モデル波高」と明示する。

## 実波クロスチェック

validation record は `overall_status` と `api_integrity` / `observation_alignment` / `spot_context` がすべて `pass`、かつ `independent_source_count >= 2` のものだけ公開payloadへ取り込む。
`pending` / `warn` / `fail` は公開実波欄へ昇格させない。

公開payloadは検証済み実波について、観測時刻・サイズラベル・風・独立ソース数だけを保持する。
第三者の有料レポート本文、画像、映像は保存・再配信しない。

## UI

`prototype/spot-forecast/` は `data-src` で地点JSONを読み込む。
時間別・週間は同じ横スクロールUIを使い、左ラベル列をsticky固定する。
データが読めない場合や値が欠損している場合は推測せず `--` を表示する。

検証済み実波が存在する場合だけ「モデル＋検証済み実波」と表示し、予報表とは別枠で最新観測を見せる。

## Schema

地点別payloadは `schemas/public-forecast-v1.schema.json` で構造を検証する。`index.json` は地点payloadとは別の索引形式として扱う。
