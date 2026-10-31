#!/usr/bin/env bash
# =============================================================================
# selftest.sh — 安装包一键回归（不写真实工作区，全部在 mktemp 临时目录内完成）
#
# 覆盖：
#   1. bash -n 全部 setup shell 脚本
#   2. python3 -m py_compile patch.py（字节码写临时目录）
#   3. 临时副本工作区：sync-kit 同步（含主管技能目录与 improving-prompts 完整目录）→ 再同步幂等
#      → --check exit 0 + 转换断言 + 主管技能模板/references/templates/LICENSE 逐字节一致
#   4. 临时副本工作区：sync-kit --global（临时 DSH_HOME，完整技能目录 + 逐文件 .bak 备份）
#   5. 安装 a：全新目录（含主管技能目录 templates/ 与完整 improving-prompts 技能目录）
#   6. 安装 b：已有 AGENTS.md 不覆盖、生成 AGENTS.supervisor.md
#   7. 安装 c：--with-research --global-skill（含 6 份调研资料 + 完整技能目录）
#   8. 安装 d：重复安装幂等（第二次文件哈希不变）
#   9. python3 patch.py selftest（只读真实 DSH 安装，安全）
#  10. build-dist --out 临时目录（zip 可解压 + sha256 校验 + 清点 references/templates/合规文件）
#  11. 可选 UI 插件：client/host 语法 + 离线 smoke（注册断言 + 开关 endpoint 断言）
#  12. 兼容性/崩溃安全：Windows 路径逻辑模拟 + apply/HTTP 容错 + 双平台 Node 安装脚本
#  13. 安装器 dry-run：kit 两个安装器只预检/出计划，目标与 DSH_HOME 零写入
#  14. 安装器 force/版本：force 覆盖已装 AGENTS 且有 .bak；写入 .dsh/supervisor-kit.json 且版本正确
#  20. 安装 --with-setup：research/ 与 setup/ 工程化脚本齐全 + 重复安装幂等
#  15. 安装器预检：缺文件时 exit 非 0 且目标目录零写入
#  16. 安装器无 python3 依赖（kit sh 与 plugin sh 静态断言）
#  17. 插件安装器健壮性：dry-run 零写入、copy 安装 + sh 卸载、损坏 JSON 非 0
#
# 真实工作区的 `sync-kit.sh --check` 是必过检查（改源后必须先 sync；未同步会 FAIL）。
# 退出码：0 = 全部 PASS；1 = 有 FAIL。
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ps-kit-selftest.XXXXXX")"
TMP="$(cd "$TMP" && pwd)"   # 规范化路径（TMPDIR 可能以 / 结尾，避免双斜杠导致路径比对不一致）
LOG_DIR="$TMP/logs"
mkdir -p "$LOG_DIR"

PASS=0
FAIL=0
FAILED_LIST=""

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

pass() { PASS=$((PASS + 1)); echo "PASS  $1"; }
fail() {
  FAIL=$((FAIL + 1))
  FAILED_LIST="${FAILED_LIST}  - $1
"
  echo "FAIL  $1"
  if [ -n "${2:-}" ] && [ -f "$2" ]; then
    tail -n 8 "$2" | sed 's/^/      /'
  fi
}

run_check() { # $1=名称 $2=日志名 $3..=命令
  local name="$1" slug="$2"
  shift 2
  local log="$LOG_DIR/$slug.log"
  if "$@" >"$log" 2>&1; then
    pass "$name"
  else
    fail "$name" "$log"
  fi
}

# ---- 1) 全部 shell 脚本语法检查 --------------------------------------------
check_bash_syntax() {
  local f
  for f in "$SCRIPT_DIR"/*.sh; do
    [ -f "$f" ] || continue
    bash -n "$f" || return 1
  done
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    bash -n "$f" || return 1
  done < <(find "$SCRIPT_DIR/patches" -type f -name '*.sh' 2>/dev/null)
  return 0
}

# ---- 2) patch.py 语法检查 ---------------------------------------------------
check_pycompile() {
  PYTHONPYCACHEPREFIX="$TMP/pycache" python3 -m py_compile \
    "$SCRIPT_DIR/patches/team-permissions/patch.py"
}

# ---- 3) 临时副本工作区：sync 后 --check 必须一致 ---------------------------
prepare_workspace() { # $1=临时工作区目录（复制源文件 + setup/）
  local ws="$1"
  mkdir -p "$ws/.dsh/skills/project-supervisor" || return 1
  cp "$ROOT/AGENTS.md" "$ws/AGENTS.md" || return 1
  cp "$ROOT/主管手册.md" "$ws/主管手册.md" || return 1
  # 主管技能是完整技能目录：SKILL.md + templates/（plan/task-brief/ledger/review-gate）
  cp -R "$ROOT/.dsh/skills/project-supervisor/." "$ws/.dsh/skills/project-supervisor/" || return 1
  # improving-prompts 是完整技能目录：SKILL.md + LICENSE + references/ + templates/
  cp -R "$ROOT/.dsh/skills/improving-prompts" \
    "$ws/.dsh/skills/improving-prompts" || return 1
  cp -R "$ROOT/research" "$ws/research" || return 1
  cp -R "$SCRIPT_DIR" "$ws/setup" || return 1
  return 0
}

check_sync_temp() {
  local ws="$TMP/sync-ws" f b
  prepare_workspace "$ws" || return 1

  # 强制制造漂移：把 kit 副本覆盖成工作区专属版本，确保首跑必须产生「已同步」
  # （prepare_workspace 复制的是当前已同步的 setup/，若不制造漂移，首跑会 0 更新）
  cp "$ROOT/AGENTS.md" "$ws/setup/AGENTS.supervisor.md" || return 1
  cp "$ROOT/主管手册.md" "$ws/setup/主管手册.md" || return 1
  cp "$ROOT/.dsh/skills/project-supervisor/SKILL.md" "$ws/setup/skill/SKILL.md" || return 1
  mkdir -p "$ws/setup/skill/templates" || return 1
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    printf '\n<!-- drift -->\n' >>"$ws/setup/skill/templates/$tpl" || return 1
  done
  printf '# kit 中多余文件应被同步删除\n' >"$ws/setup/skill/templates/stale-extra.md" || return 1
  cp "$ROOT/.dsh/skills/improving-prompts/SKILL.md" "$ws/setup/skill-improving-prompts/SKILL.md" || return 1
  printf '\n<!-- drift -->\n' >>"$ws/setup/skill-improving-prompts/references/diagnosis.md" || return 1
  printf '# kit 中多余文件应被同步删除\n' >"$ws/setup/skill-improving-prompts/references/stale-extra.md" || return 1
  printf '\n<!-- drift -->\n' >>"$ws/setup/research/README.md" || return 1

  bash "$ws/setup/sync-kit.sh" >"$LOG_DIR/sync-first.log" 2>&1 || return 1
  grep -q '^已同步' "$LOG_DIR/sync-first.log" || return 1

  # 幂等：第二次同步不应再有任何「已同步」
  bash "$ws/setup/sync-kit.sh" >"$LOG_DIR/sync-second.log" 2>&1 || return 1
  if grep -q '^已同步' "$LOG_DIR/sync-second.log"; then return 1; fi

  # 同步后 --check 必须 exit 0
  bash "$ws/setup/sync-kit.sh" --check >"$LOG_DIR/sync-check.log" 2>&1 || return 1
  grep -q '结果: 全部一致' "$LOG_DIR/sync-check.log" || return 1

  # kit 转换不变量
  grep -q 'patches/team-permissions' "$ws/setup/AGENTS.supervisor.md" || return 1
  if grep -q 'setup/patches/team-permissions' "$ws/setup/AGENTS.supervisor.md"; then return 1; fi
  grep -q '本规则详细版' "$ws/setup/AGENTS.supervisor.md" || return 1
  grep -q '^  workspace: "\*"$' "$ws/setup/skill/SKILL.md" || return 1
  grep -q 'promptPolish' "$ws/setup/skill-improving-prompts/SKILL.md" || return 1
  grep -q '^已删除.*stale-extra.md' "$LOG_DIR/sync-first.log" || return 1
  # 主管技能目录：kit 含 templates/ 五个模板、非空、与源逐字节一致；多余模板文件已删除
  [ -d "$ws/setup/skill/templates" ] || return 1
  [ "$(find "$ws/setup/skill/templates" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "5" ] || return 1
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    [ -s "$ws/setup/skill/templates/$tpl" ] || return 1
    cmp -s "$ROOT/.dsh/skills/project-supervisor/templates/$tpl" \
      "$ws/setup/skill/templates/$tpl" || return 1
  done
  [ ! -e "$ws/setup/skill/templates/stale-extra.md" ] || return 1
  grep -q '^已删除.*skill/templates/stale-extra.md' "$LOG_DIR/sync-first.log" || return 1
  # 完整技能目录：LICENSE + references/（14）+ templates/（2）逐字节一致，多余文件已删除
  [ -f "$ws/setup/skill-improving-prompts/LICENSE" ] || return 1
  cmp -s "$ROOT/.dsh/skills/improving-prompts/LICENSE" \
    "$ws/setup/skill-improving-prompts/LICENSE" || return 1
  diff -r "$ROOT/.dsh/skills/improving-prompts/references" \
    "$ws/setup/skill-improving-prompts/references" >/dev/null || return 1
  diff -r "$ROOT/.dsh/skills/improving-prompts/templates" \
    "$ws/setup/skill-improving-prompts/templates" >/dev/null || return 1
  [ ! -e "$ws/setup/skill-improving-prompts/references/stale-extra.md" ] || return 1
  grep -q '<解压后的 project-supervisor-kit 目录>' "$ws/setup/主管手册.md" || return 1
  grep -q 'cd "$(dirname "$0")"   # 解压根目录' "$ws/setup/主管手册.md" || return 1
  if grep -q 'KIT=<HOME>/' "$ws/setup/主管手册.md"; then return 1; fi
  if grep -q '分享给朋友' "$ws/setup/主管手册.md"; then return 1; fi
  if grep -q '<HOME>/' "$ws/setup/AGENTS.supervisor.md" "$ws/setup/主管手册.md" "$ws/setup/skill-improving-prompts/SKILL.md"; then return 1; fi

  # --check 必须覆盖主管技能模板：制造模板漂移 → exit 1 且报「漂移」，同步后恢复一致
  printf '\n<!-- drift -->\n' >>"$ws/setup/skill/templates/plan.md" || return 1
  if bash "$ws/setup/sync-kit.sh" --check >"$LOG_DIR/sync-check-template-drift.log" 2>&1; then return 1; fi
  grep -q '^漂移    setup/skill/templates/plan.md' "$LOG_DIR/sync-check-template-drift.log" || return 1
  bash "$ws/setup/sync-kit.sh" >/dev/null 2>&1 || return 1
  bash "$ws/setup/sync-kit.sh" --check >"$LOG_DIR/sync-check.log" 2>&1 || return 1
  grep -q '结果: 全部一致' "$LOG_DIR/sync-check.log" || return 1

  # 调研副本与源逐字节一致（DECISIONS.md 不参与同步）
  for f in "$ROOT"/research/*.md; do
    b="$(basename "$f")"
    [ "$b" = "DECISIONS.md" ] && continue
    case "$b" in INCIDENT-*) continue;; esac
    cmp -s "$f" "$ws/setup/research/$b" || return 1
  done
  return 0
}

# ---- 4) sync-kit --global（临时 DSH_HOME） ---------------------------------
check_sync_global() {
  local ws="$TMP/global-ws" dsh="$TMP/dshhome" n
  local g="$dsh/skills/project-supervisor/SKILL.md"
  local gp="$dsh/skills/improving-prompts/SKILL.md"
  prepare_workspace "$ws" || return 1
  bash "$ws/setup/sync-kit.sh" >/dev/null 2>&1 || return 1

  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --global >"$LOG_DIR/global-first.log" 2>&1 || return 1
  [ -f "$g" ] || return 1
  [ -f "$gp" ] || return 1
  grep -q '^  workspace: "\*"$' "$g" || return 1
  grep -q 'promptPolish' "$gp" || return 1

  # 全局主管技能是完整目录：templates/ 五个模板非空且与源逐字节一致
  tpldir="$dsh/skills/project-supervisor/templates"
  [ -d "$tpldir" ] || return 1
  [ "$(find "$tpldir" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "5" ] || return 1
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    [ -s "$tpldir/$tpl" ] || return 1
    cmp -s "$ROOT/.dsh/skills/project-supervisor/templates/$tpl" "$tpldir/$tpl" || return 1
  done

  # 全局 improving-prompts 是完整目录：LICENSE + references（14）+ templates（2）
  [ -f "$dsh/skills/improving-prompts/LICENSE" ] || return 1
  [ -f "$dsh/skills/improving-prompts/references/diagnosis.md" ] || return 1
  [ -f "$dsh/skills/improving-prompts/templates/prompt-skeleton.md" ] || return 1
  grep -q 'Igor Wnek' "$dsh/skills/improving-prompts/LICENSE" || return 1
  n="$(find "$dsh/skills/improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
  [ "$n" = "14" ] || return 1
  diff -r "$ROOT/.dsh/skills/improving-prompts/references" \
    "$dsh/skills/improving-prompts/references" >/dev/null || return 1
  diff -r "$ROOT/.dsh/skills/improving-prompts/templates" \
    "$dsh/skills/improving-prompts/templates" >/dev/null || return 1

  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --check --global >"$LOG_DIR/global-check.log" 2>&1 || return 1
  grep -q '结果: 全部一致' "$LOG_DIR/global-check.log" || return 1

  # 制造旧文件 → --global 必须先备份再覆盖
  printf '# old global skill\n' >"$g"
  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --global >"$LOG_DIR/global-backup.log" 2>&1 || return 1
  grep -q '已备份' "$LOG_DIR/global-backup.log" || return 1
  ls "$dsh/skills/project-supervisor"/SKILL.md.bak.* >/dev/null 2>&1 || return 1

  # 全局技能模板同样先备份再覆盖
  printf '# old global template\n' >"$dsh/skills/project-supervisor/templates/plan.md"
  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --global >"$LOG_DIR/global-backup-tpl.log" 2>&1 || return 1
  ls "$dsh/skills/project-supervisor/templates"/plan.md.bak.* >/dev/null 2>&1 || return 1
  cmp -s "$ROOT/.dsh/skills/project-supervisor/templates/plan.md" \
    "$dsh/skills/project-supervisor/templates/plan.md" || return 1

  # improving-prompts 全局技能同样要先备份再覆盖（SKILL.md + references/ 逐文件）
  printf '# old global polish skill\n' >"$gp"
  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --global >"$LOG_DIR/global-backup2.log" 2>&1 || return 1
  ls "$dsh/skills/improving-prompts"/SKILL.md.bak.* >/dev/null 2>&1 || return 1
  printf '# old global reference\n' >"$dsh/skills/improving-prompts/references/diagnosis.md"
  DSH_HOME="$dsh" bash "$ws/setup/sync-kit.sh" --global >"$LOG_DIR/global-backup3.log" 2>&1 || return 1
  ls "$dsh/skills/improving-prompts/references"/diagnosis.md.bak.* >/dev/null 2>&1 || return 1
  cmp -s "$ROOT/.dsh/skills/improving-prompts/references/diagnosis.md" \
    "$dsh/skills/improving-prompts/references/diagnosis.md" || return 1
  return 0
}

# ---- 安装测试辅助 ----------------------------------------------------------
snapshot_tree() { # 输出目录内所有文件（相对路径+哈希，排序）
  ( cd "$1" && find . -type f -print | LC_ALL=C sort | while IFS= read -r f; do
      shasum -a 256 "$f"
    done )
}

# ---- 5) 安装 a：全新目录 ---------------------------------------------------
check_install_fresh() {
  local ws="$TMP/ws-fresh"
  mkdir -p "$ws"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" >"$LOG_DIR/install-fresh.log" 2>&1 || return 1
  [ -f "$ws/AGENTS.md" ] || return 1
  [ -f "$ws/主管手册.md" ] || return 1
  [ -f "$ws/.dsh/skills/project-supervisor/SKILL.md" ] || return 1
  [ -f "$ws/.dsh/skills/improving-prompts/SKILL.md" ] || return 1
  [ -f "$ws/.dsh/skills/improving-prompts/LICENSE" ] || return 1
  [ -f "$ws/.dsh/skills/improving-prompts/references/diagnosis.md" ] || return 1
  [ -f "$ws/.dsh/skills/improving-prompts/templates/prompt-skeleton.md" ] || return 1
  [ -f "$ws/.dsh/team-roster.md" ] || return 1
  [ -f "$ws/.dsh/team-ledger.md" ] || return 1
  grep -q 'Igor Wnek' "$ws/.dsh/skills/improving-prompts/LICENSE" || return 1
  grep -q 'promptPolish' "$ws/.dsh/skills/improving-prompts/SKILL.md" || return 1
  [ "$(find "$ws/.dsh/skills/improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "14" ] || return 1
  # 主管技能目录：templates/ 五个模板非空，且与 kit 逐字节一致
  [ -d "$ws/.dsh/skills/project-supervisor/templates" ] || return 1
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    [ -s "$ws/.dsh/skills/project-supervisor/templates/$tpl" ] || return 1
  done
  diff -r "$SCRIPT_DIR/skill/templates" "$ws/.dsh/skills/project-supervisor/templates" >/dev/null || return 1
  [ -f "$ws/patches/team-permissions/patch.py" ] || return 1
  grep -qF "workspace: \"$ws\"" "$ws/.dsh/skills/project-supervisor/SKILL.md" || return 1
  grep -q '项目主管' "$ws/AGENTS.md" || return 1
  return 0
}

# ---- 6) 安装 b：已有 AGENTS.md 不覆盖 --------------------------------------
check_install_existing() {
  local ws="$TMP/ws-existing" before after
  mkdir -p "$ws"
  printf '# 项目自有规则\n\n自定义内容。\n' >"$ws/AGENTS.md"
  before="$(shasum -a 256 "$ws/AGENTS.md" | cut -d' ' -f1)"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" >"$LOG_DIR/install-existing.log" 2>&1 || return 1
  [ -f "$ws/AGENTS.supervisor.md" ] || return 1
  after="$(shasum -a 256 "$ws/AGENTS.md" | cut -d' ' -f1)"
  [ "$before" = "$after" ] || return 1
  grep -q '自定义内容' "$ws/AGENTS.md" || return 1
  grep -q 'AGENTS.supervisor.md' "$LOG_DIR/install-existing.log" || return 1
  return 0
}

# ---- 7) 安装 c：--with-research --global-skill ----------------------------
check_install_with_research_global() {
  local ws="$TMP/ws-full" dsh="$TMP/dsh-full" n
  mkdir -p "$ws"
  DSH_HOME="$dsh" bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --with-research --global-skill \
    >"$LOG_DIR/install-full.log" 2>&1 || return 1
  [ -f "$ws/research/README.md" ] || return 1
  [ -f "$ws/research/01-vibe-coding-supervisor.md" ] || return 1
  [ -f "$ws/research/DECISIONS.md" ] || return 1
  n="$(find "$ws/research" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
  [ "$n" -ge 6 ] || return 1
  [ -f "$dsh/skills/project-supervisor/SKILL.md" ] || return 1
  [ -f "$dsh/skills/improving-prompts/SKILL.md" ] || return 1
  [ -f "$dsh/skills/improving-prompts/LICENSE" ] || return 1
  [ -f "$dsh/skills/improving-prompts/references/diagnosis.md" ] || return 1
  [ -f "$dsh/skills/improving-prompts/templates/improvement-report.md" ] || return 1
  grep -q 'Igor Wnek' "$ws/.dsh/skills/improving-prompts/LICENSE" || return 1
  [ "$(find "$ws/.dsh/skills/improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "14" ] || return 1
  [ "$(find "$dsh/skills/improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "14" ] || return 1
  grep -qF "workspace: \"$ws\"" "$ws/.dsh/skills/project-supervisor/SKILL.md" || return 1
  # 目标工作区与全局技能目录都含非空 templates/ 五个模板
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    [ -s "$ws/.dsh/skills/project-supervisor/templates/$tpl" ] || return 1
    [ -s "$dsh/skills/project-supervisor/templates/$tpl" ] || return 1
  done
  return 0
}

# ---- 8) 安装 d：重复安装幂等 ----------------------------------------------
check_install_idempotent() {
  local ws="$TMP/ws-repeat" dsh="$TMP/dsh-repeat"
  local h1 h2 g1 g2
  mkdir -p "$ws"
  DSH_HOME="$dsh" bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --with-research --global-skill \
    >"$LOG_DIR/install-repeat1.log" 2>&1 || return 1
  h1="$(snapshot_tree "$ws")"
  g1="$(snapshot_tree "$dsh/skills/project-supervisor")"
  DSH_HOME="$dsh" bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --with-research --global-skill \
    >"$LOG_DIR/install-repeat2.log" 2>&1 || return 1
  h2="$(snapshot_tree "$ws")"
  g2="$(snapshot_tree "$dsh/skills/project-supervisor")"
  [ "$h1" = "$h2" ] || return 1
  [ "$g1" = "$g2" ] || return 1
  return 0
}

# ---- 9) 权限补丁自测（只读真实 DSH 安装） -----------------------------------
check_patch_selftest() {
  python3 "$SCRIPT_DIR/patches/team-permissions/patch.py" selftest
}

# ---- 10) 打包校验 ----------------------------------------------------------
check_build() {
  local out="$TMP/dist" zip="$TMP/dist/project-supervisor-kit-2026-10-24.zip"
  local verify="$TMP/dist-verify" rel
  bash "$SCRIPT_DIR/build-dist.sh" --out "$out" --date "2026-10-24" \
    >"$LOG_DIR/build-dist.log" 2>&1 || return 1
  [ -f "$zip" ] || return 1
  [ -f "$zip.sha256" ] || return 1
  ( cd "$out" && shasum -a 256 -c "project-supervisor-kit-2026-10-24.zip.sha256" >/dev/null 2>&1 ) || return 1
  unzip -tq "$zip" >/dev/null 2>&1 || return 1
  mkdir -p "$verify"
  unzip -q "$zip" -d "$verify" || return 1
  local pkg="$verify/project-supervisor-kit-2026-10-24"
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    [ -f "$pkg/$rel" ] || return 1
  done <<EOF
install-supervisor.sh
AGENTS.supervisor.md
skill/SKILL.md
skill/templates/plan.md
skill/templates/task-brief.md
skill/templates/ledger.md
skill/templates/review-gate.md
skill-improving-prompts/SKILL.md
skill-improving-prompts/LICENSE
skill-improving-prompts/references/diagnosis.md
skill-improving-prompts/templates/prompt-skeleton.md
主管手册.md
朋友测试指南.md
THIRD_PARTY_NOTICES.md
patches/team-permissions/patch.py
research/README.md
LICENSE
安装说明.md
plugin/dsh-project-supervisor/package.json
plugin/dsh-project-supervisor/install-plugin.sh
plugin/dsh-project-supervisor/client.js
plugin/dsh-project-supervisor/LICENSE
EOF
  # 完整技能目录数量与合规文件内容
  [ "$(find "$pkg/skill-improving-prompts/references" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "14" ] || return 1
  [ "$(find "$pkg/skill-improving-prompts/templates" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "2" ] || return 1
  # 主管技能目录：templates/ 五个模板齐全且非空
  [ "$(find "$pkg/skill/templates" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')" = "5" ] || return 1
  for tpl in plan.md task-brief.md ledger.md review-gate.md wake-brief.md; do
    [ -s "$pkg/skill/templates/$tpl" ] || return 1
  done
  grep -q 'Igor Wnek' "$pkg/skill-improving-prompts/LICENSE" || return 1
  grep -q 'Igor Wnek' "$pkg/THIRD_PARTY_NOTICES.md" || return 1
  grep -q 'MIT License' "$pkg/THIRD_PARTY_NOTICES.md" || return 1
  grep -q 'sha256' "$pkg/朋友测试指南.md" || return 1
  grep -q '卸载' "$pkg/朋友测试指南.md" || return 1
  grep -q 'Copyright (c) 2026 dsh-project-supervisor contributors' "$pkg/plugin/dsh-project-supervisor/LICENSE" || return 1
  if grep -q 'workpsace' "$pkg/plugin/dsh-project-supervisor/LICENSE"; then return 1; fi
  # 包内不得有 <HOME>/ 绝对路径
  if grep -rEIl '<HOME>/[A-Za-z0-9._-]+' "$verify" >/dev/null 2>&1; then return 1; fi
  return 0
}

# ---- 11) 可选 UI 插件：client.js 语法 + 离线 smoke -------------------------
check_plugin() {
  local dir="$ROOT/plugin/dsh-project-supervisor"
  [ -d "$dir" ] || { echo "未找到可选 UI 插件目录（plugin/dsh-project-supervisor），跳过"; return 0; }
  node --check "$dir/index.js"
  node --check "$dir/client.js"
  node --check "$dir/install-plugin.mjs"
  ( cd "$dir" && node scripts/smoke.mjs && node scripts/host-smoke.mjs )

  # install / re-install / uninstall against a throwaway profile
  local home="$TMP/fake-dsh-home" manifest="$TMP/fake-dsh-home/profiles/web/package.json"
  mkdir -p "$home/profiles/web"
  printf '{"name":"web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n' > "$manifest"
  DSH_HOME="$home" bash "$dir/install-plugin.sh" >/dev/null
  DSH_HOME="$home" bash "$dir/install-plugin.sh" >/dev/null
  python3 - "$manifest" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
bundles = data['dsh']['profile']['bundles']
assert bundles.count('dsh-project-supervisor') == 1, bundles
assert data['dependencies'].get('dsh-project-supervisor', '').startswith('link:'), data['dependencies']
print('install ok: 1 dependency, 1 bundle entry')
PY
  local backups
  backups="$(find "$home/profiles/web/.backups" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
  [ "$backups" = "1" ] || { echo "重复安装不应重复备份，实际备份目录数：$backups"; return 1; }
  DSH_HOME="$home" bash "$dir/install-plugin.sh" --uninstall >/dev/null
  python3 - "$manifest" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as fh:
    data = json.load(fh)
assert 'dsh-project-supervisor' not in data['dependencies'], data['dependencies']
assert 'dsh-project-supervisor' not in data['dsh']['profile']['bundles'], data['dsh']['profile']['bundles']
print('uninstall ok: dependency and bundle entry removed')
PY
}

# ---- 12) 兼容性/崩溃安全（Windows 路径模拟 + Node 安装脚本） ---------------
check_compat() {
  node "$ROOT/plugin/dsh-project-supervisor/scripts/compat-check.mjs"
}

# ---- 13) 安装器 dry-run：零写入 --------------------------------------------
check_installer_dryrun() {
  local ws="$TMP/dry-ws" dsh="$TMP/dry-dsh"
  mkdir -p "$ws"
  node "$SCRIPT_DIR/install-supervisor.mjs" "$ws" --dry-run --with-research --with-setup --global-skill --dsh-home "$dsh" \
    >"$LOG_DIR/install-dryrun-mjs.log" 2>&1 || return 1
  [ -z "$(find "$ws" -mindepth 1 -print -quit)" ] || return 1
  [ ! -e "$dsh" ] || return 1
  grep -q '\[dry-run\]' "$LOG_DIR/install-dryrun-mjs.log" || return 1
  rm -rf "$ws"; mkdir -p "$ws"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --dry-run --with-research --with-setup \
    >"$LOG_DIR/install-dryrun-sh.log" 2>&1 || return 1
  [ -z "$(find "$ws" -mindepth 1 -print -quit)" ] || return 1
  return 0
}

# ---- 14) 安装器 force/版本记录 ---------------------------------------------
check_installer_force() {
  local ws="$TMP/force-ws" kit_version
  mkdir -p "$ws"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" >"$LOG_DIR/install-force1.log" 2>&1 || return 1
  [ -f "$ws/.dsh/supervisor-kit.json" ] || return 1
  kit_version="$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION")"
  grep -q "\"version\": \"$kit_version\"" "$ws/.dsh/supervisor-kit.json" || return 1
  printf '# 旧规则\n' > "$ws/AGENTS.md"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --force >"$LOG_DIR/install-force2.log" 2>&1 || return 1
  head -1 "$ws/AGENTS.md" | grep -q '项目主管作业规则' || return 1
  ls "$ws"/AGENTS.md.bak.* >/dev/null 2>&1 || return 1
  return 0
}

# ---- 15) 安装器预检失败 → 零写入 -------------------------------------------
check_installer_precheck() {
  local badkit="$TMP/bad-kit" ws="$TMP/precheck-ws"
  cp -R "$SCRIPT_DIR" "$badkit" || return 1
  rm -f "$badkit/skill/templates/plan.md"
  mkdir -p "$ws"
  if node "$badkit/install-supervisor.mjs" "$ws" >"$LOG_DIR/install-precheck.log" 2>&1; then return 1; fi
  [ -z "$(find "$ws" -mindepth 1 -print -quit)" ] || return 1
  grep -q '预检失败' "$LOG_DIR/install-precheck.log" || return 1
  return 0
}

# ---- 16) 安装器不得调用 python3（动态：PATH 前置假 python3，调用即失败）----
check_installers_no_python() {
  local bin="$TMP/fake-nopy-bin" ws="$TMP/nopy-ws" home="$TMP/nopy-dsh" plugin="$ROOT/plugin/dsh-project-supervisor"
  mkdir -p "$bin" "$ws" "$home/profiles/web"
  printf '#!/bin/sh\nexit 99\n' > "$bin/python3"
  chmod +x "$bin/python3"
  printf '{"name":"web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n' > "$home/profiles/web/package.json"
  printf '[]\n' > "$home/profiles/web/cordis.patch.yml"
  PATH="$bin:$PATH" bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" >"$LOG_DIR/nopy-kit.log" 2>&1 || return 1
  PATH="$bin:$PATH" DSH_HOME="$home" bash "$plugin/install-plugin.sh" >"$LOG_DIR/nopy-plugin.log" 2>&1 || return 1
  PATH="$bin:$PATH" DSH_HOME="$home" bash "$plugin/install-plugin.sh" --uninstall >"$LOG_DIR/nopy-plugin-un.log" 2>&1 || return 1
  return 0
}

# ---- 17) 插件安装器健壮性 ---------------------------------------------------
check_plugin_installer_robust() {
  local home="$TMP/fake-dsh-robust" manifest dir before
  manifest="$home/profiles/web/package.json"
  dir="$ROOT/plugin/dsh-project-supervisor"
  mkdir -p "$home/profiles/web"
  printf '{"name":"web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n' > "$manifest"
  before="$(shasum -a 256 "$manifest" | cut -d' ' -f1)"
  DSH_HOME="$home" node "$dir/install-plugin.mjs" --dry-run >/dev/null 2>&1 || return 1
  [ "$(shasum -a 256 "$manifest" | cut -d' ' -f1)" = "$before" ] || return 1
  [ ! -e "$home/profiles/web/node_modules/dsh-project-supervisor" ] || return 1
  DSH_HOME="$home" node "$dir/install-plugin.mjs" --copy >/dev/null 2>&1 || return 1
  [ -d "$home/profiles/web/node_modules/dsh-project-supervisor" ] || return 1
  DSH_HOME="$home" bash "$dir/install-plugin.sh" --uninstall >/dev/null 2>&1 || return 1
  [ ! -e "$home/profiles/web/node_modules/dsh-project-supervisor" ] || return 1
  printf 'not json' > "$manifest"
  if DSH_HOME="$home" bash "$dir/install-plugin.sh" >/dev/null 2>&1; then return 1; fi
  return 0
}

# ---- 20) 安装 --with-setup：research/ 与 setup/ 齐全且幂等 ------------------
check_install_with_setup() {
  local ws="$TMP/setup-install-ws" before
  mkdir -p "$ws"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --with-research --with-setup \
    >"$LOG_DIR/install-with-setup.log" 2>&1 || return 1
  [ -f "$ws/research/README.md" ] || return 1
  [ -f "$ws/research/DECISIONS.md" ] || return 1
  [ -f "$ws/setup/sync-kit.sh" ] || return 1
  [ -f "$ws/setup/selftest.sh" ] || return 1
  [ -f "$ws/setup/verify-facts.sh" ] || return 1
  [ -f "$ws/setup/build-dist.sh" ] || return 1
  [ -f "$ws/setup/一键安装口令.md" ] || return 1
  grep -q '"withSetup": true' "$ws/.dsh/supervisor-kit.json" || return 1
  grep -q '"withResearch": true' "$ws/.dsh/supervisor-kit.json" || return 1
  before="$(shasum -a 256 "$ws/setup/selftest.sh" | cut -d' ' -f1)"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" --with-research --with-setup >/dev/null 2>&1 || return 1
  [ "$(shasum -a 256 "$ws/setup/selftest.sh" | cut -d' ' -f1)" = "$before" ] || return 1
  return 0
}

# ---- 真实工作区同步状态：必过检查（改源后须先 sync） ----------------------------
# ============================================================================
echo "== 安装包自测（临时目录: ${TMP}）=="

run_check "bash -n 全部 shell 脚本"    bash-syntax    check_bash_syntax
run_check "python3 -m py_compile patch.py" pycompile  check_pycompile
run_check "临时副本：sync 同步幂等 + --check 一致 + 完整技能目录" sync-kit  check_sync_temp
run_check "临时副本：sync --global（完整目录）与 .bak 备份"    sync-global   check_sync_global
run_check "安装 a：全新目录（规则+完整技能+手册+补丁）" install-fresh   check_install_fresh
run_check "安装 b：已有 AGENTS.md 不覆盖并生成 AGENTS.supervisor.md" install-existing check_install_existing
run_check "安装 c：--with-research --global-skill（含完整技能目录）"  install-full  check_install_with_research_global
run_check "安装 d：重复安装幂等（文件哈希不变）"    install-repeat check_install_idempotent
run_check "python3 patch.py selftest（只读真实安装）" patch-selftest check_patch_selftest
run_check "build-dist：zip + sha256 + 必需文件/references/合规抽查"  build-dist    check_build
run_check "可选 UI 插件：client/host 语法 + smoke + 开关 endpoint" plugin check_plugin
run_check "兼容性：Windows 路径模拟 + 崩溃安全 + Node 安装脚本" compat check_compat

run_check "安装器 dry-run：kit 两安装器零写入 + 输出计划" installer-dryrun check_installer_dryrun
run_check "安装器 force/版本：覆盖已装 AGENTS 有 .bak + supervisor-kit.json 版本正确" installer-force check_installer_force
run_check "安装器预检：缺文件 exit 非 0 + 目标零写入" installer-precheck check_installer_precheck
run_check "安装器无 python3 依赖（kit sh / plugin sh）" installer-no-python check_installers_no_python
run_check "插件安装器健壮：dry-run/copy 安装/sh 卸载/损坏 JSON" plugin-installer-robust check_plugin_installer_robust
# ---- 19) 播种：已有名册/账本不被覆盖；mjs fresh 安装播种 ----
check_seed_no_overwrite() {
  local ws="$TMP/seed-ws" ws2="$TMP/seed-ws2"
  mkdir -p "$ws/.dsh" "$ws2"
  printf 'custom roster\n' > "$ws/.dsh/team-roster.md"
  printf 'custom ledger\n' > "$ws/.dsh/team-ledger.md"
  bash "$SCRIPT_DIR/install-supervisor.sh" "$ws" >"$LOG_DIR/seed-sh.log" 2>&1 || return 1
  grep -qx 'custom roster' "$ws/.dsh/team-roster.md" || return 1
  grep -qx 'custom ledger' "$ws/.dsh/team-ledger.md" || return 1
  node "$SCRIPT_DIR/install-supervisor.mjs" "$ws2" >"$LOG_DIR/seed-mjs.log" 2>&1 || return 1
  [ -f "$ws2/.dsh/team-roster.md" ] || return 1
  [ -f "$ws2/.dsh/team-ledger.md" ] || return 1
  grep -q '团队名册' "$ws2/.dsh/team-roster.md" || return 1
  grep -q '复用账本' "$ws2/.dsh/team-ledger.md" || return 1
  return 0
}

run_check "安装器播种：已有名册/账本不覆盖 + mjs fresh 播种" seed-no-overwrite check_seed_no_overwrite
run_check "安装 --with-setup：research/ 与 setup/ 脚本齐全 + 重复安装幂等" with-setup check_install_with_setup
run_check "真实工作区 sync-kit --check（改源后须先 sync）" real-sync bash "$SCRIPT_DIR/sync-kit.sh" --check

echo
echo "== 汇总 =="
printf 'PASS: %d  FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "结果: 全部通过"
else
  echo "失败项:"
  printf '%s' "$FAILED_LIST"
  echo "结果: 失败（$FAIL 项）"
  exit 1
fi
