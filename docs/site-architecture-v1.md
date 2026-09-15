# 関東サーファー — Site Architecture v1

## 目的

現在の公開β「1ページ + 9地点切替」を維持したまま、将来のページ分割でURL変更やSEO構造の作り直しが起きないよう、最小限の恒久設計だけを先に固定する。

## 基本方針

- 現在の公開βは分割しない。
- 公開URLの恒久単位はスポットとする。
- 内部データキー `id` と公開URLキー `slug` は分離する。
- ランキング、地域ハブ、ガイドは必要条件が揃うまで作らない。
- 未検証の実ブレイクサイズ、点数、順位をSEOページへ出さない。
- 関西版のURL・点数ロジック・本番構造は変更しない。

## URLルール

すべて小文字ASCII、単語区切りはハイフン、末尾スラッシュを正規URLとする。

- `/` — 関東全体ハブ
- `/spots/{slug}/` — スポット個別
- `/about/` — サイト概要・データについて
- `/contact/` — お問い合わせ
- `/privacy/` — プライバシーポリシー

将来追加候補:

- `/regions/{slug}/` — 周辺ポイントDBが十分に増えた後
- `/guides/{slug}/` — 独自記事が十分に用意できた後
- `/rankings/` — 実ブレイクサイズ・点数ロジックの公開検証完了後のみ

## 永久slug

| 表示名 | internal id | public slug | 将来URL |
| --- | --- | --- | --- |
| 鵠沼 | `kugenuma` | `kugenuma` | `/spots/kugenuma/` |
| 由比ヶ浜 | `yuigahama` | `yuigahama` | `/spots/yuigahama/` |
| 大洗・大貫 | `oarai_onuki` | `oarai-onuki` | `/spots/oarai-onuki/` |
| 鹿嶋・平井 | `kashima_hirai` | `kashima-hirai` | `/spots/kashima-hirai/` |
| 片貝 | `katakai` | `katakai` | `/spots/katakai/` |
| 一宮 | `ichinomiya` | `ichinomiya` | `/spots/ichinomiya/` |
| 太東 | `taito` | `taito` | `/spots/taito/` |
| 御宿 | `onjuku` | `onjuku` | `/spots/onjuku/` |
| 鴨川・マルキ | `kamogawa_maruki` | `kamogawa-maruki` | `/spots/kamogawa-maruki/` |

slugは公開後に変更しない。名称変更が必要な場合もslugは維持し、表示名だけ変更する。

## フェーズ

### Phase 1 — 現在

- 1ページ + 9地点切替を継続。
- GitHub Pages / 毎時17分更新 / 8日モデル予報を維持。
- 既存の `?spot={id}` はβ内部状態として継続可。
- `noindex,nofollow` を維持。
- sitemapはまだ出さない。
- 個別URLは予約のみで生成しない。

### Phase 2 — 最初のページ分割

一括で次の13ページを生成する。

1. `/`
2. 9スポット `/spots/{slug}/`
3. `/about/`
4. `/contact/`
5. `/privacy/`

スポット9ページは同時公開し、途中段階の混在を作らない。

### Phase 3 — 後日

- 周辺スポットが増えた時のみ地域ハブを追加。
- 十分な独自本文がある時のみガイドを追加。
- ランキングはサイズ判定・点数・実波検証が公開可能になってから追加。

## 各ページの役割

### `/`

- 関東全体の入口。
- 9地点を中立順で一覧表示。
- 全スポット個別ページへの実リンクを持つ。
- 将来のランキングは検証完了後に要約のみ掲載。

### `/spots/{slug}/`

- スポット名、地域、モデル予報、風、うねり、公開可能な地点特性を表示。
- モデル波高と実ブレイクサイズを明確に分離する。
- 未検証の点数・順位を出さない。
- 同地域・近接スポットへの中立的なリンクを置く。

### `/about/`

- サイト概要。
- Open-Meteo等の利用データ、更新頻度、モデル値の意味、限界、検証方針を説明。
- SURF DATA CONTRACTの一般利用者向け要約を含める。

### `/contact/`

- 問い合わせ手段と、波予報が安全判断を保証しない旨を簡潔に記載。

### `/privacy/`

- アクセス解析、問い合わせ情報、Cookie等を実際に使う範囲だけ記載。
- 未導入サービスを先回りして記載しない。

## SEOルール

### β期間

- 現状の `noindex,nofollow` を維持。
- query/hashによる9地点切替状態はすべて `/` の同一ページとして扱う。
- β中はSearch Console向けsitemapを公開しない。

### index開始条件

次をすべて満たした後に一括でindex許可する。

1. 9スポット個別HTMLが静的生成されている。
2. 各ページに固有の title / description / H1 / canonical がある。
3. 9地点すべてで表示内容とデータ更新が本番QA済み。
4. モデル波高と実ブレイクサイズの区別が全ページで明示されている。
5. `/about/` `/contact/` `/privacy/` が公開済み。
6. 本番ホスト名が確定している。

### titleテンプレート

- Home: `関東サーファーKS｜関東9地点の波予報`
- Spot: `{スポット名}の波予報｜関東サーファーKS`
- About: `サイト概要・データについて｜関東サーファーKS`
- Contact: `お問い合わせ｜関東サーファーKS`
- Privacy: `プライバシーポリシー｜関東サーファーKS`

### canonical

- `/` は常にルート自身をcanonicalとする。
- query/hash切替をcanonicalに含めない。
- Phase 2の各ページはself canonical。
- absolute URLのhostはデプロイ設定から注入し、コードへ固定しない。

### sitemap / robots

- index解禁時に `/sitemap.xml` を生成する。
- 最初は `/` + 9 spots + about/contact/privacy のみ。
- noindexページはsitemapへ入れない。
- robots.txtでnoindex対象をDisallowしない。index制御はmeta robotsを正本とする。

## 内部リンク

Phase 2では以下を固定する。

- Home → 9 spots: 全件を通常の `<a>` で直接リンク。
- Spot → Home: ロゴ + breadcrumb。
- Spot → 9 spots: 共有スポット切替を通常リンクとして再利用。
- Spot → 近接/同地域spots: 品質順ではなく地理・固定順で表示。
- Footer → about/contact/privacy。

ランキング未検証中は「おすすめ」「BEST」「今日の1位」等、品質優劣を暗示する内部リンク文言を使わない。

## breadcrumb

Phase 2:

- `Home > スポット名`

Phase 3で地域ハブを導入してもスポットURLは移動させず、必要なら表示上のみ `Home > 地域 > スポット名` へ拡張する。

## 実装ルール

- Phase 2は物理的な静的HTML `/spots/{slug}/index.html` を生成する。
- SPAの404 rewriteだけでSEOページを作らない。
- Open-Meteo取得は現在どおりGitHub Actionsの定期ビルド側で行い、各訪問者ブラウザから9地点分を直接取得しない。
- 1回のビルドで共通データを取得し、複数HTMLへ展開する。
- URL生成は `slug`、データJSON参照は既存 `id` を使用する。

## 今は実装しないもの

- 10ページ以上への分割
- 地域ハブ
- ガイド記事の空ページ
- ランキングページ
- validatedでない実ブレイクサイズ・点数
- 関西版とのruntime統合

この文書はページ構成・URL・SEO・内部リンクの正本とし、実装開始前に変更が必要な場合は先にここを更新する。
