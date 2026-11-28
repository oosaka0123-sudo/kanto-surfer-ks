# SEO登録・監視システム（GitHub Actions）

関連: Issue #32（作業管理）／PR #80（SEO改修・27キーワード表）／Issue #34（本番反映）

## 何をするか

| 処理 | 中身 | 結果の置き場所 |
|---|---|---|
| 技術監査（公開情報） | 全13 URL（トップ・9地点・about/contact/privacy）の HTTP 200、自己canonical、meta robots / X-Robots-Tag の noindex、robots.txt のクロール許可と Sitemap 行、sitemap.xml の過不足、noindex ページの除外、404・HTTP→HTTPS | Actions のログ・Summary・artifact（公開してよい） |
| Search Console 読み取り | URL検査API（13 URL の登録状況・未登録ページ抽出）、検索アナリティクスAPI（7日・28日・90日、それぞれ直前の同じ長さの期間と比較／サイト全体・9地点ページ別・重点27キーワード） | **暗号化した artifact のみ**（90日保存） |
| 通知 | 定期・手動実行で失敗したら Issue「SEO監視アラート（自動）」を作成／追記。次回成功で復旧コメントを付けて閉じる。GitHub標準の失敗メールも届く | Issue（公開情報のみ） |

実行タイミング: 毎日 06:43 JST（定期）と Actions 画面の「Run workflow」（手動）。PR では単体テストと技術監査のみ（Search Console には触れない）。

## 安全設計

- **読み取り専用**: スコープは `webmasters.readonly`。URLの送信・登録リクエストは一切しない。
- **Indexing API 不使用**: 通常ページは対象外のため、コード上で `searchconsole.googleapis.com` 以外への送信を拒否し、テストでも確認。
- **登録リクエストは本人が正規画面で**: レポートの「未登録ページ」に Search Console の URL検査画面へのリンクを出すので、そこから「インデックス登録をリクエスト」を押す。リクエスト受理＝登録完了ではない。
- **非公開データを公開しない**: このリポジトリは公開のため、Actions のログ・Summary・Issue には件数と成否だけを出す。登録状況・検索語・クリック数などは AES-256 で暗号化してから artifact に保存。出力先がリポジトリ内なら停止する。
- **課金なし**: Search Console API は無料（クォータ制）。追加の有料サービス・pip パッケージなし（Python 標準ライブラリのみ）。
- **PC不要**: すべて GitHub のクラウド上で実行。
- **既存への影響なし**: `deploy-pages.yml`（波予報）や PR #80 のファイルは変更しない。サイトのHTMLも変更しない。

## 有効化（Search Console 読み取り部分）

認証が未設定の間、Search Console 部分は「未設定のためスキップ」となり、技術監査だけが動く。有効化には次のどちらか＋合言葉が必要（**いずれも新しい認証設定になるため、オーナー承認後に実施**）。

1. Google Cloud の既存プロジェクト（なければ無料で作成）で「Google Search Console API」を有効化する。課金設定は不要。
2. 認証方式を選ぶ
   - 推奨（鍵なし）: Workload Identity Federation を設定し、リポジトリの Variables に `GCP_WORKLOAD_IDENTITY_PROVIDER` と `GCP_SERVICE_ACCOUNT` を登録。
   - 簡易: サービスアカウントの JSON 鍵を Secret `GSC_SERVICE_ACCOUNT_JSON` に登録（鍵の管理が必要なため推奨度は下）。
3. Search Console の `https://kanto.rss7.net/` プロパティ →「設定」→「ユーザーと権限」で、そのサービスアカウントのメールアドレスを **「制限付き」** 権限で追加（読み取りに十分。所有者にはしない）。既存の所有権・プロパティは変更しない。
4. Secret `SEO_REPORT_PASSPHRASE` に長い合言葉を登録（レポートの暗号化用。忘れると復号できない）。
5. Actions →「SEO Monitor」→「Run workflow」で手動実行し、成功を確認。

## レポートの見方

1. Actions の実行結果ページ下部の Artifacts から `gsc-report-encrypted` をダウンロードして展開。
2. PC で `SEO_REPORT_PASSPHRASE='合言葉' bash scripts/seo/decrypt_report.sh gsc-report-*.tar.gz.enc` を実行。
3. `gsc-report-private/gsc-report.md`（読みやすい表）と `keyword-metrics.csv`（PR #80 の管理表を更新するための数値）ができる。どちらも公開しない。

技術監査の結果は暗号化されず、実行ページの Summary にそのまま表示される。

### 数値の注意

- Search Console のデータは2〜3日遅れのため、集計の終了日は「今日の3日前」。7日＝その日までの7日間、比較対象はその前の7日間（28日・90日も同様）。
- キーワードの「完全一致」はその語そのもの（空白や「・」の有無は同一視）。「関連」は地点名（「大洗・大貫」なら大洗／大貫のどちらか）と意図語（波情報など）を両方含む検索語の合計。
- 件数の少ない検索語は Google 側で匿名化されるため、開始直後は「-」が多くなる。
- 平均順位の前期比はマイナスが改善。

## 関西・九州への展開

スクリプトとワークフローはサイト固有の値を持たない。展開先リポジトリに次の4つをコピーし、`config/seo-monitor.json` だけ書き換える。

- `scripts/seo/`（seo_common.py / technical_audit.py / gsc_monitor.py / decrypt_report.sh）
- `tests/seo/test_seo_monitor.py`（関東の9地点と照合するテストは展開先のファイル構成に合わせて調整）
- `.github/workflows/seo-monitor.yml`
- `config/seo-monitor.json`（`base_url`・`gsc_property`・9地点URL・その他インデックス対象・noindex ページ・キーワード表のパス）

例: 関西は `https://kansai.rss7.net/` 配下の実URL、九州は `https://kyushu.rss7.net/` 公開後の実URLを、実サイトで確認してから記入する（推測で書かない）。サービスアカウントは同じものを各プロパティに「制限付き」で追加すれば使い回せる。

## 手元での実行

```bash
python3 tests/seo/test_seo_monitor.py                     # オフラインテスト
python3 scripts/seo/technical_audit.py --md-out /tmp/a.md # 本番の技術監査（ネット接続が必要）
```
