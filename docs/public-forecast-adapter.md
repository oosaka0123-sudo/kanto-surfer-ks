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
- `daily`: 今日(JST)から10日分の日別集計（下記）
- フロント側では日平均・日最大などを再計算しない

### `daily`

`build_public_forecast.php` がバックエンドで集計する。取得は Open-Meteo Marine / Weather とも `forecast_days=10`。

- `days`: 行数（既定10、`--daily-days=` で変更可、schema上限10）
- `timezone`: `Asia/Tokyo`
- `window_start_hour` / `window_end_hour`: `5` / `17`（両端含む、1日13サンプル）
- `weather_hour`: `11`
- `source_generated_at`: payload の `source_generated_at` と同じ値
- `rows`: 今日(JST)から連続する日付。データが無い日も null 値で行を出す
  - `date` (`YYYY-MM-DD`), `weekday` (0=日曜, JST)
  - `model_wave_height_min_m` / `model_wave_height_max_m`: 05–17時の `marine.wave_height` の最小/最大（小数2桁）
  - `wind_speed_mean_ms`: 05–17時の `weather_land.wind_speed_10m` の算術平均（小数2桁）
  - `wind_direction_mean_deg`: 風速重み付きベクトル平均の風向（気象「吹いてくる方向」、0–359の整数）。重み合計0または合成ベクトル長 < 0.01 なら null
  - `wind_direction_label`: 平均風向（整数化後）の8方位ラベル（北,北東,東,南東,南,南西,西,北西）
  - `weather_code` / `weather_label`: 当日11:00ちょうどの `weather_land.weather_code` と既存の天気ラベル。無ければ null
  - `wave_samples` / `wind_samples`: 窓内で数値だった時間サンプル数
  - `judgment`: 全9スポットで暫定較正（`status=provisional`）。モデル波高最大・平均風速・平均風向から1〜5星を返す。風向評価はスポットごとのオフショア方向を反映し、表示は `😴 諦めよ ★☆☆☆☆` 〜 `🔥 かなり良い ★★★★★`。実ブレイクサイズそのものではなく、実波照合を継続する暫定判定。データ不足時のみ `pending`／「検証中」

完全性ルール: 各指標は05:00–17:00の13サンプルすべてが数値（波高・風速は >= 0）の場合のみ算出し、1つでも欠ければその指標は null。
風向は13組すべての風速＋風向が揃う場合のみ。補間・隣接日からの補完・モデル日別集計値の利用はしない。
当日分は取得時点より前の時刻も Open-Meteo が返す範囲で集計対象となる（`hourly` と違い現在時刻で切らない）。

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
