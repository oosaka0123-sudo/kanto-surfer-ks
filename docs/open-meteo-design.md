# 関東サーファー｜Open-Meteo取得設計 v1

更新日: 2026-09-13

## 目的

代表9地点の波予報・ランキングを、他社の点数コピーではなくOpen-Meteo Marine / Weatherを基礎データとして独自計算する。
初期段階では係数を決め打ちせず、実波情報との突合ログを蓄積してから地点別補正を確定する。

## 基本方針

- Marine APIとWeather APIを分離して取得する。
- Marineは海グリッド、Weatherは海岸側の10m風を基準として使う。
- 代表9地点の表示名ではなく `docs/representative-spots.md` の内部基準点を使う。
- APIレスポンスが返す実際のグリッド中心座標を保存する。要求座標と数kmずれる場合があるため、要求座標だけを記録して終わらせない。
- 湾、岬、堤防、ヘッドランドによる遮蔽は波浪モデル格子だけでは解像できない前提で、地点別補正を後段に持つ。
- 関西版のサイズ閾値・点数ロジックをそのままコピーしない。

## Marine API

### エンドポイント

`/v1/marine`

### 固定オプション

- `timezone=Asia/Tokyo`
- `cell_selection=sea`
- 取得は1時間系列を基本とする。
- 現況＋翌日を最低限保持し、ランキング・朝夕更新に必要な期間だけJSONへ保存する。

### v1必須変数

- `wave_height`
- `wave_direction`
- `wave_period`
- `swell_wave_height`
- `swell_wave_direction`
- `swell_wave_period`
- `swell_wave_peak_period`
- `wind_wave_height`
- `wind_wave_direction`
- `wind_wave_period`

### v1推奨追加変数

- `secondary_swell_wave_height`
- `secondary_swell_wave_direction`
- `secondary_swell_wave_period`
- `sea_surface_temperature`

secondary swellはモデルによって欠損するため、必須判定に使わない。

### v1でランキング中核に使わない変数

- `sea_level_height_msl`
- `ocean_current_velocity`
- `ocean_current_direction`

Open-Meteo自身が沿岸域での潮位・海流精度に注意を出しているため、初期ランキングの主要点数には入れない。
潮位は将来、別の信頼できる潮汐データとの照合後に補助係数として扱う。

## Weather API

### エンドポイント

`/v1/forecast`

### 固定オプション

- `timezone=Asia/Tokyo`
- `wind_speed_unit=ms`
- `cell_selection=land`
- モデルはまず `auto` を使用し、検証で明確な改善がある場合だけ固定モデルを検討する。

### 必須変数

- `wind_speed_10m`
- `wind_direction_10m`
- `wind_gusts_10m`
- `precipitation`
- `weather_code`

### 補助変数

- `temperature_2m`
- `cloud_cover`

## 風データのv1方針

内部基準点座標を使い `cell_selection=land` で取得する。
サーファーが海岸で受ける10m風の基準値として扱う。

当初は同一座標で `cell_selection=land` と `cell_selection=sea` の2系統取得を想定したが、2026-09-13の9地点実通信テストでは、全地点でland/seaが同一のWeather格子座標に解決された。同一座標からsea指定を追加しても独立した風情報にならないため、v1では重複取得を行わない。

Open-Meteoの `cell_selection` は格子選択の「preference」であり、同一海岸座標でlandとseaが必ず別格子になる保証として扱わない。

### 将来のoffshore wind

沖側風を追加する場合は、海岸座標に `cell_selection=sea` を付けるだけではなく、地点ごとに検証済みの明示的な沖側サンプル座標を持たせる。
海岸法線や数km沖などの座標は推測で決めず、実波・風観測との比較後に追加する。

## 地点別に補正が必要な理由

### 鵠沼

広い遠浅ビーチ。モデル値と実波の関係は比較的取りやすいが、地形変化・混雑・潮位の影響が大きい。

### 由比ヶ浜

湾・岬による遮蔽で、沖のMarine値をそのまま波サイズへ変換すると過大評価しやすい可能性がある。

### 大洗・大貫

南東系のオープン度が高い。平井とは別係数にする。

### 鹿嶋・平井

北東向きで、大洗と有効うねり方向・オフショアが異なる。

### 片貝新堤

堤防による風軽減があるため、単純な風向点数だけでは実コンディションを過小評価する場合がある。

### 一宮

東向きの基準点として、生データと実波の基準係数を作る中心候補。

### 太東

岬・堤防の遮蔽が強く、一宮と近くても同一係数にしない。

### 御宿

湾状で外房オープン海岸より風をかわす場合がある。沖波高をそのまま使うとサイズ過大評価の可能性がある。

### マルキ

南寄りうねりへの反応を独立評価し、御宿とは別係数にする。

## 実通信で確認したモデル格子の注意点

2026-09-13の9地点取得テストではMarine / Weatherとも正常取得できたが、Marine格子は代表ポイントの局所差を直接表現できる細かさではなかった。

特に片貝新堤と一宮は同じMarine格子座標に解決された。したがってMarine値が同じでも実際の波質・サイズ・風耐性が同じとは判断しない。

また、大洗・大貫など要求した海岸座標からMarineの実格子中心が大きく沖側へずれる地点もあった。レスポンスの実格子座標を保存し、どの海域値を基礎にした予報なのか追跡できるようにする。

## 生データからランキングまでの処理順

1. Open-Meteo Marine取得
2. Weather beach wind取得
3. APIレスポンスの実グリッド座標・取得時刻を保存
4. 波向と各ポイントの有効うねりセクターを比較
5. swell成分とwind-wave成分を分離
6. 地点別exposure/遮蔽補正
7. 風向を offshore / side-off / side / side-on / onshore に分類
8. 風速・ガストで面への影響を補正
9. 実波サイズへ変換する地点別サイズ係数を適用
10. live/reportとの乖離を記録
11. 十分な検証後に点数化

## 初期点数化で避けること

- `wave_height` だけでサイズを決める。
- 海岸向きを無視して全方向のswellを同じ強さとして扱う。
- 風向だけで、風速・ガストを無視する。
- 一宮と太東、御宿とマルキ等の近接地点に同じ補正係数を使う。
- 同じMarine格子に解決された地点を同一条件とみなす。
- 他社の点数を教師データとしてそのままコピーする。
- 1日や1イベントの一致だけで補正係数を確定する。

## 検証ログに保存する項目

各地点・各時刻について最低限以下を保存する。

- request latitude / longitude
- resolved marine grid latitude / longitude
- resolved weather land grid latitude / longitude
- wave height / direction / period
- swell height / direction / period / peak period
- secondary swell（存在時）
- wind-wave height / direction / period
- beach wind speed / direction / gust
- human report size
- human report wind
- human report score（参考値、コピーには使わない）
- live visual note
- tide/time if available
- KS predicted size
- KS predicted score
- error / difference note

## 検証期間

最低でも以下を含む複数パターンを集めてから地点別係数を固定する。

- 小波
- 通常サイズ
- サイズアップ
- 北東風
- 南西風
- 台風/長周期うねり
- 風波主体

単純な日数より「条件の種類」を優先する。

## 次工程

1. 9地点のraw取得基盤を安定運用できる形にする。
2. live/reportとの比較用 `validation` データ構造へ実観測を入れる。
3. 数日・複数条件のraw/observed差分を確認する。
4. 地点別の方向係数・遮蔽係数・風係数を決める。
5. 必要性が確認できた場合のみ、明示的offshore windサンプル座標を追加する。
6. その後にサイズ判定・点数ロジックを実装する。
