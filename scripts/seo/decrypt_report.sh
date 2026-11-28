#!/usr/bin/env bash
# age で暗号化された Search Console レポートを手元で復号する（方式B用）。
# 使い方: bash scripts/seo/decrypt_report.sh gsc-report-kanto-YYYYMMDD-HHMM.tar.gz.age [秘密鍵ファイル] [出力先]
#   秘密鍵ファイルの既定: ~/.config/ks-seo/age-key.txt（age-keygen で作ったもの。GitHubには置かない）
#   出力先の既定: ./gsc-report-private（.gitignore 済み）。復号した中身はコミット・公開しないこと。
# age は改ざんされたファイルの復号を拒否する（認証付き暗号）。
set -euo pipefail
in="${1:?暗号化ファイル(.age)を指定してください}"
key="${2:-$HOME/.config/ks-seo/age-key.txt}"
out="${3:-gsc-report-private}"
command -v age >/dev/null || { echo "age が必要です（https://github.com/FiloSottile/age ／ Ubuntu: sudo apt install age）"; exit 1; }
[ -f "$key" ] || { echo "秘密鍵が見つかりません: $key"; exit 1; }
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
age -d -i "$key" -o "$tmp" "$in"
mkdir -p "$out"
tar -xzf "$tmp" -C "$out"
echo "復号しました: $out/gsc-report.md（keyword-metrics.csv は Excel/スプレッドシートで開けます）"
