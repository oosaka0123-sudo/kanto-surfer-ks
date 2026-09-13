# 関東サーファー｜Open-Meteo取得設計 v1

更新日: 2026-09-13

## 目的

代表9地点の波予報・ランキングを、他社の点数コピーではなくOpen-Meteo Marine / Weatherを基礎データとして独自計算する。
初期段階では係数を決め打ちせず、実波情報との突合ログを蓄積してから地点別補正を確定する。

## 基本方針

- Marine APIとWeather APIを分離して取得する。
- Marineは海グリッドを優先し、Weatherは陸上風と海上風を分けて取得する。
- 代表9地点の表示名ではなく `docs/representative-spots.md` の内部基準点を使う。
- APIレスポンスが返す実際のグリッド中心座標を保存する。要求座標と数kmずれる場合があるため、要求座標だけを記録して終わらせない。
- 湾、岬、堤防、ヘッドランドによる遮蔽は5〜9km級の波浪モデルだけでは解像できない前提で、地点別補正を後段に持つ。
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

## 風データは2系統で取る

### 1. beach wind

内部基準点座標を使い `cell_selection=land` で取得する。
サーファーが海岸で受ける陸側10m風の基準値として扱う。

### 2. sea wind

同じ代表点付近を `cell_selection=sea` で取得する。
沖側の風系統と陸側の局地風の差を見る補助値として扱う。

### 差が大きい場合

以下は「予報不確実度が高い」とみなし、点数を過信しない。

- land / sea の風向差が大きい。
- land / sea の風速差が大きい。
- live/report上の風向とモデル風向が継続的にずれる。

具体閾値は検証ログを見て決める。初期実装で恣意的な固定値を入れない。

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

## 生データからランキングまでの処理順

1. Open-Meteo Marine取得
2. Weather land/sea風取得
3. APIレスポンスの実グリッド座標・取得時刻を保存
4. 波向と各ポイントの有効うねりセクターを比較
5. swell成分とwind-wave成分を分離
6. 地点別exposure/遮蔽補正
7. 風向を offshore / side-off / side / side-on / onshore に分類
8. 風速・ガストで面への影響を補正
9. 実波サイズへ変換する地点別サイズ係数を適用
10. live/reportとの乖離を記録
11. 点数化

## 初期点数化で避けること

- `wave_height` だけでサイズを決める。
- 海岸向きを無視して全方向のswellを同じ強さとして扱う。
- 風向だけで、風速・ガストを無視する。
- 一宮と太東、御宿とマルキ等の近接地点に同じ補正係数を使う。
- 他社の点数を教師データとしてそのままコピーする。
- 1日や1イベントの一致だけで補正係数を確定する。

## 検証ログに保存する項目

各地点・各時刻について最低限以下を保存する。

- request latitude / longitude
- resolved marine grid latitude / longitude
- resolved weather land grid latitude / longitude
- resolved weather sea grid latitude / longitude
- wave height / direction / period
- swell height / direction / period / peak period
- secondary swell（存在時）
- wind-wave height / direction / period
- land wind speed / direction / gust
- sea wind speed / direction / gust
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

1. 9地点をまとめて取得できるAPIリクエスト形式を実コードへ落とす。
2. raw JSONの保存形式を決める。
3. live/reportとの比較用 `validation` データ構造を作る。
4. まず点数化せず、数日分のraw/observed差分を確認する。
5. 地点別の方向係数・遮蔽係数・風係数を決める。
