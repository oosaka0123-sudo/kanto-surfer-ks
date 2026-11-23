# 湘南港（D8）天文潮位データ

出典：気象庁「潮位表 湘南港（SHONANKO）」
https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=D8

- `D8-2026.txt` / `D8-2027.txt` は気象庁の年度別テキストデータ。
- 形式：https://www.data.jma.go.jp/kaiyou/db/tide/suisan/readme.html
- 予測潮位の単位は **cm、気象庁潮位表基準面上**。平均海面基準（MSL）や鵠沼の実測潮位ではない。
- 日付・時刻は JST。毎時0～23時の値と、日別の満潮・干潮の時刻・潮位を収録する。
- `scripts/tide_jma.php` が鵠沼用データに限定して、生成日から42日間を `source.tide` に組み込む。
- 地点が湘南港であることを必ずページに明記し、対応年が欠ける場合は表示しない（推測補完禁止）。
- 毎年、翌年分の公式テキストを検証して追加する。ファイル取得に失敗しても、欠測を別データで代替しない。
