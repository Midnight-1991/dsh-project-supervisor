#!/usr/bin/env bash
# =============================================================================
# build-dist.sh — 构建可分享的安装包 zip（脱敏 → 打包 → sha256 → 内容抽查）
#
# 只写 staging 与输出目录，绝不修改 setup/ 源文件。任何一步失败会删除半成品 zip。
#
# 用法：
#   bash build-dist.sh                    # 输出到 <工作区>/dist/project-supervisor-kit-<今天>.zip
#   bash build-dist.sh --out DIR          # 自定义输出目录
#   bash build-dist.sh --date YYYY-MM-DD  # 自定义包内日期（默认今天）
#
# 流程：
#   1) cp -R setup/ → staging/project-supervisor-kit-<date>/
#   2) 脱敏：把本机绝对路径（$HOME、~/<用户名>）替换为 ~，并断言无残留
#   3) zip -r 打包；同目录写 .zip.sha256（格式 `<sha>  <文件名>`）
#   4) 解压到临时目录，逐个抽查必需文件（含主管技能 5 个模板，含 wake-brief）+ references/templates 数量 + 合规文件
#   5) 打印 zip 路径、大小、sha256
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETUP_DIR="$SCRIPT_DIR"
OUT_DIR="$ROOT/dist"
DATE="$(date +%Y-%m-%d)"

usage() {
  sed -n '/^# 用法：/,/^# 流程：/p' "$0" | sed 's/^# \{0,1\}//'
}

die() { echo "错误: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || die "--out 需要目录参数"
      OUT_DIR="$2"; shift 2 ;;
    --out=*) OUT_DIR="${1#--out=}"; shift ;;
    --date)
      [ $# -ge 2 ] || die "--date 需要日期参数（YYYY-MM-DD）"
      DATE="$2"; shift 2 ;;
    --date=*) DATE="${1#--date=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数 $1（可用：--out DIR / --date YYYY-MM-DD / -h）" ;;
  esac
done

case "$DATE" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) die "--date 格式应为 YYYY-MM-DD：$DATE" ;;
esac

OUT_ABS="$(python3 -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' "$OUT_DIR")"
case "$OUT_ABS/" in
  "$SETUP_DIR"/*) die "输出目录不能位于 setup/ 内：$OUT_ABS" ;;
esac
mkdir -p "$OUT_ABS"

PKG_NAME="project-supervisor-kit-$DATE"
ZIP_PATH="$OUT_ABS/$PKG_NAME.zip"
SHA_PATH="$ZIP_PATH.sha256"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ps-kit-build.XXXXXX")"
STAGE="$(cd "$STAGE" && pwd)"
PKG_DIR="$STAGE/$PKG_NAME"

cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$ZIP_PATH" "$SHA_PATH"
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT

echo "== 构建分享包 =="
echo "  源目录: $SETUP_DIR"
echo "  输出:   $OUT_ABS"
echo "  包名:   $PKG_NAME"

# 0) 源文件与 kit 副本必须一致，否则不允许打包（避免发出漂移的包）
if [ -f "$SETUP_DIR/sync-kit.sh" ]; then
  if bash "$SETUP_DIR/sync-kit.sh" --check >/dev/null 2>&1; then
    echo "  同步:   通过（kit 副本与源文件一致）"
  else
    echo "  同步:   失败——kit 副本与源文件不一致，请先运行: bash $SETUP_DIR/sync-kit.sh" >&2
    exit 2
  fi
fi

# 1) staging
mkdir -p "$PKG_DIR"
cp -R "$SETUP_DIR/." "$PKG_DIR/"
WORKSPACE_DIR="$(cd "$SETUP_DIR/.." && pwd)"
if [ -d "$WORKSPACE_DIR/plugin/dsh-project-supervisor" ]; then
  mkdir -p "$PKG_DIR/plugin"
  cp -R "$WORKSPACE_DIR/plugin/dsh-project-supervisor" "$PKG_DIR/plugin/"
  echo "  plugin:  已包含可选 UI 插件 plugin/dsh-project-supervisor"
else
  echo "  plugin:  WARN 未找到 plugin/dsh-project-supervisor（分享包不含 UI 插件）"
fi
# 维护脚本随分享包分发（一键安装 --with-setup 需要）。本机标识由下方脱敏步骤统一替换；
# 不要在这里删除 sync-kit/selftest/verify-facts/build-dist/build-public-repo。
rm -rf "$PKG_DIR/public"
# 轻量化：内部评审报告（05/06/08/10/11）不随分享包分发；源仓库 research 与 review 记录仍保留
rm -f "$PKG_DIR"/research/05-*.md "$PKG_DIR"/research/06-*.md "$PKG_DIR"/research/08-*.md
rm -f "$PKG_DIR"/research/1[0-9]-*.md "$PKG_DIR"/research/INCIDENT-*.md
rm -rf "$PKG_DIR/research/review-public-repo"
echo "  staging: 已剔除内部评审/事故报告（保留公开 01–04/07/09 与 README）"
for public_doc in research/README.md 主管手册.md 安装说明.md CHANGELOG.md; do
  if grep -nE 'research/0[568]-|research/1[0-9]-|INCIDENT-|05-acceptance-review|06-beginner-guard|08-interview-review|10-hardening-review|11-installer-fixes-review|12-public-repo-review|13-team-reuse-review|14-publish-review' "$PKG_DIR/$public_doc" >/dev/null 2>&1; then
    die "公开文档仍引用内部评审: $public_doc"
  fi
done
public_research_count="$(find "$PKG_DIR/research" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$public_research_count" = "7" ] || die "公开 research 应为 7 个文件，实际 $public_research_count"
find "$PKG_DIR" -name '.DS_Store' -delete 2>/dev/null || true
rm -rf "$PKG_DIR/__pycache__"
echo "  staging: $PKG_DIR"

# 2) 脱敏 + 断言
SANITIZE_REPORT="$(python3 - "$PKG_DIR" "$HOME" <<'PY'
import re
import sys
from pathlib import Path

pkg = Path(sys.argv[1])
home = sys.argv[2]
pattern = re.compile(r"<HOME>/[A-Za-z0-9._-]+")

changed = 0
total = 0
hits = []
for p in sorted(pkg.rglob("*")):
    if not p.is_file():
        continue
    try:
        raw = p.read_bytes()
    except OSError:
        continue
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        continue
    total += 1
    new = text.replace(home, "~")
    new, _ = pattern.subn("~", new)
    # 本机标识脱敏（工作区名、用户名、旧术语），防止公开分享包泄露个人环境
    for old_value, new_value in (
        ("~/<workspace>", "~/<workspace>"),
        ("<workspace>", "<workspace>"),
        ("源工作区", "源工作区"),
        ("其他工作区", "其他工作区"),
        ("其他工作区", "其他工作区"),
        ("本地插件示例", "本地插件示例"),
        ("<redacted>", "<redacted>"),
        ("<redacted>", "<redacted>"),
        ("邮箱", "邮箱"),
        ("<user>", "<user>"),
    ):
        new = new.replace(old_value, new_value)
    if new != text:
        p.write_text(new, encoding="utf-8")
        changed += 1
    for m in pattern.finditer(new):
        hits.append(str(p.relative_to(pkg)) + " -> " + m.group(0))

print("文本文件 %d 个，替换 %d 个，残留 %d 处" % (total, changed, len(hits)))
for h in hits[:5]:
    print("  残留: " + h)
if hits:
    raise SystemExit(1)
PY
)" || die "脱敏后仍存在 <HOME>/ 绝对路径（见上）"
echo "  脱敏:   $SANITIZE_REPORT"

# 复核断言：staging 内不得出现 ~/<用户名> 形式的绝对路径
if grep -rEIl '<HOME>/[A-Za-z0-9._-]+' "$PKG_DIR" >/dev/null 2>&1; then
  grep -rEIl '<HOME>/[A-Za-z0-9._-]+' "$PKG_DIR" | sed 's/^/  残留: /' >&2
  die "staging 脱敏后仍有 <HOME>/ 绝对路径"
fi
echo "  断言:   staging 无 <HOME>/ 绝对路径"
if grep -rEIl '源工作区|其他工作区|<user>|<redacted>|邮箱|本地插件示例' "$PKG_DIR" >/dev/null 2>&1; then
  grep -rEIl '源工作区|其他工作区|<user>|<redacted>|邮箱|本地插件示例' "$PKG_DIR" | sed 's/^/  残留: /' >&2
  die "staging 仍有本机标识残留（工作区名/用户名/邮箱）"
fi
echo "  断言:   staging 无本机标识（工作区名/用户名/邮箱/旧术语）"

# 2.5) 统一文件权限：普通文件 644、脚本 755、目录 755（避免解压后 600 无法共享读取）
find "$PKG_DIR" -type d -exec chmod 755 {} +
find "$PKG_DIR" -type f -exec chmod 644 {} +
find "$PKG_DIR" -type f \( -name '*.sh' -o -name '*.mjs' \) -exec chmod 755 {} +

# 3) 打包 + sha256（先删旧包：zip -r 会保留已删除的旧条目）
rm -f "$ZIP_PATH" "$SHA_PATH"
( cd "$STAGE" && zip -r -q "$ZIP_PATH" "$PKG_NAME" )
[ -f "$ZIP_PATH" ] || die "zip 未生成：$ZIP_PATH"
( cd "$OUT_ABS" && shasum -a 256 "$PKG_NAME.zip" > "$PKG_NAME.zip.sha256" )
SHA="$(cut -d' ' -f1 "$SHA_PATH")"
echo "  打包:   $(basename "$ZIP_PATH") + $(basename "$SHA_PATH")"

# 4) 解压抽查必需文件
VERIFY_DIR="$STAGE/.verify"
mkdir -p "$VERIFY_DIR"
unzip -q "$ZIP_PATH" -d "$VERIFY_DIR" || die "zip 解压失败（打包损坏）"
PKG_VERIFY="$VERIFY_DIR/$PKG_NAME"
REQUIRED_FILES=(
  install-supervisor.sh
  install-supervisor.mjs
  sync-kit.sh
  selftest.sh
  verify-facts.sh
  build-dist.sh
  build-public-repo.sh
  AGENTS.supervisor.md
  skill/SKILL.md
  skill/templates/plan.md
  skill/templates/task-brief.md
  skill/templates/ledger.md
  skill/templates/review-gate.md
  skill/templates/wake-brief.md
  team-roster.template.md
  team-ledger.template.md
  skill-improving-prompts/SKILL.md
  skill-improving-prompts/LICENSE
  skill-improving-prompts/references/diagnosis.md
  skill-improving-prompts/templates/prompt-skeleton.md
  主管手册.md
  安装说明.md
  一键安装口令.md
  朋友测试指南.md
  THIRD_PARTY_NOTICES.md
  patches/team-permissions/patch.py
  research/README.md
  LICENSE
  plugin/dsh-project-supervisor/package.json
  plugin/dsh-project-supervisor/install-plugin.sh
  plugin/dsh-project-supervisor/install-plugin.mjs
  plugin/dsh-project-supervisor/scripts/compat-check.mjs
  plugin/dsh-project-supervisor/client.js
  plugin/dsh-project-supervisor/LICENSE
)
VERIFIED=0
for rel in "${REQUIRED_FILES[@]}"; do
  [ -f "$PKG_VERIFY/$rel" ] || die "zip 内缺少必需文件: $rel"
  VERIFIED=$((VERIFIED + 1))
done

# 主管技能目录：templates/ 四个工作流模板齐全且非空（随技能目录分发）
SUP_TPL_COUNT="$(find "$PKG_VERIFY/skill/templates" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$SUP_TPL_COUNT" = "5" ] || die "zip 内 skill/templates 应为 5 个 .md，实际 $SUP_TPL_COUNT"
for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
  [ -s "$PKG_VERIFY/skill/templates/$tpl" ] || die "zip 内 skill/templates/$tpl 缺失或为空"
done

# 完整技能目录：LICENSE + 14 个 references + 2 个 templates
REF_COUNT="$(find "$PKG_VERIFY/skill-improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$REF_COUNT" = "14" ] || die "zip 内 skill-improving-prompts/references 应为 14 个 .md，实际 $REF_COUNT"
TPL_COUNT="$(find "$PKG_VERIFY/skill-improving-prompts/templates" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$TPL_COUNT" = "2" ] || die "zip 内 skill-improving-prompts/templates 应为 2 个 .md，实际 $TPL_COUNT"
grep -q 'Igor Wnek' "$PKG_VERIFY/skill-improving-prompts/LICENSE" || die "skill-improving-prompts/LICENSE 缺少 Copyright (c) 2026 Igor Wnek"
grep -q 'Igor Wnek' "$PKG_VERIFY/THIRD_PARTY_NOTICES.md" || die "THIRD_PARTY_NOTICES.md 缺少 improving-prompts 版权信息"
grep -q 'MIT License' "$PKG_VERIFY/THIRD_PARTY_NOTICES.md" || die "THIRD_PARTY_NOTICES.md 缺少 MIT 全文"
grep -q 'sha256' "$PKG_VERIFY/朋友测试指南.md" || die "朋友测试指南.md 缺少 sha256 校验步骤"
grep -q '卸载' "$PKG_VERIFY/朋友测试指南.md" || die "朋友测试指南.md 缺少卸载步骤"
grep -q 'Copyright (c) 2026 dsh-project-supervisor contributors' "$PKG_VERIFY/plugin/dsh-project-supervisor/LICENSE" || die "插件 LICENSE 版权行应为 workspace"
if grep -q 'workpsace' "$PKG_VERIFY/plugin/dsh-project-supervisor/LICENSE"; then die "插件 LICENSE 仍有 workpsace 拼写错误"; fi
echo "  校验:   zip 可解压，必需文件 $VERIFIED/${#REQUIRED_FILES[@]} 通过；主管模板 $SUP_TPL_COUNT 个、references $REF_COUNT 个、templates $TPL_COUNT 个；合规检查通过"

# 5) 汇总
SIZE="$(wc -c < "$ZIP_PATH" | tr -d ' ')"
echo
echo "== 产物 =="
echo "  zip:    $ZIP_PATH"
echo "  大小:   $SIZE 字节（$((SIZE / 1024))KB）"
echo "  sha256: $SHA"
echo "  校验:   $SHA_PATH"
echo "  复核:   cd \"$OUT_ABS\" && shasum -a 256 -c \"$PKG_NAME.zip.sha256\""
