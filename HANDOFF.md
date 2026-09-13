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

## mainへマージ済み
PR #1 `Initialize Kanto Surfer project foundation` は2026-09-13にmainへマージ済み。
Merge commit: `3ca2ad8cdecd4db4415e66f9e5589c997edcb1f0`。

正本:
- `AGENTS.md`
- `README.md`
- `docs/representative-spots.md`
- `docs/source-matrix.md`
- `docs/open-meteo-design.md`

## Open-Meteo v1設計
### Marine
- `/v1/marine`
- `timezone=Asia/Tokyo`
- `cell_selection=sea`
- wave / swell / wind-wave の高さ・方向・周期を取得する。
- APIが返す実グリッド座標も保存する。

### Weather
- `/v1/forecast`
- `timezone=Asia/Tokyo`
- `wind_speed_unit=ms`
- `cell_selection=land`
- 海岸側の10m風・ガスト・降水・weather code等を取得する。

### 重要な修正
当初は同一海岸座標でWeatherのland/seaを2系統取得する設計だったが、2026-09-13の9地点実通信テストでは全地点で同一Weather格子に解決された。
独立情報にならないため、v1では同一座標の`weather_sea`取得を削除した。
沖側風が必要になった場合は、検証済みの明示的な沖側サンプル座標を地点別に追加する。

## PR #2 — Open-Meteo raw data foundation
Branch: `feat/open-meteo-data-foundation`
Base: `main`

### 実装済み
- `config/representative-spots.json`
  - 代表9地点を機械可読化。
- `scripts/fetch_open_meteo.php`
  - Marine + Weather beach/landを9地点取得。
  - 3日分=72時間のraw hourlyを保存。
  - `data/raw/<timestamp>.json` と `data/raw/latest.json` をatomic write。
  - APIキー不要。
  - ランキング/サイズ判定はまだ行わない。
  - PHP 7.4+を想定した構文。
- `schemas/validation-record.schema.json`
  - raw snapshotと実波観測を結びつけるvalidation record schema。
  - 外部スコアは比較専用。
- `.gitignore`
  - runtime raw/validation JSONをGit管理対象外。
- `docs/open-meteo-design.md`
  - 実通信結果を反映し、same-coordinate sea windをv1から削除。

## 実通信検証 — 2026-09-13
許可済みRemote Desktop端末でfeature branchを新規cloneして検証。

結果:
- PHP 8.4.24 CLIで `php -l scripts/fetch_open_meteo.php`: PASS
- 代表9地点: 9/9取得成功
- Marine: 全地点72時間
- Weather land: 全地点72時間
- fetch errors: 0
- `weather_sea`: 修正版出力には存在しないことを確認

### 実グリッドの重要な発見
- Open-Meteoのレスポンスlat/lonは要求した海岸座標と異なる場合がある。
- 片貝新堤と一宮は今回、同じMarine格子座標に解決された。
- 大洗・大貫などは要求海岸座標からMarine格子中心がかなり沖側へずれた。

結論:
- Marine生値だけで近接ポイントの差を表現できない。
- 地点別の海岸向き・遮蔽・堤防/岬等の補正は必須。
- 同じMarine格子だから同じ波と判断してはいけない。

## 補正ルール
- `wave_height`だけでサイズを決めない。
- swellとwind-waveを分ける。
- 海岸向き/有効うねり方向を加味する。
- 風向だけでなく風速・ガストを使う。
- 一宮/太東、御宿/マルキ等の近接地点に同じ補正係数を使わない。
- sea level/currentはv1ランキング中核点数には使わない。
- 他社点数はコピーせず誤差比較用に限定する。

## 次にやること
1. PR #2をReadyへ変更し、最終差分レビュー後mainへマージする。
2. validation recordへ実観測を入れる仕組みを作る。
3. live/reportとraw予報を同時刻で比較する。
4. 小波/通常/サイズアップ/北東風/南西風/台風うねり/風波主体の複数条件を集める。
5. 地点別の方向係数・遮蔽係数・風係数を決める。
6. その後に初めてサイズ判定・ランキング点数ロジックを実装する。
7. 周辺ポイントDB、SEO個別ページ、トップ/ランキング/Notebook動画フローへ進む。

## Repository状態
- Repository: `oosaka0123-sudo/kanto-surfer-ks`
- default branch: `main`
- PR #1: merged
- PR #2: open / final review pending
- Active implementation scope: Open-Meteo raw data foundation

## 注意
このHANDOFFは未完了状態の再開用。確定仕様は各docs/設定ファイルを正本とする。
