# HANDOFF — 関東サーファー｜波情報

更新日: 2026-09-13

## 目的
関東サーファー向けの波情報・波予想サイトを立ち上げる。GitHubをProjectのSSOTとする。

## 現在の確定方針
- サイト内部のポイントDBは9地点に固定せず、関東の主要ポイントを広く保持する。
- 毎日の波ランキングとNotebook動画で使う代表地点は9地点に固定する。
- 同じ向き・隣接・同じうねり/風にほぼ同じ反応をするポイントを代表9地点で重複採用しない。
- 近接していても岬・河口・堤防・リーフ等で風耐性や波質が明確に違う場合は別候補として評価する。
- ランキング代表から外れた人気ポイントも削除せず、SEO用の個別ページ/周辺ポイントとして残す。
- 関西版のサイズ閾値・点数ロジックをそのままコピーせず、関東9地点を実波と突合して補正する。

## 情報源ルール
- BCM / SurfPatrol は同一系統として1ソース扱い。
- BCMライブは無料公開カメラとは分ける。
- 波伝説は波情報とサービス内ライブを分ける。
- なみある？独自ライブ、自治体・観光協会・YouTube等の公開ライブは独立目視ソースとして評価する。
- 古い/終了済みカメラは現役扱いしない。
- 他社ライブ映像・画像・有料波情報は転載・再配信・保存ミラーしない。
- 自動取得は利用規約・API提供状況を確認してから設計する。

## 代表9地点 v1
独立再検証では入れ替え不要と判断。`docs/representative-spots.md` を正本とする。
公開ランキング仕様としてのユーザー最終ロック前なので、現在は「再検証済みv1ベースライン」。

1. 鵠沼 — 内部基準点: 鵠沼海岸
2. 由比ヶ浜 — 内部基準点: 由比ヶ浜海岸
3. 大洗・大貫 — 内部基準点: 大貫つるかめ下
4. 鹿嶋・平井 — 内部基準点: 平井浜
5. 片貝 — 内部基準点: 片貝新堤
6. 一宮 — 内部基準点: 一宮
7. 太東 — 内部基準点: 太東
8. 御宿 — 内部基準点: 御宿中央
9. 鴨川・マルキ — 内部基準点: マルキ

地域配分: 湘南2 / 茨城2 / 千葉北3 / 千葉南2。

### 選定の重要理由
- 湘南2枠は、由比ヶ浜が湾・岬の遮蔽を受け鵠沼とサイズ/風反応が異なるため維持。
- 茨城2枠は、大洗・大貫が南東系、平井が北東向きで有効うねりとオフショア方向が大きく違う。
- 千葉北3枠は、片貝新堤の堤防、一宮のオープン東向き、太東の岬/堤防で風耐性が異なる。
- 千葉南2枠は、御宿の湾状遮蔽とマルキの南寄りうねり反応を分担できる。

## 代表外だがDB/SEOで重要
- 湘南: 茅ヶ崎・西浜、辻堂、大磯、江ノ島水族館前、引地川河口、七里ヶ浜等
- 茨城: トップサンテ、波崎、大竹等
- 千葉北: 飯岡、作田、本須賀、白子、サンライズ、東浪見、志田下等
- 千葉南: 部原、勝浦周辺、岩和田/浦仲、鴨川シーサイド等

## mainへマージ済みの設計
PR #1 `Initialize Kanto Surfer project foundation` は2026-09-13にmainへマージ済み。
Merge commit: `3ca2ad8cdecd4db4415e66f9e5589c997edcb1f0`。

含まれる主な正本:
- `AGENTS.md`
- `README.md`
- `docs/representative-spots.md`
- `docs/source-matrix.md`
- `docs/open-meteo-design.md`
- `HANDOFF.md`

## Open-Meteo設計
### Marine
- endpoint: `/v1/marine`
- `timezone=Asia/Tokyo`
- `cell_selection=sea`
- v1必須: wave height/direction/period、swell height/direction/period/peak、wind-wave height/direction/period
- APIが返す実グリッド座標も保存する。

### Weather
- endpoint: `/v1/forecast`
- `timezone=Asia/Tokyo`
- `wind_speed_unit=ms`
- land/sea双方で10m風を取得する。
- v1必須: wind speed/direction/gust、precipitation、weather code

### 補正ルール
- `wave_height`だけでサイズを決めない。
- swellとwind-waveを分ける。
- 海岸向き/有効うねり方向を加味する。
- 風向だけでなく風速・ガストを使う。
- 一宮/太東、御宿/マルキ等の近接地点に同じ補正係数を使わない。
- sea level/currentは沿岸精度の注意があるため、v1ランキング中核点数には使わない。
- 他社点数はコピーせず誤差比較用に限定する。

## 現在の実装ブランチ / PR #2
Branch: `feat/open-meteo-data-foundation`
PR #2: `Add Open-Meteo raw data foundation`
Base: `main`
Status: Draft / GitHub raw APIでは `mergeable=true`, `mergeable_state=clean`。

### 実装済み
- `config/representative-spots.json`
  - 代表9地点を機械可読化。
  - display/internal name、region、lat/lon、海岸向き、主要うねり、オフショアを保持。
- `scripts/fetch_open_meteo.php`
  - Marine + Weather land + Weather sea を各地点について取得。
  - 3日分のraw hourlyを保存。
  - `data/raw/<timestamp>.json` と `data/raw/latest.json` をatomic write。
  - APIキー不要。ランキング/サイズ判定はまだ行わない。
  - PHP 8専用構文を外し、PHP 7.4+を想定した書き方にしている。
- `schemas/validation-record.schema.json`
  - raw snapshotと実波観測を結びつけるvalidation recordのJSON Schema。
  - 外部スコアは比較専用と明記。
- `.gitignore`
  - runtime raw JSON / validation JSONをGit管理対象外にした。

### 検証済み
- `php -l scripts/fetch_open_meteo.php` 相当コード: PASS。
- `--dry-run` + 最小configでJSON生成: PASS。
- Open-Meteo公式docsでMarine変数、Weather変数、`cell_selection`、`wind_speed_unit=ms` を照合済み。
- Open-Meteo docsではMarineレスポンスのlat/lonは実際に使用されたグリッド中心で、要求座標から数kmずれる場合があることを確認済み。

### 未検証 / BLOCKER
- 現在のChatGPT実行コンテナは外向きHTTP接続が遮断されており、Open-Meteoへの実通信テストはtransport-levelで失敗した。
- そのためPR #2はDraftのまま。API側HTTP 200の実取得確認後にReady/Mergeする。
- GitHub Actions等の自動外部workflowは勝手に追加していない。

## 次にやること
1. Open-Meteoへ外向き通信できる環境で `scripts/fetch_open_meteo.php` を1回実行し、9地点×Marine/land wind/sea windの実取得を確認する。
2. `data/raw/latest.json` のレスポンスグリッド座標・hourly配列・エラー0を確認する。
3. 問題がなければPR #2をReadyへ変更し、差分レビュー後mainへマージする。
4. validation recordを実際に数件作り、ライブ/人手波情報とraw予報を時刻合わせして比較する。
5. 小波/通常/サイズアップ/北東風/南西風/台風うねり/風波主体を集める。
6. 地点別の方向係数・遮蔽係数・風係数を決める。
7. その後に初めてサイズ判定・ランキング点数ロジックを実装する。
8. 周辺ポイントDBとSEO個別ページ、トップ/ランキング/Notebook動画フローへ進む。

## Repository状態
- Repository: `oosaka0123-sudo/kanto-surfer-ks`
- default branch: `main`
- PR #1: merged
- PR #2: open Draft
- Active implementation owner scope: Open-Meteo raw data foundation

## 注意
このHANDOFFは未完了状態の再開用。確定仕様は各docs/設定ファイルを正本とし、PR/commitで復元できる履歴をここへ重複保存しすぎない。
