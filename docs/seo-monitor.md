# SEO登録・監視システム（GitHub Actions）

関連: Issue #32（作業管理）／PR #81（本システム）／PR #80（SEO改修・27キーワード表）／Issue #34（本番反映）

## 何をするか

| 処理 | 中身 | 結果の置き場所 |
|---|---|---|
| 技術監査（公開情報） | 全13 URL（トップ・9地点・about/contact/privacy）の HTTP 200、自己canonical、meta robots / X-Robots-Tag の noindex、robots.txt のクロール許可と Sitemap 行、sitemap.xml の過不足、noindex ページの除外、404・HTTP→HTTPS | Actions のログ・Summary・artifact（公開してよい） |
| Search Console 読み取り | URL検査API（13 URL を「登録済み／未登録／判定不能」に分類）、検索アナリティクスAPI（7日・28日・90日、それぞれ直前の同じ長さの期間と比較／サイト全体・9地点ページ別・重点27キーワード） | **非公開の保存先のみ**（下記「受け渡し方式」） |
| 通知 | 「技術監査」と「Search Console」を別々の Issue で通知。それぞれ本当に復旧したときだけ閉じる | Issue（公開してよい情報＝状態名だけ） |

実行タイミング: 毎日 06:43 JST（定期）と Actions 画面の「Run workflow」（手動）。Search Console と通知は **main ブランチでのみ** 動く。PR では単体テストと技術監査だけ。

## 安全設計

- **読み取り専用**: スコープは `webmasters.readonly`。URLの送信・登録リクエストは一切しない。
- **Indexing API 不使用**: 通常ページは対象外のため、コード上で `searchconsole.googleapis.com` 以外への送信を拒否し、テストでも確認。
- **登録リクエストは本人が正規画面で**: レポートの「未登録ページ」に URL と Search Console の検査画面リンクを出す。そこから「インデックス登録をリクエスト」を押す。リクエスト受理＝登録完了ではない。
- **認証は main 限定・鍵なし優先**: Workload Identity Federation（後述）を第一選択とし、Google 側でも「このリポジトリの main」以外からは認証できないよう条件を付ける。サービスアカウント鍵方式は既定で無効（`GSC_ALLOW_SA_KEY=true` を明示した例外時のみ）。
- **非公開データを公開しない**: このリポジトリは公開のため、ログ・Summary・Issue には状態名と件数だけを出す。出力先がリポジトリ内なら停止する。平文はランナー上から削除する。
- **誤判定をしない**: 取得失敗・応答欠損は「判定不能」で、未登録とは数えない。全件取得できなかったときに「未登録なし」とは表示しない。Google が行を返さない検索実績は「データなし」で、0件と区別する。一時エラー（429・5xx・通信断）は待ってから最大3回再試行する。
- **課金なし**: Search Console API は無料（クォータ制）。Python 標準ライブラリ＋Ubuntu 標準パッケージ `age` のみ。
- **PC不要**: すべて GitHub のクラウド上で実行。
- **既存への影響なし**: `deploy-pages.yml`（波予報）や PR #80 のファイルは変更しない。サイトのHTMLも変更しない。

## 受け渡し方式（少なくとも1つを設定。両方も可）

| | A. 非公開リポジトリ（推奨・スマホ閲覧） | B. age 暗号化 artifact |
|---|---|---|
| 見方 | GitHub アプリ／ブラウザで `reports/kanto/latest/gsc-report.md` を開くだけ | PC で `decrypt_report.sh` を実行して復号 |
| 守り方 | リポジトリを private に保つ。書き込み前に毎回 private であることを確認し、公開なら保存を中止 | X25519＋ChaCha20-Poly1305 の認証付き公開鍵暗号。改ざんされたファイルは復号を拒否。GitHub には公開鍵だけを置き、秘密鍵は置かない |
| 必要な設定 | Variable `SEO_PRIVATE_REPO`（例: `oosaka0123-sudo/ks-seo-reports`）、Secret `SEO_PRIVATE_REPO_TOKEN`（**そのリポジトリだけ**に Contents: Read and write を付けた fine-grained token） | Variable `SEO_REPORT_AGE_RECIPIENT`（`age-keygen -o age-key.txt` で表示される `age1...`） |
| 履歴 | `reports/kanto/history/YYYY-MM-DD.md` に日次で残る | artifact を90日保存 |

公開リポジトリの artifact は誰でもダウンロードし得る前提で設計している。方式Bでも中身は秘密鍵なしでは読めない。

## 有効化の手順（すべてオーナー承認後に実施）

1. Google Cloud の既存プロジェクト（なければ無料で作成）で「Google Search Console API」を有効化する。課金設定は不要。
2. サービスアカウントを作成する（鍵は作らない）。
3. Workload Identity Federation を作成する。プロバイダの条件（attribute condition）で、このリポジトリの main だけに限定する:
   ```
   assertion.repository_id == '1367444282' &&
   assertion.repository_owner_id == '281356293' &&
   assertion.ref == 'refs/heads/main'
   ```
   さらに、サービスアカウントの「Workload Identity ユーザー」権限を同じリポジトリの principalSet だけに付与する。
4. リポジトリの Variables に `GCP_WORKLOAD_IDENTITY_PROVIDER`（`projects/…/locations/global/workloadIdentityPools/…/providers/…`）と `GCP_SERVICE_ACCOUNT`（メールアドレス）を登録する。
5. Search Console の `https://kanto.rss7.net/` プロパティ →「設定」→「ユーザーと権限」で、サービスアカウントのメールアドレスを **「制限付き」** で追加する（所有者にはしない）。既存の所有権・プロパティは変更しない。
6. 受け渡し方式 A または B を設定する。
7. Actions →「SEO Monitor」→「Run workflow」（main）で手動実行し、Summary の state を確認する。

**未確認事項（実認証後に確認）**: 「制限付き」権限で URL検査API と検索アナリティクスAPIの両方が使えるか。使えない場合、レポートと Issue に「権限不足」と出る。そのときだけ「フル」へ変更を検討する。レポートの Search Console 検査画面リンク（`/search-console/inspect?resource_id=…&id=…`）が実際の画面で開けるかも、ログイン状態で確認する。開けない場合に備えて、URL を貼り付ける手順も併記している。

## 状態（state）と通知

| state | 意味 | Search Console Issue |
|---|---|---|
| `ok` | 取得・保存完了（検索データが「データなし」でも正常） | 開いていれば復旧コメントを付けて閉じる |
| `not_configured` | 認証未設定のためスキップ | 何もしない（開閉しない） |
| 手動で「GSCなし」実行 | ジョブ自体をスキップ | 何もしない |
| `misconfigured` | 認証はあるが受け渡し先が未設定 | 作成／追記 |
| `auth_error` | 認証失敗・権限不足 | 作成／追記 |
| `partial` / `failed` | 一部／全部の取得に失敗（再試行後） | 作成／追記 |
| `delivery_error` | 取得成功・非公開保存に失敗 | 作成／追記 |

技術監査の Issue は、技術監査の成否だけで開閉する。GitHub 標準の失敗メールも届く。

## レポートの読み方

- **登録状況**: 登録済み／未登録／判定不能。未登録ページには登録リクエスト用の URL とリンクがある。
- **検索実績**: 集計の終了日は「今日の3日前」（Search Console のデータ遅れのため）。7日＝その日までの7日間、比較対象はその直前の7日間（28日・90日も同様）。平均順位の前期比はマイナスが改善。
- **重点キーワード**: 「対象ページ」＝キーワード表の対象URLに表示された分だけ（検索語×ページ）。「サイト全体」＝どのページかを問わない合計（トップページでの表示なども含む）。完全一致＝その語そのもの（空白・「・」は無視）。関連＝地点名（「大洗・大貫」なら大洗／大貫のどちらか）と意図語の両方を含む語の合計。
- **キーワード表**: `docs/seo/priority-keywords.csv`（PR #80）。未マージの間は「未計測」と表示され、マージ後は自動で集計対象になる。
- **データなし**: Google が行を返さなかった（表示なし、または件数が少なく匿名化）。0件とは区別している。
- `keyword-metrics.csv` は PR #80 の管理表を更新するための数値（表計算ソフトで開ける）。

## 関西・九州への展開

スクリプトとワークフローはサイト固有の値を持たない。展開先リポジトリに次をコピーし、`config/seo-monitor.json` だけを書き換える。

- `scripts/seo/`（seo_common.py / technical_audit.py / gsc_monitor.py / deliver_report.sh / decrypt_report.sh）
- `tests/seo/test_seo_monitor.py`（関東の9地点と照合するテストは、展開先の構成に合わせて調整）
- `.github/workflows/seo-monitor.yml`
- `config/seo-monitor.json`（`site_id`・`base_url`・`gsc_property`・9地点URL・その他インデックス対象・noindex ページ・キーワード表のパス）

関西は `https://kansai.rss7.net/` 配下、九州は `https://kyushu.rss7.net/` 公開後の実URLを、実サイトで確認してから記入する（推測で書かない）。WIF の attribute condition は展開先リポジトリの ID で別に作る（使い回さない）。サービスアカウントは各プロパティに「制限付き」で追加すれば共用できる。非公開リポジトリ方式なら `reports/<site_id>/` に分かれて保存される。

## 手元での実行

```bash
python3 tests/seo/test_seo_monitor.py                     # オフラインテスト（age があれば暗号化往復も）
python3 scripts/seo/technical_audit.py --md-out /tmp/a.md # 本番の技術監査（ネット接続が必要）
bash scripts/seo/decrypt_report.sh gsc-report-kanto-*.tar.gz.age ~/.config/ks-seo/age-key.txt
```
