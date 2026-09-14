# 関東サーファー｜波情報

関東エリアのサーファー向けに、波情報・波予想・スポットガイドを構築するプロジェクトです。GitHubをProjectの正本（SSOT）として扱います。

## β版公開

GitHub Pagesでβ版を公開しています。

- 公開URL: https://oosaka0123-sudo.github.io/kanto-surfer-ks/
- 代表9地点を切替可能
- 時間別: 直近48時間を2時間刻み
- 週間: 8日間、各日12:00 JSTに最も近いモデル値
- 更新: GitHub Actionsが毎時17分にOpen-Meteoを再取得して再デプロイ
- β期間は `noindex,nofollow`

表示する波高はOpen-Meteo Marineの**モデル波高**です。実際のブレイクサイズとは明確に分離し、実波観測は3層クロスチェックと独立2ソース条件を満たした場合だけ別枠で公開します。

## データパイプライン

1. `scripts/fetch_open_meteo.php` — Marine / Weatherを8日取得
2. `scripts/normalize_open_meteo.php` — 地点×時刻で正規化
3. `scripts/build_public_forecast.php` — 公開用payload生成
4. `scripts/build_pages_site.php` — Pages用静的サイト生成
5. `.github/workflows/deploy-pages.yml` — build / verify / deploy

raw・normalized・validation record・認証情報はPages成果物へ含めません。
