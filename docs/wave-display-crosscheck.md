# 波表示クロスチェック仕様 v1

## 目的
Open-MeteoのAPI値だけ、または単一の波情報ソースだけで公開用の波表示を確定しない。
API・実波観測・ポイント固有特性の3層を照合し、検証状態をvalidation recordに残す。

## 3層クロスチェック

### 1. API整合性 (`api_integrity`)
- raw snapshot と normalized snapshot の参照が残っていること。
- 対象スポットがnormalized snapshotに存在すること。
- 観測時刻に最も近いforecast hourを使うこと。
- 標準の許容差は90分以内とする。
- Marine/Weatherの実グリッド座標を記録すること。
- 同じMarine格子だから同じ実波と判断しないこと。

### 2. 実波ソース照合 (`observation_alignment`)
- ライブ、波情報、現地目視など実波側の根拠を記録する。
- 可能な場合は独立した2ソース以上で照合する。
- BCM / SurfPatrolは同一系統として1ソース扱いとする。
- 外部サービスの点数はKS点数へコピーしない。比較材料だけに使う。
- 1ソースだけの場合は原則 `warn` とし、確定値扱いしない。

### 3. ポイント特性照合 (`spot_context`)
- 海岸向き、有効うねり方向、岬・堤防・湾の遮蔽、風耐性を確認する。
- 近接ポイントでも同じ係数を無条件に使わない。
- API波高とライブ実波が大きく違う場合、まずポイント固有の地形・方向差を疑う。
- 地点別補正が未検証なら `pending` とする。

## 判定ルール
- 3項目すべて `pass` のときだけ `overall_status=pass` とする。
- 1項目でも `fail` があれば `overall_status=fail` とする。
- `pending` または `warn` が残る間は `overall_status=pending` とする。
- 将来の公開波表示・ランキング実装は、原則として `overall_status=pass` の検証データを補正根拠に使う。
- 未検証データを確定した実波として自動昇格させない。

## 現在のCLI
`scripts/create_validation_record.php` はnormalized Open-Meteoデータと観測を同時刻で結びつける。
作成直後は、API時刻照合のみ自動 `pass`、単一観測ソースは `warn`、ポイント特性は `pending`、全体は `pending` になる。

例:

```bash
php scripts/create_validation_record.php \
  --spot=kugenuma \
  --observed-at=2026-09-13T12:28:00+09:00 \
  --source-provider=manual \
  --source-kind=manual_visual \
  --wave-size='ヒザ〜モモ' \
  --wind-direction=オフショア
```

## 次段階
- 独立ソース追加・ポイント特性レビューを反映する更新CLIを追加する。
- 条件別のvalidation recordを蓄積する。
- 十分な実測比較後に地点別方向係数・遮蔽係数・風係数を決定する。
- その後にサイズ判定とランキング点数ロジックへ進む。
