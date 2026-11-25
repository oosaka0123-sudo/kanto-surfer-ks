# 関東9地点・朝夕記事 v2

朝7:30 JSTは当日の調査、夜19:30 JSTは翌日の予報。各1回の一括検索のみ。朝夕の保存先は独立し、過去のファイルも残す。v1は旧仕様（新規記事に使用しない）。

- 朝: content/research/morning/YYYY-MM-DD.json （対象当日）
- 夜: content/research/evening/YYYY-MM-DD.json （対象翌日）
- 本番: scripts/render_research_v2.cjs --root SITE --research-dir content/research --config config/representative-spots.json
- 当日朝優先。朝の情報不足時は前日夜の対象当日予報を「参考：昨夜の予報」と明示。翌日予報を別枠掲載。対象日以外のデータは表示しない。
- 9地点すべてに比較可能な情報があれば published、順位1〜9を重複なく。確認できた地点だけの場合 partial、順位配列は空。確認できた地点がなければ held、順位・記事は空。missing に不足地点と理由を保存する。held も保存する。全9地点は reports と missing のいずれか一方に必ず入る。
- 1地点の掲載には、地点固有の波予報または観測を少なくとも1件、対象日に有効な異なる発表元・上流データの出典を2件以上。公式の地域予報・注意報・潮汐は補助資料として明確に区別。海上モデル値は実測ブレイクサイズではない。海上モデルに基づく順位なら予報ベースと明記し、比較不能ならランキング保留。
- 発表時刻が不明なら issued_at: null。checked_at は実際の取得時刻（JST ISO秒）、target_date は対象日。対象が確認できない資料は使用しない。夜の翌日データは forecast のみ。現地観測なしの場合は observed としない。
- 同じ上流データの転載は独立出典扱いにしない。各出典に upstream（実際のデータ発表元）、scope（spot/region）、kind（forecast/observed/official_warning/tide）を付ける。未確認の発表元を独立と断定しない。
- 警報・注意報など確認された危険情報は warning と記事本文に記す。安全を保証しない。根拠不足時に数値や順位を補完しない。
- GitHub保存前に v2 の内容を確認し、保存後に再取得して SHA と内容を確認する。公開失敗時に検索を繰り返さない。公開側は既存ファイルを検証し、10ページの記事マーカー以外は変更しない。v2 は不正データを拒否し、既存の本番を変更しない。

## JSON 契約（構造例のみ、架空値は公開しない）

```json
{
  "schema_version": 2,
  "slot": "morning",
  "date": "YYYY-MM-DD",
  "generated_at": "YYYY-MM-DDTHH:MM:SS+09:00",
  "status": "partial",
  "rankings": [],
  "reports": {
    "kugenuma": {
      "title": "記事タイトル",
      "summary": "要約",
      "wave": "実測または予報と明記した波情報",
      "wind": "風情報",
      "confidence": "medium",
      "basis": "forecast",
      "paragraphs": ["分析", "注意点"],
      "sources": [
        {
          "name": "出典名",
          "url": "実際に取得した HTTPS URL",
          "upstream": "実際の独立した発表元",
          "scope": "spot",
          "kind": "forecast",
          "target_date": "YYYY-MM-DD",
          "issued_at": null,
          "checked_at": "YYYY-MM-DDTHH:MM:SS+09:00"
        }
      ]
    }
  },
  "missing": {
    "yuigahama": "不足理由"
  }
}
```

例は省略形。実際は reports と missing の和が9地点、各 report の sources は2〜8件。paragraphs は2〜5件。published の rankings は {rank,spot_id,summary} 9件。optional warning は文字列。confidence low/medium/high、basis forecast/observed/mixed。生成時刻は朝なら対象当日、夜なら対象日前日。判定の根拠とデータの実測/予報の区別を保持する。

## 試験
node tests/research_v2_smoke.cjs
