# HANDOFF — 関東サーファー｜波情報

更新日: 2026-09-15

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
- PR #1 `Initialize Kanto Surfer project foundation`
  - Merge commit: `3ca2ad8cdecd4db4415e66f9e5589c997edcb1f0`
- PR #2 `Add Open-Meteo raw data foundation`
  - Merge commit: `499136da8675f60a488708d2a489398cc5ba5dfe`

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

### 実通信で確認した重要事項
- 2026-09-13の9地点実通信テストでMarine/Weatherとも全地点72時間取得成功、fetch errors 0。
- 同一海岸座標のWeather land/seaは全9地点で同一格子に解決されたため、重複の`weather_sea`取得はv1から削除した。
- 片貝新堤と一宮は同じMarine格子に解決された。
- Marine生値だけでは近接ポイント差を表現できないため、地点別の海岸向き・遮蔽・堤防/岬等の補正が必須。

## 現在の実装状態
Branch: `main`
公開β: GitHub Pages

### 実装済み
- `scripts/normalize_open_meteo.php`
  - raw Open-Meteoを地点×時刻の比較しやすい形式へ正規化。
  - Marine/Weatherをtimestampで突合し、欠損・重複・時刻不一致はfail。
  - 点数はまだ作らない。
- `scripts/create_validation_record.php`
  - normalized snapshotと実波観測を同時刻で結びつける。
  - `--observed-at` は明示タイムゾーン必須。
  - 最寄りforecast hourを選び、標準90分を超えるとfail。
  - Marine/Weatherの値と実グリッド情報をvalidation recordに埋め込む。
- `schemas/validation-record.schema.json`
  - raw/normalized snapshot、forecast_time、gap、model、observation、cross_checkを保存。
- `docs/wave-display-crosscheck.md`
  - 波表示の3層クロスチェック仕様を定義。
- `.gitignore`
  - runtime raw/normalized/validation JSONをGit管理対象外。

## 波表示クロスチェック — 新ルール
Open-Meteo APIと波情報を合わせる際、次の3項目を必ず記録する。

1. `api_integrity`
   - raw/normalized整合、時刻差、Marine/Weather格子を確認。
2. `observation_alignment`
   - ライブ/波情報/現地目視など実波側を照合。
   - 可能なら独立2ソース以上。
   - 1ソースだけなら原則`warn`。
3. `spot_context`
   - 海岸向き、有効うねり方向、岬・堤防・湾の遮蔽、風耐性を確認。

判定:
- 3項目すべて`pass`の時だけ`overall_status=pass`。
- `fail`が1つでもあればfail。
- `warn`/`pending`が残る間は公開確定値へ自動昇格しない。

`create_validation_record.php`作成直後は、API時刻照合のみpass、単一実波ソースはwarn、spot_contextはpending、overallはpendingとする。

## テスト済み
### 正規化
- PHP lint PASS。
- 実Open-Meteo 9地点データを入力して正規化成功。
- 9地点すべて72時間。
- scoreフィールドが勝手に作られていないことを確認。

### validation record / cross-check
- PHP 8.4で`create_validation_record.php` lint PASS。
- synthetic normalized sampleで最寄り時刻選択を確認。
- 12:28 JST観測 → 12:00 JST forecast、gap 28分。
- 生成JSONをDraft 2020-12 JSON Schemaでvalidation PASS。
- 初回のSchema不整合はテストで検出し、修正済み。

## 補正ルール
- `wave_height`だけでサイズを決めない。
- swellとwind-waveを分ける。
- 海岸向き/有効うねり方向を加味する。
- 風向だけでなく風速・ガストを使う。
- 一宮/太東、御宿/マルキ等の近接地点に同じ補正係数を使わない。
- sea level/currentはv1ランキング中核点数には使わない。
- 他社点数はコピーせず誤差比較用に限定する。

## 次にやること
1. 独立2ソース目とspot_contextレビューを既存recordへ反映する更新CLIを追加する。
2. live/reportとOpen-Meteoを同時刻で比較したvalidation recordを蓄積する。
3. 小波/通常/サイズアップ/北東風/南西風/台風うねり/風波主体を集める。
4. 地点別の方向係数・遮蔽係数・風係数を決める。
5. その後に実ブレイクサイズ判定・ランキング点数ロジックを実装する。
6. 周辺ポイントDB、SEO個別ページ、トップ/ランキング/Notebook動画フローへ進む。

## Repository状態
- Repository: `oosaka0123-sudo/kanto-surfer-ks`
- default branch: `main`
- PR #1: merged
- PR #2: merged
- Active branch: `main`
- Public beta: `https://oosaka0123-sudo.github.io/kanto-surfer-ks/`
- Active scope: validation accumulation + Kanto spot correction + ranking logic

## 注意
このHANDOFFは未完了状態の再開用。確定仕様は各docs/設定ファイルを正本とする。

## 2026-09-14 実装更新

- PR #3 validation baseline / 3層クロスチェックは main へマージ済み。
- PR #7 individual spot forecast UI preview は main へマージ済み。
  - Merge commit: `77e17b9b4ea92b67b4fcd62aab7a65dda11b19b7`
- Open-Meteo取得期間を3日から8日へ拡張。
- `scripts/build_public_forecast.php` を追加し、正規化済みモデル値から地点別公開payloadを生成。
- 時間別は48時間/2時間刻み、週間は8日/各日12時代表。
- モデル波高は実際のブレイクサイズと明確に分離して表示する。
- `api_integrity` / `observation_alignment` / `spot_context` が全て `pass`、`overall_status=pass`、独立ソース2件以上の実波記録だけ公開payloadへ取り込む。
- 個別ページUIは地点JSONを読み込み、時間別・週間とも横スクロールで表示する。

## 2026-09-15 β公開更新

- PR #8 public forecast data adapter は main へマージ済み。
  - Merge commit: `1dbf053ff3885ce6a0ae9080fe3f3b03c035d0b9`
- PR #9 GitHub Pages beta deployment は main へマージ済み。
  - Merge commit: `6cdaeca6d70293d0edbe3bf066800722cbe0c010`
- GitHub PagesをGitHub Actions方式で有効化済み。
- 公開URL: https://oosaka0123-sudo.github.io/kanto-surfer-ks/
- 毎時17分にOpen-Meteo取得 → 正規化 → 公開payload → 静的Pagesを自動再生成する。
- GitHub Runnerの一時通信失敗対策として429 / 5xx / transport errorを最大3回リトライする。恒久的な4xxは即fail。
- 本番QA: 390px / 1200pxでページ横はみ出しなし、週間横スクロール、sticky、メニュー、9地点切替PASS。
- 公開9地点JSONは全てHTTP 200を確認。β期間は `noindex,nofollow`。
- raw / normalized / validation record / PHPソース / credentialsはPages成果物へ含めない。

## 2026-09-15 次回引き継ぎ

### 現在の公開状態
- 公開βは **1ページ + 9地点切替** のまま維持する。
- 公開URL: https://oosaka0123-sudo.github.io/kanto-surfer-ks/
- GitHub Pages / 毎時17分更新 / 8日モデル予報は稼働中。
- 現在の本番main: `5e758912cb0dcb66464b7090621baabd41cb750a`

### ページ構成について
- 将来的にはトップ1ページ + 9スポット個別ページ = 最低10ページ構成を有力案とする。
- ただし **ページ構成全体が固まるまでは分割実装しない**。
- トップ、スポット個別、ランキング、ガイド、お問い合わせ等の役割とURL設計を先に確定し、その後まとめてページ化する。
- `feat/seo-spot-pages` はローカルで作成しただけで実装変更なし。main・本番への影響なし。

### 未完了WIP
- validation review CLIの途中作業はPC02の `stash@{0}` に退避済み。
- stash名: `wip validation review cli`
- 次回、ページ構成を優先する場合はこのstashを触らず保持する。
- 実波検証作業へ戻る場合のみ、専用ブランチでstashを復元して続きを行う。

### 次回の開始手順
1. `HANDOFF.md` と `docs/pages-deployment.md` を読む。
2. 公開βが正常稼働していることだけ確認する。
3. まずサイト全体の最終ページ構成を確定する。
4. ページ構成確定後にURL / SEO / 内部リンクをまとめて設計する。
5. その後に10ページ以上への分割実装を一括で行う。
