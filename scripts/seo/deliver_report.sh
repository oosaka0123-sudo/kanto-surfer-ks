#!/usr/bin/env bash
# 非公開レポートの受け渡し（GitHub Actions 内で実行）。結果の中身はログに出さない。
#
#   方式A（推奨・スマホ閲覧）: 非公開リポジトリへ保存
#     SEO_PRIVATE_REPO=owner/name  SEO_PRIVATE_REPO_TOKEN=<そのリポジトリだけ Contents:write の fine-grained token>
#     書き込み前に毎回「private であること」を API で確認し、公開リポジトリなら中止する。
#   方式B: age 公開鍵暗号（X25519 + ChaCha20-Poly1305、改ざん検知つき）した artifact
#     SEO_REPORT_AGE_RECIPIENT=age1...（公開鍵。秘密鍵は GitHub に置かない）
#
# 使い方: deliver_report.sh <レポートdir> <暗号化出力dir> <site_id>
# 終了コード: 0=少なくとも設定された全方式で成功 / 1=いずれか失敗 / 2=受け渡し方式が未設定
set -euo pipefail
src="${1:?report dir}"; enc_dir="${2:?encrypted output dir}"; site="${3:?site id}"
[ -f "$src/gsc-report.md" ] || { echo "レポートなし（受け渡しスキップ）"; exit 0; }
stamp=$(TZ=Asia/Tokyo date +%Y%m%d-%H%M); day=$(TZ=Asia/Tokyo date +%Y-%m-%d)
done_any=0; failed=0

if [ -n "${SEO_REPORT_AGE_RECIPIENT:-}" ]; then
  if [[ "$SEO_REPORT_AGE_RECIPIENT" != age1* ]]; then
    echo "::error title=レポート暗号化::SEO_REPORT_AGE_RECIPIENT が age 公開鍵（age1...）ではありません"; failed=1
  else
    command -v age >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq age >/dev/null; }
    mkdir -p "$enc_dir"
    if tar -C "$src" -czf - . | age -r "$SEO_REPORT_AGE_RECIPIENT" -o "$enc_dir/gsc-report-$site-$stamp.tar.gz.age"; then
      echo "暗号化 artifact を作成"; done_any=1
    else
      echo "::error title=レポート暗号化::age 暗号化に失敗"; failed=1
    fi
  fi
fi

if [ -n "${SEO_PRIVATE_REPO:-}" ]; then
  if [ -z "${SEO_PRIVATE_REPO_TOKEN:-}" ]; then
    echo "::error title=非公開リポジトリ::SEO_PRIVATE_REPO_TOKEN が未設定"; failed=1
  else
    meta=$(GH_TOKEN="$SEO_PRIVATE_REPO_TOKEN" gh api "repos/$SEO_PRIVATE_REPO" --jq '[.private, .default_branch] | @tsv' 2>/dev/null || true)
    is_private=$(cut -f1 <<<"$meta"); branch=$(cut -f2 <<<"$meta")
    if [ "$is_private" != "true" ]; then
      echo "::error title=非公開リポジトリ::保存先が private であることを確認できないため保存を中止しました"; failed=1
    else
      work="$RUNNER_TEMP/private-report-repo"; rm -rf "$work"
      if git clone -q --depth 1 "https://x-access-token:${SEO_PRIVATE_REPO_TOKEN}@github.com/${SEO_PRIVATE_REPO}.git" "$work" 2>/dev/null; then
        dest="$work/reports/$site"; mkdir -p "$dest/latest" "$dest/history"
        cp "$src"/gsc-report.md "$dest/latest/"; cp "$src"/gsc-report.json "$dest/latest/"
        [ -f "$src/keyword-metrics.csv" ] && cp "$src/keyword-metrics.csv" "$dest/latest/"
        cp "$src/gsc-report.md" "$dest/history/$day.md"
        git -C "$work" add -A
        if git -C "$work" -c user.name="ks-seo-monitor" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
             commit -q -m "SEO report $site $stamp" && git -C "$work" push -q origin "HEAD:refs/heads/${branch:-main}" 2>/dev/null; then
          echo "非公開リポジトリへ保存"; done_any=1
        else
          echo "::error title=非公開リポジトリ::保存（commit/push）に失敗"; failed=1
        fi
      else
        echo "::error title=非公開リポジトリ::clone に失敗（トークン権限を確認）"; failed=1
      fi
      rm -rf "$work"
    fi
  fi
fi

rm -rf "$src"   # 平文はランナーに残さない
[ "$failed" = 1 ] && exit 1
[ "$done_any" = 1 ] || { echo "::error title=レポート受け渡し::受け渡し方式が未設定"; exit 2; }
exit 0
