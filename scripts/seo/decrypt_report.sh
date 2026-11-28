#!/usr/bin/env bash
# 暗号化された Search Console レポートを手元で復号する。
# 使い方: SEO_REPORT_PASSPHRASE='合言葉' bash scripts/seo/decrypt_report.sh gsc-report-YYYYMMDD-HHMM.tar.gz.enc [出力先]
# 出力先の既定は ./gsc-report-private（.gitignore 済み）。復号した中身はコミット・公開しないこと。
set -euo pipefail
in="${1:?暗号化ファイル(.enc)を指定してください}"
out="${2:-gsc-report-private}"
if [ -z "${SEO_REPORT_PASSPHRASE:-}" ]; then
  read -r -s -p "合言葉(SEO_REPORT_PASSPHRASE): " SEO_REPORT_PASSPHRASE; echo
  export SEO_REPORT_PASSPHRASE
fi
mkdir -p "$out"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:SEO_REPORT_PASSPHRASE -in "$in" | tar -xzf - -C "$out"
echo "復号しました: $out/gsc-report.md（keyword-metrics.csv は Excel/スプレッドシートで開けます）"
