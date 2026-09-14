# GitHub Pages beta deployment

関東サーファーKSのβ公開は GitHub Pages + GitHub Actions で行う。

## 公開物

公開成果物には次だけを含める。

- `index.html`
- `app.js`
- `styles.css`
- `.nojekyll`
- `data/<spot-id>.json`
- `data/index.json`

raw Open-Meteoレスポンス、normalized中間データ、validation record、PHPソース、認証情報はPages成果物へ含めない。

## 更新

`.github/workflows/deploy-pages.yml` が次でビルドする。

1. Open-Meteo 8日予報取得
2. 正規化
3. 公開payload生成
4. Pages用静的サイト生成
5. 成果物検証
6. GitHub Pagesへデプロイ

`main` の関連ファイル更新時、手動実行時、毎時17分に実行する。

## β版の扱い

β版は `noindex,nofollow` とし、検索エンジン登録は本番スポットページ・補正ロジック・ランキング仕様が整ってから別途判断する。
モデル波高は実際のブレイクサイズと区別して表示する。
