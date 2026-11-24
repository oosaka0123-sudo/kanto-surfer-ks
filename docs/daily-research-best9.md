# 関東9ポイント｜朝7:30検索とBEST9掲載（設計・運用）

## 目的
- 毎朝7:30 JSTに公開情報をWebで調査し、関東の正確に9地点を比較する。
- 根拠が揃った日のみ、ホームに暫定ランキングBEST9、9スポットそれぞれに出典付き記事を表示する。
- 既存のOpen-Meteo波・風グラフ、潮位・降水量、10日間予報、背景動画、ヘッダーを変更しない。
- 高価な有料モデルAPIを使わず、既存のChatGPT定期タスク＋GitHubコネクタ＋既存FTPSを利用する。
- ChatGPTのDeep Research**専用モード**の定期実行を保証せず、タスクでの複数独立ソース検証を実行する。

## 対象スポット
`config/representative-spots.json` の9 IDのみ：kugenuma／yuigahama／oarai_onuki／kashima_hirai／katakai／ichinomiya／taito／onjuku／kamogawa_maruki。

## 判定・データ品質
1. 地点別の公開予報、気象庁の波浪・風・警報／注意報、取得できる当日実況を調べる。
2. 「海上モデル波高」と「現地ブレイクサイズ」を混同しない。現地サイズが直接確認できなければ推定／未確認とする。風向、周期、地形・向き、満干潮も考慮する。
3. 毎地点につき少なくとも**2つの異なる公開ソースのURL**、それぞれの発表・確認・対象時刻を記録する。ドメインが異なるだけで独立の観測・モデルと断定しない。
4. 前日分の情報を当日最新として扱わない。ログインできない有料情報は参照しない。実測と予報を混ぜない。
5. 順位1～9は同順位なし。確度 low/medium/high を付記する。根拠不足のときは無理に完成ランキングを作らず、`status: "held"` として掲載を見送る。未較正の100点スコアは公開しない。
6. 危険な状況、注意報がある場合は注記する。精度保証をしない。

## GitHub格納フォーマット
`oosaka0123-sudo/kanto-surfer-ks` の `content/research/latest.json`。毎回1日分を保存。履歴は `content/research/archive/YYYY-MM-DD.json` として残せるが、本番レンダラーは latest のみ参照する。

```json
{
  "schema_version": 1,
  "status": "published",
  "date": "YYYY-MM-DD",
  "generated_at": "YYYY-MM-DDTHH:MM:SS+09:00",
  "rankings": [
    {
      "rank": 1,
      "spot_id": "kugenuma",
      "wave": "推定または未確認を明示した波サイズ",
      "wind": "風向・風速の予報（発表元を明示）",
      "summary": "順位にした根拠の短文",
      "confidence": "medium"
    }
  ],
  "reports": {
    "kugenuma": {
      "title": "今日の鵠沼の波情報",
      "summary": "短い概要",
      "paragraphs": ["波と風の分析", "実測との差、注意事項"],
      "sources": [
        {
          "name": "発表元",
          "url": "https://example.org/actual-public-source",
          "issued_at": "YYYY-MM-DDTHH:MM:SS+09:00",
          "checked_at": "YYYY-MM-DDTHH:MM:SS+09:00",
          "target_at": "YYYY-MM-DDTHH:MM:SS+09:00"
        }
      ]
    }
  }
}
```

**注意**：上記はフィールド見本であり、配列／reportsには実際には9地点全部、各地点2件以上の独立ソースが必要。サンプルドメインを実データで使用してはいけない。非確認・不完全な日は `status: "held"` にする。GitHub main への書き込み権限がない場合は別ブランチの下書きとし、公開成功を偽らない。

## 安全な公開経路
- **検索**：既存7:30タスク「関東9地点 朝の波ランキング」。タスクのWeb検索実行、GitHubコネクタ、完成時刻は都度結果確認。
- **保存**：GitHubリポジトリに最新JSON。ユーザーが自動公開を依頼している範囲に限り、検証済みデータを保存する。検証失敗時はmainに不完全データを書かない。
- **表示生成**：`scripts/render_daily_research.cjs` が schema、日付、ソースURL、時刻、9地点を検証し、ホームと各スポット10枚のHTMLへ、マーカーで囲った新規セクションのみを追加。HTML値はエスケープする。
- **GitHub Pages**：既存の `deploy-pages.yml` が、当日の `published` データがある場合だけ静的HTMLへ組み込む。
- **ロリポップ**：`chat-homepage` の既存 `CHAT_FTP_USER` / `CHAT_FTP_PASSWORD` を使う安全な別ワークフローを設置。実本番は `/kanto`。公開前に10ページを取得・バックアップし、記事部分だけ更新、公開後に10ページをバイト照合。失敗したら10ページを戻す。
- **時刻**：7:30 JSTが検索開始、公開は情報収集完了後。8:15/8:45/9:15/10:15 JSTの処理を予定し、定時ぴったりの公開は保証しない。翌日分を前日朝の現況として誤公開しない。

## 試験
`node tests/research_best9_smoke.cjs` は9地点の欠損、順位重複、ソース不足、不正なHTML、再実行時の重複とグラフ部分保全を確認。架空の試験値は自動で作る隔離テンポラリのみで、本番へは送らない。

## 運用上の注意
GitHub Actionsのビルド成功だけではロリポップ本番反映済みとは言えない。必ず `https://kanto.rss7.net/` と全9ページを再取得し表示を確認する。7:30の調査タスクがGitHubへ書き込めない場合、公開系は既存表示を維持し、失敗を通知する。
