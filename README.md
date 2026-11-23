# 関東サーファー｜波情報

関東エリアのサーファー向けに、波情報・波予想・スポットガイドを構築するプロジェクトです。GitHubをProjectの正本（SSOT）として扱います。

## 公開サイト

GitHub Pagesで公開サイトを運用しています。

- 公開URL: https://oosaka0123-sudo.github.io/kanto-surfer-ks/
- 代表9地点を切替可能
- 時間別: 直近72時間を1時間刻み（今日・明日・明後日を切替）
- 10日間の波・風予報: 今日から10日、05:00〜17:00 JSTのモデル波高最小〜最大・風速平均・風速加重平均風向・11時天気（集約はバックエンド。判定列は関東版Calibration完了まで「検証中」）
- 更新: GitHub Actionsが毎時17分にOpen-Meteoを再取得して再デプロイ
- 公開成果物は `index,follow` / canonical / sitemap / robots.txt を生成

表示する波高はOpen-Meteo Marineの**モデル波高**です。実際のブレイクサイズとは明確に分離し、実波観測は3層クロスチェックと独立2ソース条件を満たした場合だけ別枠で公開します。未検証の実ブレイクサイズ・点数・ランキングは推測公開しません。

## データパイプライン

1. `scripts/fetch_open_meteo.php` — Marine / Weatherを10日取得
2. `scripts/normalize_open_meteo.php` — 地点×時刻で正規化
3. `scripts/build_public_forecast.php` — 公開用payload生成（`hourly` / `daily` 10日間 / 互換用 `weekly`）
4. `scripts/build_pages_site.php` — Pages用静的サイト生成
5. `.github/workflows/deploy-pages.yml` — build / verify / deploy

raw・normalized・validation record・認証情報はPages成果物へ含めません。
